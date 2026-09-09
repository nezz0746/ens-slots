#!/usr/bin/env python3
"""
Regenerate the web app's address book from the contracts' own ledgers.

── Why generated, and from these two sources ────────────────────────────────

The app needs, per chain: the two addresses that were deployed there, plus the
addresses of everything it merely talks to. Those come from different places
and only one of them changes.

  apps/contracts/deployments/<chainId>/   what a deploy to that chain produced
  src/Addresses.sol                       the ENSv2 and 0xSlots constants

Both are already the truth for the Solidity side, so reading them is what keeps
the app from carrying a third copy that can silently disagree. The literals used
to be inlined in `seed.sh`, which meant the local chain got them right and a
Sepolia build had nowhere to get them from at all.

Every chain with a ledger directory becomes an entry, so the app is dual-network
by construction rather than by a flag: deploy to Sepolia and it appears.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGERS = ROOT / "apps/contracts/deployments"
ADDRESSES_SOL = ROOT / "apps/contracts/src/Addresses.sol"
OUT = ROOT / "apps/web/src/lib/deployments.json"

# Solidity constant → the key the app reads it under.
SHARED = {
    "ENS_VERIFIABLE_FACTORY": "ensVerifiableFactory",
    "ENS_USER_REGISTRY_IMPL": "ensUserRegistryImpl",
    "ENS_ETH_REGISTRY": "ensEthRegistry",
    "ENS_ETH_REGISTRAR": "ensEthRegistrar",
    "ENS_UNIVERSAL_RESOLVER": "ensUniversalResolver",
    "ENS_MOCK_USDC": "mockUsdc",
    "SLOT_FACTORY": "slotFactory",
    "MINIMUM_TENURE_HOOK": "minimumTenureHook",
}

# Ledger file → the key the app reads it under. Implementations are deliberately
# absent: the app talks to proxies, and naming an implementation here would
# invite somebody to call one directly.
DEPLOYED = {
    "SlotNamespaceFactory": "namespaceFactory",
    "SlotNamespaceResolver": "namespaceResolver",
}


def shared_addresses() -> dict[str, str]:
    source = ADDRESSES_SOL.read_text()
    found = {}
    for constant, key in SHARED.items():
        match = re.search(rf"constant\s+{constant}\s*=\s*(0x[0-9a-fA-F]{{40}})", source)
        if not match:
            sys.exit(f"Addresses.sol has no {constant} — did it get renamed?")
        found[key] = match.group(1)
    return found


def main() -> None:
    chains: dict[str, dict] = {}

    for directory in sorted(LEDGERS.glob("*")):
        if not directory.is_dir():
            continue
        entry = {"chainId": int(directory.name)}
        for name, key in DEPLOYED.items():
            record = directory / f"{name}.json"
            if not record.exists():
                break
            entry[key] = json.loads(record.read_text())["address"]
        else:
            chains[directory.name] = entry
            continue
        print(f"  skipped chain {directory.name} — an incomplete ledger")

    # `shared` is written whether or not anything is deployed anywhere. The chain
    # definitions in `chains.ts` need the Universal Resolver address to exist
    # before a single deploy has happened, and keying it per chain meant
    # removing a stale ledger took the chain definition down with it.
    OUT.write_text(
        json.dumps({"shared": shared_addresses(), "chains": chains}, indent=2) + "\n"
    )
    where = ", ".join(sorted(chains)) or "no chains yet"
    print(f"  wrote {OUT.relative_to(ROOT)} ({where})")


if __name__ == "__main__":
    main()
