# ens-slots

**ENS subnames under common ownership — always for sale, never squattable.**

A parent name's owner opens some of its subnames to a market. Whoever holds
`sponsor.dailygwei.eth` sets their own price, pays tax on that price
continuously, and can be bought out by anyone willing to pay it. Stop paying
and you lose it. Every other subname under that parent is untouched.

Some of those subnames are **sponsoring spaces**: the holder publishes a small
JSON payload into an ENS text record, and anything that speaks ENS can render
it. No SDK, no API key, no permission — `getEnsText` and `JSON.parse`. And
because `addr()` is the current holder, you can always ask *who paid to put this
here*, which is not a question you can ask of sponsored content anywhere else.

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

25 tests against a Sepolia fork: a real `UserRegistry` deployed through ENS's
real `VerifiableFactory`, real slots from the real `SlotFactory`. Without
`SEPOLIA_RPC_URL` they skip rather than fail.

---

## How it works

```
SlotNamespace  ──registers──▶  UserRegistry (ENSv2)     one per parent name
      │                              ▲
      │                              │ resolver
      ├──creates────▶ SlotFactory ───┴─▶ Slot            one per slotted label
      │                                    │
      └──read by────▶ SlotNamespaceResolver ┘            stateless adapter
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

---

## What's in here

```
apps/contracts/     Foundry — the contracts and the fork tests
apps/web/           Next.js — the app
packages/sponsor/   the record standard: schemas, enrichment, parsing
scripts/            the local stack: chain, seed, dev
ENSV2.txt           working reference for ENSv2, incl. what the docs get wrong
```

| Contract | |
|---|---|
| `SlotNamespace` | Curator, ENS custodian, record store. All state lives here. |
| `SlotNamespaceResolver` | `IExtendedResolver` adapter. Holds nothing, so it can be replaced. |
| `SlotNamespaceFactory` | Opens namespaces and records them. Holds no authority. |
| `interfaces/` | The ENSv2 and 0xSlots surfaces we call, hand-written and verified against the deployments. |

---

## Does it resolve?

Yes — measured, not assumed:

```
getEnsAddress({ name: "sponsor.dailygwei.eth" })                    → the holder
getEnsText({ name: "sponsor.dailygwei.eth", key: RECORD_KEY })      → the payload
```

Straight off `pnpm dev:local`, with no argument that this is anything but
ordinary ENS:

```
gm.nezzar.eth            0x3C44CdDdB6   url          318b
pool.clanker.eth         0x3C44CdDdB6   pool         342b
token.clanker.eth        0x70997970C5   token        291b
app.clanker.eth          0x3C44CdDdB6   miniapp      344b
sponsor.dailygwei.eth    0x70997970C5   url          362b
press.dailygwei.eth      0x70997970C5   post         277b
links.nezzar.eth         0x70997970C5   —            no record
guest.dailygwei.eth      0x3C44CdDdB6   —            no record
hire.nezzar.eth          null           —            no record
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

## Sponsoring spaces

A label is opened as **common** — an identity, pointing wherever its holder
likes — or as **sponsoring**, a space whose purpose is to show what its holder
publishes.

The kind is a **declaration, not a permission.** `setText` is open to any key on
any label either way, and gating it would buy nothing: a payload on an ordinary
label harms nobody. It exists because a *vacant* label has no record to infer
anything from, and somebody about to pay for one needs to know which market
they are entering before they enter it.

### The record

One key, one self-describing payload:

```
org.0xslots.sponsor  →  { v, type, data, metadata }
```

- **Raw JSON, not base64.** The field is a text record, not a URI, so the data-
  URI wrapper has no reason to exist here. Cheaper, and readable in any ENS
  explorer.
- **`data`** is what the sponsor typed — a chain and an address, or a URL.
  Sovereign; nobody else changes it.
- **`metadata`** is derived from `data` at publish time, from keyless sources:
  [GeckoTerminal](https://api.geckoterminal.com) for tokens and pools, a mini
  app's own `farcaster.json`, Open Graph tags for anything else. Because it is
  reproducible, a rotted logo or a renamed token can be re-derived without
  asking the sponsor to retype anything.
- **Nothing that moves lives in the record.** Price, TVL, volume are fetched at
  render. The boundary is volatility, not source: a figure frozen at publish
  would be wrong within the hour.

Types ship in `packages/sponsor`: `token`, `pool`, `miniapp`, `post`, `url`.

### Why an unknown type still renders

Every type's metadata extends the same triple — `name`, `image`, `tagline` — so
a client pinned months ago draws a payload written by a publisher that knows
types it has never heard of. That is the difference between an open standard and
a closed union of the types we happened to ship a renderer for.

`parseSponsorRecord` validates the envelope separately from the type-specific
half and returns `known: false` rather than nothing, and `SponsorCard` falls
through to a generic renderer. Publish a record with any `type` string to see
it. *(Nothing currently exercises this automatically — see Status.)*

### Records are the occupant's

Only the current holder writes them, and they are keyed by the slot's
`tenureId` — so they clear on turnover, and do not come back if the same person
retakes the name later. Set an avatar, lose the slot, and it is gone.

Any key, including the ordinary ENS ones. The app shows the standard set
because **text records are not enumerable**: `text(node, key)` answers about a
key you already know and there is no `keys()`, on our resolver or on ENS's own,
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

```bash
cd apps/contracts
PARENT_NODE=0x… forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

Then, from the parent name's owner — the script has no business holding that
key:

```
ethRegistry.setSubregistry(labelhash("yourname"), userRegistry)
ethRegistry.setResolver(labelhash("yourname"), resolver)   # for the parent's own records
namespace.setResolver(resolver)
```

Moving from the fork to Sepolia proper is a chain id, not a rewrite: the
addresses are identical either way.

---

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

- **The unknown-type fallback has no test.** It works, and the seed used to
  carry a record of a made-up type to prove it, which was more confusing than
  it was worth. There is no TypeScript test runner in this repo yet, so for
  now the claim rests on reading `parseSponsorRecord`.
- **Enrichment depends on one index.** GeckoTerminal allows 30 anonymous
  requests a minute. Enrichment spends one and never runs again, and the live
  figures route caches — but a burst (seeding, say) will hit it, and a 429 now
  fails the publish loudly rather than silently freezing a truncated address
  into a record somebody paid for.
