![Nameslots — taxable subnames on ENS](./banner.png)

**Taxable subnames. Self-priced, continuously taxed, never squattable.**

Own `l2beat.eth`, open `base.l2beat.eth` to anyone. Whoever holds it sets its
own price, pays tax on that price continuously, and can be taken out by anyone
willing to pay it. Stop paying and you lose it.

One number does three jobs: what you say the name is worth, what you pay tax
on, and what anyone can buy it from you for. There is no number that lets you
sit on a good name for free.

Built on [ENSv2](https://docs.ens.domains/ensv2) and
[0xSlots](https://github.com/nezz0746/0xSlots), both live on Sepolia.

---

## Quick start

```bash
pnpm install
pnpm dev:local
```

Anvil forking Sepolia, contracts deployed and seeded, app on
[localhost:3000](http://localhost:3000). Use the dev bar to act as
Deployer / Alice / Bob / Carol, and to push the chain forward — buying a name
needs somebody to buy from, and running out of escrow needs time to pass.

```bash
cd apps/contracts
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com forge test
```

66 tests against a Sepolia fork, using the real ENS `VerifiableFactory`, the
real registry and the real `SlotFactory` — not mocks. Without
`SEPOLIA_RPC_URL` they skip rather than fail.

---

## Four ideas

**The name never moves.** A slotted subname stays registered to the namespace
contract permanently. What follows the holder is *resolution*: `addr()` returns
whoever occupies the slot, read at the moment you ask. A turnover writes
nothing to the registry, so nothing about it can fail.

**Authority and income follow the ENS name.** `owner()` is not stored — it is
`ethRegistry.ownerOf(...)` for the parent. Tax is paid to the namespace, and
`withdraw()` sends it to whoever owns the parent right now. Sell `l2beat.eth`
and both move to the buyer in the same block, with no transaction.

**Terms belong to the label.** There are no namespace defaults. Every label is
opened with its own tax rate and its own guaranteed run. The owner can change
either afterwards, but the change only *queues* — 0xSlots ripens it and applies
it at the next turnover, so nothing moves under somebody who already paid.

**Records belong to the tenancy.** Keyed by the slot's `tenureId`, so they
clear on turnover and do not come back if the same person retakes the name.

---

## What's in here

```
apps/contracts/   Foundry — contracts, fork tests, the deploy CLI
apps/web/         Next.js — the app
scripts/          the local stack: chain, seed, dev, protocol
ENSV2.txt         working reference for ENSv2, incl. what the docs get wrong
```

| Contract | |
|---|---|
| `SlotNamespace` | One parent name's subnames. Beacon proxy; assembled from `namespace/`. |
| `SlotNamespaceFactory` | The index, the beacon owner, and `open`. UUPS proxy. |
| `SlotNamespaceResolver` | One `IExtendedResolver` for every namespace. UUPS proxy. |

Only `SlotNamespaceBase` declares storage — that is what makes splitting a
beacon implementation across several files safe, since Solidity lays out base
storage in linearization order. New state is **appended above `__gap`**,
decrementing the gap to match. `pnpm protocol layout` is what enforces it.

---

## Does it resolve?

Yes, and it is ordinary ENS — no SDK, no API key, no contract address:

```ts
getEnsAddress({ name: "base.l2beat.eth" })            // → the current holder
getEnsText({ name: "base.l2beat.eth", key: "url" })   // → what they published
```

---

## Deploying

```bash
pnpm protocol status              # what is live (add --sepolia for Sepolia)
pnpm protocol deploy --sepolia
pnpm protocol upgrade --dry       # what an upgrade would change, sending nothing
pnpm protocol layout              # storage layout vs the committed snapshot
pnpm protocol addresses           # 0xSlots constants vs @0xslots/contracts
```

`status` reads the chain rather than the ledger and says so when the two
disagree. `upgrade` runs the layout check first and refuses a `version()` that
does not strictly increase. `deploy` and `upgrade` both check the addresses —
they drifted once, silently, because an old deployment is a working
deployment.

Sepolia needs `PRIVATE_KEY` and `SEPOLIA_RPC_URL`. Set `ADMIN` to hand the
upgrade keys to a multisig at deploy time. The ledger is
`apps/contracts/deployments/<chainid>/<Name>.json`, keyed by `block.chainid`,
so a local deploy can never overwrite the record of what is live.

The app needs `ALCHEMY_API_KEY` — reads are proxied through `/api/rpc` so the
key stays server-side.

---

## Status

Draft. Unaudited, built against contracts both projects still describe as
provisional. Don't put anything you care about behind it.

- **`admin` is one key.** It can upgrade the beacon, which changes the code
  running under every namespace — and that code now holds their tax.
  `transferAdmin` moves it to a multisig; that is the intended end state, not
  the current one.
- **Nothing tests the web app.** No TypeScript test runner here yet, so
  `apps/web` rests on `tsc` and on being used.

The app uses [ENS's palette](https://ens.domains/brand) and none of their
marks: their guidelines require a licence and forbid implying an endorsement
that doesn't exist. The symbol is our own.
