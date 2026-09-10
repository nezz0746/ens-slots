#!/usr/bin/env node
/**
 * Sync the 0xSlots constants in `Addresses.sol` with the published package.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Four of the addresses in `Addresses.sol` belong to a protocol this project
 * does not own. They were hand-copied, and by the time anybody checked, three
 * of the four had drifted — SLOT_FACTORY, SLOT_IMPLEMENTATION and
 * MINIMUM_TENURE_HOOK all named an older deployment, and two of them were the
 * package's LOCAL anvil entry rather than its Sepolia one. Nothing failed,
 * which is the problem: the app worked perfectly against a version of Slots
 * that nothing else was using any more.
 *
 * `@0xslots/contracts` publishes them per chain. This makes the package the
 * source and the Solidity file the artifact, which is the way round the
 * storage-layout snapshot already works. `deployments.json` is generated from
 * `Addresses.sol` in turn, so the app inherits the package without importing
 * it — one chain of derivation with one source at the top of it, rather than
 * the app and the contracts each reading the package and being able to
 * disagree about which version they read.
 *
 * ── Why every chain reads the SEPOLIA entry ─────────────────────────────────
 *
 * This project runs on two chains and both of them are Sepolia. Chain 31337
 * here is `anvil --fork-url <sepolia>`, so the contracts present on it are
 * Sepolia's — the package's own 31337 entry is 0xSlots' local deployment,
 * which does not exist on our fork. Checked rather than assumed: their 31337
 * SlotFactory has no code on our chain, and their Sepolia one does.
 *
 * ── What it does NOT touch ──────────────────────────────────────────────────
 *
 * The ENS_* constants. Those are the ETHOnline hackathon ENSv2 deployment,
 * a different protocol with no package to read, and they stay hand-maintained.
 *
 *     ./scripts/slots-addresses.mjs check    compare, exit non-zero on drift
 *     ./scripts/slots-addresses.mjs write    adopt the package's addresses
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOL = join(ROOT, "apps/contracts/src/Addresses.sol");
const PKG = join(ROOT, "node_modules/@0xslots/contracts");

/** The chain whose deployment both of our chains actually run against. */
const SEPOLIA = 11155111;

/** Solidity constant ← the package's export that owns it. */
const SYNCED = {
  SLOT_FACTORY: "slotFactoryAddress",
  SLOT_IMPLEMENTATION: "slotImplementationAddress",
  MINIMUM_TENURE_HOOK: "minimumTenureHookAddress",
  ADLAND_HOOK: "adLandAddress",
};

const mode = process.argv[2] ?? "check";

const pkg = await import(join(PKG, "dist/index.js"));
const version = JSON.parse(await readFile(join(PKG, "package.json"), "utf8")).version;

let sol = await readFile(SOL, "utf8");
const drift = [];

for (const [constant, exportName] of Object.entries(SYNCED)) {
  const want = pkg[exportName]?.[SEPOLIA];
  if (!want) {
    console.error(`  ${exportName} has no ${SEPOLIA} entry in @0xslots/contracts@${version}`);
    process.exit(1);
  }

  const re = new RegExp(`(constant ${constant} = )(0x[0-9a-fA-F]{40})`);
  const found = sol.match(re);
  if (!found) {
    console.error(`  ${constant} is not in Addresses.sol`);
    process.exit(1);
  }

  if (found[2].toLowerCase() !== want.toLowerCase()) {
    drift.push({ constant, from: found[2], to: want });
    sol = sol.replace(re, `$1${want}`);
  }
}

if (mode === "check") {
  if (!drift.length) {
    console.log(`\n  0xSlots addresses match @0xslots/contracts@${version}\n`);
    process.exit(0);
  }
  console.error(`\n  0xSlots ADDRESSES HAVE DRIFTED from @0xslots/contracts@${version}\n`);
  for (const d of drift) console.error(`  ${d.constant}\n    have ${d.from}\n    want ${d.to}`);
  console.error(`\n  ./scripts/slots-addresses.mjs write   to adopt the package's\n`);
  process.exit(1);
}

if (mode !== "write") {
  console.error(`unknown mode: ${mode} (want "check" or "write")`);
  process.exit(1);
}

if (!drift.length) {
  console.log(`\n  already matches @0xslots/contracts@${version}\n`);
  process.exit(0);
}

await writeFile(SOL, sol);
console.log(`\n  adopted @0xslots/contracts@${version}\n`);
for (const d of drift) console.log(`  ${d.constant}\n    ${d.from}\n → ${d.to}`);
console.log(
  "\n  Addresses.sol changed. Re-run the deploy and `scripts/app-deployments.py`;\n" +
    "  namespaces opened against the old factory are on a different protocol.\n",
);
