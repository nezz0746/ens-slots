# ens-slots

**Rentable ENS subnames — self-priced, always for sale, never squattable.**

A parent name's owner opens some of its subnames to a market. Whoever holds
`slot-1.l2beat.eth` sets its price, pays tax on that price continuously, and
can be taken out by anyone willing to pay it. Stop paying and you lose it.
Every other subname under that parent is untouched.

The name itself never moves. What follows the holder is *resolution*: `addr()`
is whoever occupies the slot, read at the moment the question is asked, so a
turnover has nothing to do and nothing that can fail. Records are the
occupant's and scoped to their tenancy. No SDK, no API key, no permission —
this is ordinary ENS all the way down.

Built on [ENSv2](https://docs.ens.domains/ensv2) and
[0xSlots](https://github.com/nezz0746/0xSlots), both deployed on Sepolia — so
the tests aren't mocks, they run against the live contracts.

---

## Quick start

```bash
pnpm install
pnpm dev:local
```

One command: anvil forking Sepolia → contracts deployed and seeded → app on
[localhost:3000](http://localhost:3000).

Click **Deployer / Alice / Bob / Carol** in the header to act as any of them,
and **+1d / +7d / +30d** to push the chain forward. Buying a name needs
somebody to buy from; running out of escrow needs time to pass.

```bash
cd apps/contracts
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com forge test
```

57 tests against a Sepolia fork, split the way the contracts are: what a
namespace does, what the factory opens, what the resolver answers, and what
survives an upgrade. A real `UserRegistry` deployed through ENS's real
`VerifiableFactory`, real slots from the real `SlotFactory`, and the whole
proxy stack stood up exactly as `pnpm protocol deploy` stands it up. Without
`SEPOLIA_RPC_URL` they skip rather than fail.

---

## How it works

```
SlotNamespaceFactory ──beacon──▶ SlotNamespace          one proxy per parent name
  (UUPS proxy)         │              │
      │                │             registers
      │                └──index──┐    ▼
      │                          │  UserRegistry (ENSv2)
      └──deploys the registry────┘    ▲
                                      │ resolver
SlotNamespaceResolver ────────────────┘                 one, for every namespace
  (UUPS proxy)
```

**The name never moves.** `SlotNamespace` registers each slotted label to
itself, permanently, and keeps it. What follows the holder is *resolution*:
`addr()` is the slot's current occupant, read at the moment the question is
asked.

Two things fall out of that:

- **Nothing happens on a turnover, so nothing can fail.** Moving the token
  would mean doing it from inside a hook — gas-capped, and allowed to fail
  silently — leaving the name pointing at someone who no longer holds it.
- **The slot's one hook stays free** for a minimum tenure, an eligibility rule,
  or anything else.

The cost, which the UI states plainly: **a holder never owns a name NFT.** They
can't sell or transfer it. Occupancy is the only market for the position.

Records are scoped to the tenancy. Set an avatar, lose the slot, and it's gone
— and it does not come back if you later retake the name, because records are
keyed by the slot's `tenureId` rather than by your address.

Names never expire (`type(uint64).max`). The tax and liquidation already
recycle an abandoned slot, so `ROLE_RENEW` is never granted to anything.

### Upgradeable, deliberately

Every contract that holds state is behind a proxy, because this is built on two
protocols that both describe their interfaces as provisional — the ENS docs
carry a standing "not yet final" warning on every page.

| | pattern | upgrading it |
|---|---|---|
| `SlotNamespaceFactory` | UUPS | one proxy, one call |
| `SlotNamespaceResolver` | UUPS | one proxy, one call |
| `SlotNamespace` | **beacon** | one call, **every namespace at once** |

The third is the one that matters and the one with no undo: `upgradeBeacon`
reinterprets the storage of every namespace in the system in a single
transaction, and nothing runs afterwards to notice a mistake. Three things
guard it:

- **`pnpm protocol layout`** diffs the compiled storage layout against a
  committed snapshot. It is the only check that can catch a moved variable,
  because a test writes fresh storage through new code and passes either way.
- **A version gate.** `version()` is a constant compiled into each
  implementation, and the upgrade script refuses anything that does not
  strictly increase — which turns "shipped a stale branch" into a failed run.
- **A live witness.** The upgrade reads a real namespace through the old code
  and again through the new one, and reverts the run if anything differs.

Say the obvious thing plainly: while one key holds `admin`, that key can change
the code running under every curator's name. That is the right trade this week
and the wrong one forever; `transferAdmin` hands it to a multisig.

### One resolver, not one per namespace

There used to be a resolver deployed beside each namespace, holding an
immutable pointer to it. The shared one finds the namespace from the *name* —
hash the whole thing and ask the factory, and on a miss hash it again from the
second label.

That is worth more than the deployment it saves. A resolver's address is written
into an ENS registry entry at registration, so replacing a per-namespace
resolver meant a `setResolver` for every slotted label. One shared resolver
behind a proxy is upgraded in place, and the address in every registry entry
stays correct forever.

### Opening a namespace is one transaction

It was four: deploy a subname registry, open the namespace, grant it two roles,
point it at a resolver. `SlotNamespaceFactory.open` does all four, and can slot
the first labels while it is there.

The roles are why it works. They go in the registry's **own initializer**
rather than a call afterwards, which is possible because the namespace's
address is known before the registry exists — its proxy is created empty and
initialized at the end of the same call.

What no contract can do for you is `setSubregistry` on the `.eth` registry;
that belongs to whoever owns the parent name. For a name being bought now it is
free, because ENS derives the registry's address by CREATE2 and the registrar's
own `register` takes it as an argument.

Batching, once a namespace is open:

```
slotLabels([...])            several labels, one signature
setTexts(node, keys, values) an occupant's whole payload
setParentTexts(keys, values) the namespace's whole profile
multicall([...])             mixed — labels plus a profile
```

`multicall` delegatecalls into the namespace, which preserves `msg.sender`, so
`onlyOwner` still applies to every inner call and it confers nothing.

Calls to *different* contracts — approving an ERC20 and then registering with
it — can only be batched by the wallet. The app uses EIP-5792 where the wallet
supports it and falls back to one signature at a time where it does not.

## What's in here

```
apps/contracts/     Foundry — the contracts, the fork tests, the deploy CLI
apps/web/           Next.js — the app
scripts/            the local stack: chain, seed, dev, protocol
ENSV2.txt           working reference for ENSv2, incl. what the docs get wrong
```

| Contract | |
|---|---|
| `SlotNamespace` | One parent name's subnames. Beacon proxy; assembled from `namespace/`. |
| `namespace/SlotNamespaceBase` | The state, and the only file that declares any. |
| `namespace/SlotNamespaceCuration` | What the owner may do: open labels, close them. |
| `namespace/SlotNamespaceRecords` | What occupants and the owner may write. |
| `namespace/SlotNamespaceViews` | What anyone may read. |
| `SlotNamespaceFactory` | The index, the beacon owner, and `open`. UUPS proxy. |
| `SlotNamespaceResolver` | One `IExtendedResolver` for every namespace. UUPS proxy. |
| `upgrades/` | `version()`, and what every UUPS singleton here shares. |
| `interfaces/` | The ENSv2 and 0xSlots surfaces we call, hand-written and verified against the deployments. |

Only `SlotNamespaceBase` declares storage. That is what makes splitting a
beacon implementation across four files safe: Solidity lays out base storage in
linearization order, so state spread across several bases would have its slots
decided by the order they appear in `contract SlotNamespace is A, B, C` — and
reordering that list, which looks cosmetic, would silently reinterpret the
storage of every live namespace.

New state is **appended above `__gap`**, decrementing the gap by what it takes.
`pnpm protocol layout` is what actually enforces that.

## Does it resolve?

Yes — measured, not assumed:

```
getEnsAddress({ name: "slot-1.l2beat.eth" })            → the current holder
getEnsText({ name: "slot-1.l2beat.eth", key: "url" })   → what they published
```

Straight off `pnpm dev:local`, with no argument that this is anything but
ordinary ENS:

```
slot-1.l2beat.eth        0x70997970C5   url            https://splits.org
slot-1.l2beat.eth        0x70997970C5   description    Process revenue, move…
slot-2.l2beat.eth        0x3C44CdDdB6   url            https://bankr.bot
slot-2.l2beat.eth        0x3C44CdDdB6   com.twitter    bankrbot
slot-3.l2beat.eth        null           —              nobody holds this
```

The parent names answer too, under the keys every ENS client already reads:

```
getEnsText({ name: "nezzar.eth", key: "avatar" })       → the picture
getEnsText({ name: "clanker.eth", key: "header" })      → the banner
getEnsText({ name: "dailygwei.eth", key: "description" })
```

That's viem's own ENS path, through the Universal Resolver. Two things gate it:

1. **The parent must point at the registry** — `setSubregistry` on the `.eth`
   registry. Without it, names register and mint and resolve to nothing.
2. **The client must override the Universal Resolver** with the hackathon one,
   `0xd26f2040…`. Without it `getEnsAddress` returns `null` *silently* — the
   standard deployment lives on the same chain and knows nothing about this one.

And a third, for the parent's own records only: **the parent name needs a
resolver of its own**, set on the `.eth` registry by whoever owns it.
`setSubregistry` gets you the subnames; it says nothing about the name above
them. Miss it and a namespace's profile stores perfectly and resolves to
nothing — which the app draws as a `not resolving` marker on the card rather
than pretending the record is live.

Supported profiles: `addr`, `addr(coinType 60)`, `text`. Anything else reverts
`UnsupportedResolverProfile`, as ENS's own resolvers do. Batched reads need
nothing extra — the Universal Resolver decomposes `multicall` itself.

---

## What a namespace says about itself

A parent name carries `avatar`, `header`, `description` and `url` — the same
four records it would carry if it had nothing to do with this project, and the
same four the app draws each card from.

They are **not** a schema of our own, on purpose. "What does this name look
like" already has an answer everywhere in ENS, and a bespoke
`org.0xslots.profile` blob would have held the same four strings while being
legible to nothing but this app. `header` rather than `banner` for the same
reason: `header` is the key ENS's own manager app writes for it.

The one thing that is ours is who may write them. A slotted subname's records
belong to its **occupant** and are keyed by `tenureId`, so they clear when the
tenancy ends. The parent name is not for sale here — it is the thing whose
subnames are — so its records belong to the namespace's **owner** and are kept
in their own mapping, with no tenure to expire. `SlotNamespace.textOf` serves
both, because the resolver is handed a name and derives a node and has no
business knowing which kind it got.

```
setParentText("avatar", "…")     the owner, on the parent name
setText(node, "avatar", "…")     the occupant, on a subname they hold
```

---

## Records

Only the current holder writes them, under any ENS text key, and they are keyed
by the slot's `tenureId` — so they clear on turnover and do not come back if the
same person retakes the name later. Set an avatar, lose the slot, and it is
gone. That is what makes the slot a lease rather than a property.

The app draws the standard key set because **text records are not enumerable**:
`text(node, key)` answers about a key you already know and there is no `keys()`,
on our resolver or on ENS's own,
because the storage is a mapping and mappings cannot be walked. An indexer could
rebuild the set from `TextChanged`; without one, asking about a known list is
all any client can do — which is why the editor takes a key as free text.

---

## Four things the deployments taught us

Everything here is hand-written from documentation carrying a standing "not yet
final" warning, so it's all checked against deployed bytecode. Details in
[`ENSV2.txt`](./ENSV2.txt).

1. **`UserRegistry.initialize` isn't what the docs say.** They give
   `(address, uint256)`; the deployment takes `Grant[]`. Following the docs
   reverts with a bare `EvmError`.
2. **`register()` mints an ERC1155 to the owner**, so a contract keeping
   custody needs `IERC1155Receiver`. Undocumented; surfaces as
   `ERC1155InvalidReceiver` — including for addresses that look like EOAs, since
   every anvil default account carries an EIP-7702 delegation on Sepolia that a
   fork inherits.
3. **`cast` ENS-resolves any argument ending in `.eth`**, even for a `string`
   parameter. Of the two labels the seed used at the time, one resolved on
   Sepolia and silently became an address and the other didn't and passed
   through — so one namespace stored a name and the other stored a number.
   Build calldata first.
4. **`forge script` can't create two slots on a fork.** It doesn't increment a
   *forked* contract's nonce across creates, so plain-CREATE factories collide
   on the second call. ENS's CREATE2 factory is unaffected. The seed uses
   `cast send`.

---

## Deploying

One CLI, one chain at a time, chosen by a flag rather than by a config file
that can disagree with the RPC.

```bash
pnpm protocol status              # what is live on the local fork
pnpm protocol status --sepolia
pnpm protocol deploy --sepolia    # first deploy
pnpm protocol upgrade --dry       # what an upgrade would change, sending nothing
pnpm protocol upgrade
pnpm protocol layout              # storage layout vs the committed snapshot
```

`status` reads everything off the chain rather than off the ledger, and says so
when the two disagree — which they do whenever an upgrade is sent by hand, from
a multisig, or from a branch that was never merged.

`upgrade` runs the layout check first, refuses any `version()` that does not
strictly increase, and takes a fingerprint of a live namespace through the old
code and again through the new one. It is safe to run when nothing has changed:
everything reports `skip`.

The ledger is `apps/contracts/deployments/<chainid>/<Name>.json`. The chain id
comes from `block.chainid`, so the RPC decides which one is written — and the
local fork runs at 31337 precisely so a local deploy can never overwrite the
record of what is live on Sepolia.

`--dry` is two things, not one: forge is told not to send, and the script is
told it is not sending. Without the second, `record()` would rewrite the ledger
with addresses it had merely predicted.

Sepolia needs `PK` (the key holding `admin`) and `SEPOLIA_RPC_URL`. Set `ADMIN`
to hand the upgrade keys to a multisig at deploy time; the script then leaves
the final `setResolver` for that multisig to make, and says so.

### After a deploy

Two calls belong to the parent name's owner, and no factory can make them:

```
ethRegistry.setSubregistry(labelhash("yourname"), <your registry>)
ethRegistry.setResolver(labelhash("yourname"), <the shared resolver>)
```

The first is what makes the subnames resolve. The second is for the parent
name's own records. Buying a name through the app does both for free — the
registrar takes them as arguments — so this is only for a name you already own.

Moving from the fork to Sepolia proper is a chain id, not a rewrite: the
addresses are identical either way.

## Branding

The app uses [ENS's palette](https://ens.domains/brand) — ENS Blue `#0080BC`,
Light Blue `#CEE1E8`, Dark Blue `#011A25`, and their extended Green / Magenta /
Yellow for status. **No ENS mark appears anywhere**: their guidelines require a
trademark licence and forbid implying an endorsement that doesn't exist. The
symbol is our own.

---

## Status

Draft. Unaudited, and built against contracts both projects still describe as
provisional. Don't put anything you care about behind it.

Known gaps:

- **`admin` is one key.** It can upgrade the beacon, which changes the code
  running under every curator's name. `transferAdmin` moves it to a multisig
  and that is the intended end state, not the current one.
- **Nothing tests the web app.** There is no TypeScript test runner in this
  repo yet, so `apps/web` rests on `tsc` and on being used.
