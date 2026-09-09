#!/usr/bin/env python3
"""
Compare the compiled storage layout of the upgradeable contracts against the
committed snapshot in `storage/`.

── Why this exists ──────────────────────────────────────────────────────────

`SlotNamespace` is a beacon implementation. Upgrading it reinterprets the
storage of every namespace in the system in one transaction, with no undo and no
partial failure — so a variable that moved is not a bug that gets found in
staging, it is every live namespace reading somebody else's data forever.

The tests cannot catch it either. A test deploys fresh storage and writes it
through the new code, so a layout that is internally consistent passes even when
it disagrees with what is on chain. Only a comparison against the PREVIOUS
layout catches a move, which is what this does.

── The rule it enforces ─────────────────────────────────────────────────────

Every variable in the snapshot must still be at the same slot, at the same
offset, with the same type. New variables may be APPENDED. Nothing else.

`__gap` is the single exception, and it has to be: appending a field is exactly
what a gap is for, so the gap slides up and shrinks every time somebody does it
right. What is checked there is the slot it ENDS at, which is the boundary it
exists to hold still. Append without decrementing the gap and that boundary
moves, which is the mistake, and it is reported as one.

    ./script/layout.py check      compare, exit non-zero on a break
    ./script/layout.py accept     write the current layout as the new snapshot
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOTS = ROOT / "storage"

# The three contracts behind a proxy. Anything not behind one has no layout to
# preserve, and adding it here would only produce noise on every edit.
CONTRACTS = {
    "SlotNamespace": "src/SlotNamespace.sol:SlotNamespace",
    "SlotNamespaceFactory": "src/SlotNamespaceFactory.sol:SlotNamespaceFactory",
    "SlotNamespaceResolver": "src/SlotNamespaceResolver.sol:SlotNamespaceResolver",
}


def compiled(target: str) -> list[dict]:
    """The layout forge reports, reduced to what upgrade safety depends on."""
    out = subprocess.run(
        ["forge", "inspect", target, "storage", "--json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env={"FOUNDRY_DISABLE_NIGHTLY_WARNING": "1", "PATH": __import__("os").environ["PATH"]},
    )
    if out.returncode != 0:
        sys.exit(f"forge inspect failed for {target}:\n{out.stderr}")

    data = json.loads(out.stdout)
    types = data.get("types") or {}
    return [
        {
            "label": e["label"],
            "slot": int(e["slot"]),
            "offset": e["offset"],
            # The resolved type name, not the internal id: ids carry an AST
            # node number that changes when an unrelated file is edited, which
            # would make every diff a false positive.
            "type": types[e["type"]]["label"] if e["type"] in types else e["type"],
        }
        for e in (data.get("storage") or [])
    ]


GAP = "__gap"


def gap_end(entry: dict) -> int:
    """The first slot AFTER the reserve — the number that must never change.

    A gap is the one variable that is SUPPOSED to move. Appending a field takes
    the slot the gap used to start at, so the gap slides up by one and shrinks
    by one, and the boundary it protects stays exactly where it was. Judging it
    by `slot` like anything else would flag every correct append as a break,
    which is the case this tool most needs to get right.
    """
    match = re.fullmatch(r"uint256\[(\d+)\]", entry["type"])
    if not match:
        raise SystemExit(f"{GAP} is {entry['type']}, expected uint256[N]")
    return entry["slot"] + int(match.group(1))


def check(name: str, target: str) -> list[str]:
    path = SNAPSHOTS / f"{name}.json"
    current = compiled(target)

    if not path.exists():
        return [f"{name}: no snapshot yet — run `pnpm protocol layout --accept`"]

    previous = json.loads(path.read_text())
    by_label = {e["label"]: e for e in current}
    if len(by_label) != len(current):
        return [f"{name}: two state variables share a name — this check keys on it"]

    problems = []

    for old in previous:
        new = by_label.get(old["label"])
        if new is None:
            problems.append(
                f"{name}.{old['label']} was REMOVED (was slot {old['slot']}). "
                "Removing a variable shifts everything after it."
            )
            continue

        if old["label"] == GAP:
            # May slide and shrink; may not move what comes after it.
            if gap_end(old) != gap_end(new):
                problems.append(
                    f"{name}.{GAP} now ends at slot {gap_end(new)}, not {gap_end(old)}. "
                    "Appending a field means decrementing the gap by the same number of slots."
                )
            continue

        for field in ("slot", "offset", "type"):
            if old[field] != new[field]:
                problems.append(
                    f"{name}.{old['label']} changed {field}: {old[field]} -> {new[field]}"
                )

    added = [e["label"] for e in current if e["label"] not in {p["label"] for p in previous}]
    if added and not problems:
        print(f"  {name}: appended {', '.join(added)} — gap absorbed it")

    return problems


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    SNAPSHOTS.mkdir(exist_ok=True)

    if mode == "accept":
        for name, target in CONTRACTS.items():
            (SNAPSHOTS / f"{name}.json").write_text(json.dumps(compiled(target), indent=2) + "\n")
            print(f"  wrote storage/{name}.json")
        return 0

    problems = []
    for name, target in CONTRACTS.items():
        problems += check(name, target)

    if problems:
        print("\nSTORAGE LAYOUT BROKEN\n")
        for p in problems:
            print(f"  {p}")
        print(
            "\nAppend new state immediately above `__gap` and decrement its size."
            "\nIf the change is deliberate and no proxy is live yet:"
            "\n  pnpm protocol layout --accept\n"
        )
        return 1

    print("  layout ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
