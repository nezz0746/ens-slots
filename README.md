# ens-slots

ENS subnames under common ownership: always for sale, never squattable.

A parent name's owner picks which labels are *slotted*. Each slotted label gets
a [0xSlots](https://github.com/nezz0746/0xSlots) slot behind it: always for sale
at a price its occupant sets, taxed continuously on that price, and takeable by
anyone willing to pay it. `sponsor.community.eth` resolves to whoever currently
holds the slot. Every other subname under that parent is untouched.

Built against the ENSv2 ETHOnline 2026 hackathon deployment on Sepolia, where
0xSlots is also deployed — so the tests are not mocks, they run against both
live protocols. See [`ENSV2.txt`](./ENSV2.txt) for the working reference.

## How it works

```
SlotNamespace  ──registers──▶  UserRegistry (ENSv2)   one per parent name
      │                              ▲
      │                              │ resolver
      ├──creates────▶ SlotFactory ───┴─▶ Slot          one per slotted label
      │                                    │
      └──read by────▶ SlotNamespaceResolver ┘          stateless adapter
```

**The name never moves.** `SlotNamespace` registers each slotted label to
itself, permanently, and keeps it. What follows the occupant is *resolution*:
`addr()` is the slot's current `occupant()`, read at the moment the question is
asked.

That inverts the obvious design, in which the name is handed to whoever holds
the slot, and two things fall out of it:

- **Nothing happens on a turnover, so nothing can fail.** Moving the token would
  mean doing it from inside a hook — which the slot gas-caps and is allowed to
  swallow — and a swallowed move leaves the name pointing at someone who no
  longer holds it.
- **The slot's one hook stays free.** A slotted label can carry a minimum
  tenure, an advertising hook, or an eligibility rule, because this system
  doesn't need to be that hook.

The cost, which a UI must state plainly: an occupant never holds a name NFT.
They can't sell it, transfer it, or see it in a wallet. Occupancy is the only
market for the position.

### Two lifecycles, deliberately uncoupled

The registry is written exactly **twice** in a name's life — `slotLabel`
registers it, `unslotLabel` removes it — both by the namespace owner. Buying,
releasing and liquidating write nothing.

Release is *not* unregistration. A released slot is vacant, so the name goes
dark and waits for the next occupant: the name is bound to the **slot**, not to
whoever is sitting in it. Unregistering on release would return the label to
`AVAILABLE` where anyone could take it, force a re-registration on the next buy
from inside a failable callback, and churn the ENSv2 token id every cycle.

Names are registered at `type(uint64).max`. The continuous tax and liquidation
already recycle an abandoned slot; a second expiry clock would only add a way
for a paid-up occupant to lose their name for an unrelated reason. It is also
why `ROLE_RENEW` is never granted to anything here.

### Records belong to the tenancy

An occupant can set text records. When the slot changes hands they vanish — and
they do **not** come back if that occupant later retakes the slot. Records are
keyed by the slot's `tenureId`, a counter the protocol already increments on
every buy and already uses to expire operator approvals. Keying by occupant
address instead would clear records correctly and then resurrect them months
later, which is the bug this avoids.

## Contracts

| | |
|---|---|
| [`SlotNamespace`](apps/contracts/src/SlotNamespace.sol) | Curator, ENS custodian, record store. All state lives here. |
| [`SlotNamespaceResolver`](apps/contracts/src/SlotNamespaceResolver.sol) | `IExtendedResolver` adapter. Holds nothing, so it can be replaced. |
| [`IENSv2`](apps/contracts/src/interfaces/IENSv2.sol) | The ENSv2 surface we call, hand-written and verified against the deployment. |
| [`ISlots`](apps/contracts/src/interfaces/ISlots.sol) | The 0xSlots surface we call. |
| [`SlotNamespaceFactory`](apps/contracts/src/SlotNamespaceFactory.sol) | Opens namespaces and records them. Holds no authority. |
| [`Addresses`](apps/contracts/src/Addresses.sol) | Sepolia addresses for both protocols. |

The factory exists only so a client can answer "which parent names have slotted
subnames". ENS resolution walks only DOWN from the root, so without something
recording it there is no way to ask.

The resolver is split out from the namespace precisely because it is the
replaceable half. A hook address is baked into a slot at attach and must never
move; a resolver is one `setResolver` call away. Since the ENS docs say these
resolver interfaces aren't final, the half most likely to need replacing is the
half that owns no data.

## The app

```bash
pnpm install
pnpm dev:local
```

One command brings up all three pieces, because they are useless apart: anvil
forking Sepolia, our contracts deployed and seeded onto it, and the web app on
[localhost:3000](http://localhost:3000).

Forked rather than fresh. Half of what this app touches is somebody else's
deployed code — ENSv2's verifiable factory and registry implementation, the
0xSlots factory — and mocking them would let the UI be built against
interfaces that are merely what we believed. The docs already turned out to be
wrong about one. Only time, accounts and money are local.

The dev bar carries over from 0xSlots: click to act as Deployer, Alice, Bob or
Carol, and push the chain forward by a day, a week or a month. Both exist
because this protocol's interesting moments are between two people and across
time — a buyout needs somebody to buy from, and a liquidation needs a deposit
to run out.

| Page | |
|---|---|
| `/` | Every parent name with at least one slotted subname |
| `/n/[namespace]` | Its subnames, with the actions you specifically can take |
| `/register` | Buy a `.eth` name, then open a namespace under it |

`/register` runs the real ENS commit-reveal: approve, commit, wait out
`MIN_COMMITMENT_AGE`, reveal. The wait is the mechanism — it is what stops
somebody reading your registration out of the mempool — so it cannot be
shortened, only skipped locally by pushing anvil forward. Names are paid for in
**MockUSDC, not ether**, which is the most surprising thing about the flow, so
your balance and a mint button sit in the header rather than four steps in.

The action panel has three faces and they are mutually exclusive: take it, take
it *from them*, or — if you hold it — one form for price and escrow together.
Liquidate and collect sit outside that split, shown only when the chain says
they would do something. Price and escrow are edited together on purpose:
raising your price without funding the extra rent shortens your runway, and
two separate buttons let people price themselves into a liquidation they did
not see coming.

Moving to Sepolia proper is a chain id, not a rewrite — the addresses are
identical either way.

## Does it actually resolve?

Yes — measured, not assumed. With a real parent bought through the ETHRegistrar
and pointed at the registry with `setSubregistry`, the hackathon Universal
Resolver walks root → eth → parent, finds our resolver, and answers:

```
getEnsAddress({ name: "me.zzresolve.eth" })            → 0x7099…79C8  (the holder)
getEnsText({ name: "me.zzresolve.eth", key: "avatar" }) → https://example.com/alice.png
```

That is viem's own ENS path, so anything using it works unchanged. Two things
decide whether it works at all:

- **The parent must point at the registry.** Without `setSubregistry` the names
  register and mint and resolve to nothing.
- **The client must override the Universal Resolver.** Without it,
  `getEnsAddress` returns `null` — *silently*. The standard ENSv2 Beta resolver
  lives on the same chain, answers, and knows nothing about this deployment.

Supported profiles are `addr`, `addr(coinType 60)` and `text`. Anything else
reverts `UnsupportedResolverProfile`, which is what ENS's own resolvers do.
Batched reads need nothing extra: the Universal Resolver decomposes a
`multicall` and calls `resolve` once per profile.

## Branding

The app wears [ENS's palette](https://ens.domains/brand) verbatim — ENS Blue
`#0080BC`, Light Blue `#CEE1E8`, Dark Blue `#011A25`, and the extended
Green / Magenta / Yellow — because a project sitting on top of ENS should look
like it belongs in the ecosystem. The three status tones map onto it and the
mapping does work rather than decorating: green for a funded position, yellow
for one running out, magenta for one that can be taken right now. Magenta
stands in for red, which their palette does not have, and reads better anyway:
a name that can be taken is not broken, it is available.

**No ENS mark appears anywhere in the app.** Their guidelines require a
trademark licence for the marks and say not to use them in a way that implies
"sponsorship, endorsement, or a partnership that doesn't exist" — and this is
an independent project. The symbol in the header is our own: a slot with a
piece seated in it, the seated half in magenta because that is the part that
changes hands.

Type stays on the system stack. ENS sets its own in Satoshi, but the brand page
publishes no font stack and no licence terms, so pulling a webfont on an
assumption seemed the wrong way round.

## Running the tests

```bash
cd apps/contracts
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com forge test
```

16 tests, run against a Sepolia fork: a real `UserRegistry` deployed through the
real `VerifiableFactory`, real slots from the real `SlotFactory`. Without
`SEPOLIA_RPC_URL` they skip rather than fail.

This is what mocks are bad at. Every ENSv2 signature in this repo is
hand-written from documentation that carries a standing "not yet final"
warning — a mock would agree with whatever interface it was written from,
including a wrong one. Running against the deployment already found two:

- The docs give `UserRegistry.initialize(address, uint256)`. The deployed
  implementation has no such selector; it takes `Grant[]`. Deploying from the
  docs reverts with a bare `EvmError`.
- `register()` mints an ERC1155 token to the owner, so a contract that keeps
  custody needs `IERC1155Receiver`. Nothing in the registrar guide mentions it;
  it surfaces as `ERC1155InvalidReceiver`.

And building the app found a third, which is about forking rather than about
ENS: every anvil default account has an **EIP-7702 delegation on Sepolia**.
Forking inherits it, so the addresses everyone treats as EOAs are contracts
that cannot receive ERC1155 tokens, and registering a name to one fails with an
error naming what looks like a plain address. `scripts/seed.sh` clears the code
locally.

## Deploying

```bash
cd apps/contracts
PARENT_NODE=0x... forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

Then, from the parent name's owner — the script can't, since it has no business
holding that key:

```
ethRegistry.setSubregistry(labelhash("community"), userRegistry)
namespace.setResolver(resolver)
```

Until the parent points at the registry, names register and mint but resolve to
nothing: the Universal Resolver walks down from the root and never reaches them.

Clients must also override the Universal Resolver built into viem/ethers with
the hackathon one, `0xd26f2040d083af1cd2962ba303f4bea0c4faf142`, or resolution
silently goes to the standard ENSv2 Beta deployment instead.

## Status

Draft. Unaudited, untested beyond the suite above, and built against contracts
both projects still describe as provisional.
