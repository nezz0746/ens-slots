# Per-subname terms, min-tenure visibility, the nonce bug, and address drift

Five pieces of work, smallest first. Parts 1 and 2 stand alone; Part 4 depends
on Part 3; Part 5 is a decision that must be made before either is deployed.

Everything below was checked against the code rather than assumed. Line
references are to the state of `strip-sponsor-layer` at `d295aab`.

---

## Part 1 — The nonce error

### What you saw

> Nonce provided for the transaction (31134) is lower than the current nonce of
> the account.

### It is not a masked revert

Worth settling first, because it changes the fix. A contract revert is caught
during simulation, before a transaction is signed — no nonce is consumed and
the error carries the custom error name, which `readReason` already translates
([use-tx.ts:160](../../apps/web/src/hooks/use-tx.ts)). "Not enough USDC" would
surface as `ERC20InsufficientAllowance` or similar, not as a nonce complaint.

A nonce error is a *send* error. It means two transactions were built from the
same account nonce, the first mined, and the second arrived stale.

### Root cause

There are **nine independent `useTx()` instances**, each with its own `pending`
flag and no knowledge of the others:

```
app/register/page.tsx          components/slot-panel.tsx
components/name-details.tsx    components/slot-label-form.tsx
components/usdc-widget.tsx     components/acquire-name.tsx
components/root-profile-editor.tsx
hooks/use-allowance.ts         hooks/use-collect-all.ts
```

Six of them are mounted at once on `/n/[address]`. Nothing anywhere in
`apps/web` passes a nonce or installs a nonce manager — `grep -rn nonce` on
`src` returns nothing — so viem fetches the nonce per request. Two writes
started before either mines get the same number.

The likely sequence for what you hit: the **`+100` USDC mint button lives in
the site header** and is clickable on every page, including while the buy form
is open. Mint, then buy a second later, and the buy is built against the
pre-mint nonce. That also explains why it felt like "not enough USDC" — the
mint is exactly what you'd have been doing.

### Fix

**A single in-flight lock shared by every `useTx`.** A module-level promise
queue that `send()` awaits before building a transaction, so writes from any
component serialise instead of racing. About 20 lines in `use-tx.ts`, no API
change for the nine call sites.

A viem `nonceManager` on the account is the other option and is wrong here: the
mock connectors used by the dev accounts don't route through a local account
object, so it would fix production and not the case you actually hit.

**Also translate the error.** Add to `readReason`:

```
/nonce/i → "Another transaction is still going through — give it a second."
```

Even with the lock, a wallet with its own queue can still produce this.

**Effort: ~1 hour.** Test by firing `+100` and a buy back to back.

---

## Part 2 — Minimum tenure is invisible

### What's there now

Minimum tenure is set **once**, on the register page, and applied to every slot
in the namespace via the hook:

```ts
hook: tenureSeconds > 0n ? addresses.minimumTenureHook : ZERO,
hookData: `0x${tenureSeconds.toString(16).padStart(64, "0")}`,
```

([register/page.tsx:178](../../apps/web/src/app/register/page.tsx))

After that it appears **nowhere**. `grep -rni tenure apps/web/src` finds it only
on the register page and as `tenureId`, which is the unrelated occupancy
counter. A buyer cannot see the guarantee they are getting.

Note this is *not* the "7d (min)" in the runway picker — that's
`minDepositSeconds`, the minimum escrow, a different number.

### Fix

`getSlotInfo` already returns `hook` and `hookData`; `toState` maps `hook` and
drops `hookData` ([use-namespaces.ts:80](../../apps/web/src/hooks/use-namespaces.ts)).

1. Map `hookData` into `SlotState`.
2. When `hook === addresses.minimumTenureHook`, decode it as a uint256 of
   seconds.
3. Show it as a fourth figure in `MarketFigures` — "Guaranteed 24h" — or beside
   the namespace's tax if it stays namespace-wide.

**Effort: ~1 hour.** No contract change.

---

## Part 3 — Per-label terms at open

### Where it stands

`_slotOne` copies the namespace's `_terms` into every slot and overrides
exactly two fields ([SlotNamespaceCuration.sol:76](../../apps/contracts/src/namespace/SlotNamespaceCuration.sol)):

```solidity
SlotInit memory init = _terms;
if (spec.hook != address(0)) {
    init.hook = spec.hook;
    init.hookData = spec.hookData;
}
```

So **per-label minimum tenure already works** — it is the hook's data, and
`LabelSpec` carries both. The UI simply sends `hook: ZERO` to inherit
([slot-label-form.tsx:73](../../apps/web/src/components/slot-label-form.tsx)),
and its own comment records that the control used to exist.

**Tax does not.** `init.taxBps` always comes from `_terms` and `LabelSpec` has
no field for it.

### Changes

1. Add `uint256 taxBps` to `LabelSpec`.
2. In `_slotOne`: `if (spec.taxBps != 0) init.taxBps = spec.taxBps;` — zero
   means inherit, matching how `hook` already behaves.
3. Update `slotLabel`'s signature to match.
4. `abis.ts`: add the field to `LABEL_SPEC` and `slotLabel`.
5. `slot-label-form.tsx`: per-row tax and tenure inputs, defaulting to inherit.

**`LabelSpec` is a calldata struct — it is never stored — so this is not a
storage layout change.** Only the ABI moves.

**Effort: ~2 hours** including tests.

---

## Part 4 — Terms that stay manageable

This is the one you asked about, and it is easier and safer than I first said,
because 0xSlots already solved the hard part.

### What 0xSlots gives you

`SlotAdmin` exposes exactly two functions:

```solidity
function proposeTerms(uint256 newTaxBps, address newHook, bytes32 newHookData,
                      bool changeTax, bool changeHook) external onlyManager;
function cancelTerms(bool cancelTax, bool cancelHook) external onlyManager;
```

Both only **queue**. Terms ripen for `TERMS_DELAY` (1 day) and then land **at
the next occupancy transition**. From its own docs:

> A manager cannot change anything under a sitting occupant.

That kills the objection I raised last time. An owner can never raise tax on
somebody who has already paid — the new terms apply to whoever takes the name
next. You do not have to design the governance; it is already right.

### Why it is impossible today

Three things, all set at creation and all currently closed
([register/page.tsx:174](../../apps/web/src/app/register/page.tsx)):

| Field | Now | Needed |
|---|---|---|
| `manager` | `ZERO` | the namespace contract |
| `mutableTax` | `false` | `true` |
| `mutableHook` | `false` | `true` |

`proposeTerms` is `onlyManager` and `manager` is the zero address, so nobody
can call it. Slots already created stay frozen forever — **this only affects
namespaces opened after the change**, which is worth saying out loud on the
register page.

### Changes

1. **`SlotNamespace.initialize`** — force `_terms.manager = address(this)`
   rather than accepting it from the caller. The namespace manages its own
   slots; the owner controls the namespace. Passing it in would let somebody
   open a namespace whose slots answer to a third party.
2. **`register/page.tsx`** — `mutableTax: true`, `mutableHook: true`, and drop
   `manager` from what the form sends.
3. **`ISlots.ISlot`** — add `proposeTerms` and `cancelTerms`.
4. **`SlotNamespaceCuration`** — two new `onlyOwner` functions:
   ```solidity
   function proposeLabelTerms(string calldata label, uint256 taxBps,
                              address hook, bytes32 hookData,
                              bool changeTax, bool changeHook) external onlyOwner;
   function cancelLabelTerms(string calldata label,
                             bool cancelTax, bool cancelHook) external onlyOwner;
   ```
   Both `_requireSlot(node)` then forward. No new storage.
5. **`abis.ts`** — the two new namespace functions, plus `pendingTaxBps`,
   `pendingHook`, `pendingHookData`, `pendingProposedAt` and `hasRipeTerms`,
   which `getSlotInfo` already returns and the app currently ignores.
6. **UI** — owner-only controls on the name page to queue a change, and a
   pending-terms notice visible to *everyone*, since a queued change is
   information a prospective buyer needs before they take the name.

### Constraints to respect

- `newTaxBps == 0` reverts (`InvalidTax`) — zero means "no change" in
  `LabelSpec` but is illegal in `proposeTerms`. Two different meanings for the
  same value; don't let the UI conflate them.
- `MAX_TAX_BPS` is `10_000`.
- A hook is validated at propose time — a hook that rejects its data is refused
  then, not silently attached.
- Hook and hook data move together. `newHookData` travels under `changeHook`.

### Storage

None of this adds namespace state. `LabelSpec` is calldata, the two new
functions are stateless forwards, and `manager` is a field of the *slot*, not
of the namespace. **No layout change beyond the one already pending** from
removing `kindOfNode`.

**Effort: ~4–6 hours** including tests and UI. The contract half is closer to
two; the honest cost is in the UI, because "terms are queued and land later" is
a state the app has never had to draw.

---

## Part 5 — Hook and factory addresses from the official package

### What I found, which is worse than a chore

`apps/contracts/src/Addresses.sol` hardcodes the 0xSlots addresses, and
`scripts/app-deployments.py` reads that file to build the web app's
`deployments.json`. So one hand-maintained Solidity file is the source of truth
for addresses this project does not own.

They have drifted. On Sepolia:

| | ens-slots hardcodes | `@0xslots/contracts` says |
|---|---|---|
| `SLOT_FACTORY` | `0x14df7d78…92E1cE` | `0x4416f23E…6E38483B` |
| `MINIMUM_TENURE_HOOK` | `0xB1e68532…18426c9C` | `0x32dc981b…CAd1Ba9F` |

Both pairs have live code on Sepolia and the two hooks are byte-identical in
size, so this is not broken — it is **pinned to an older deployment of the same
protocol**. The app works; it just is not on the deployment 0xSlots now
considers canonical, which means namespaces opened here do not share a factory
with anything else built on Slots.

`@0xslots/contracts` is published — npm `0.25.0`, and the checkout beside this
repo is `0.23.0` — and exports exactly what is needed as chain-keyed maps:

```ts
export const slotFactoryAddress = map("slotFactoryAddress");
export const minimumTenureHookAddress = map("minimumTenureHookAddress");
```

Each is `Partial<Record<number, Address>>`, already widened for runtime chain
ids, and already tolerant of "deployed nowhere".

### Changes

**TypeScript is easy.** Add `@0xslots/contracts` to `apps/web`, and have
`addressesFor` take `slotFactory` and `minimumTenureHook` from the package
rather than from `deployments.json`. The ENSv2 addresses stay where they are —
that is a different protocol with no package here.

**Solidity cannot import npm.** Two options:

- **(a) Generate `Addresses.sol` from the package.** A script reads
  `node_modules/@0xslots/contracts` and writes the constants, the same way
  `app-deployments.py` already writes `deployments.json`. The package becomes
  the source and the Solidity file becomes an artifact — inverting today's
  arrangement, where the artifact is the source. Add a check mode so CI (or
  `pnpm protocol`) fails when they disagree, the way the storage layout check
  already does.
- **(b) Pass them as deploy-script arguments.** More faithful, more moving
  parts at deploy time, and it leaves the test fork with nothing to read.

**(a)**, and it fits the existing pattern rather than adding a new one.

### The decision this forces

Moving to the official addresses means every namespace already opened against
`0x14df…` is orphaned — a different factory means different slots. There is
exactly one moment when that costs nothing: **the redeploy Parts 3 and 4
already require.** Doing it then is free; doing it later is a migration.

**Effort: ~2 hours**, plus re-seeding and one careful read of the diff the
generator produces the first time.


---

## Order

1. **Part 1** — a race that silently loses transactions is worse than a missing
   feature, and it is an hour.
2. **Part 2** — an hour, and it makes Part 3 legible, since per-label tenure is
   pointless if nobody can see tenure.
3. **Part 5** — decide it here, before anything is deployed. It changes which
   addresses Parts 3 and 4 deploy against, and it is free now and a migration
   later.
4. **Part 3** — small, and Part 4's UI wants the same inputs.
5. **Part 4** — the feature.

Parts 3, 4 and 5 all need a fresh deploy, and so does the `kindOfNode` removal
already sitting on this branch. That is **one** redeploy, not four — the whole
reason to settle Part 5 before starting rather than after.

## Deliberately not here

- **Changing terms under a sitting occupant.** 0xSlots refuses, and it is right
  to.
- **Per-label currency, recipient or `minDepositSeconds`.** All three are
  namespace-wide in `SlotInit` and none was asked for. `recipient` in
  particular is who gets paid — varying it per label is a different feature
  with its own argument.
