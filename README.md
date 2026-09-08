# ens-slots

**ENS subnames under common ownership — always for sale, never squattable.**

A parent name's owner opens some of its subnames to a market. Whoever holds
`sponsor.community.eth` sets their own price, pays tax on that price
continuously, and can be bought out by anyone willing to pay it. Stop paying
and you lose it. Every other subname under that parent is untouched.

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

16 tests against a Sepolia fork: a real `UserRegistry` deployed through ENS's
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
getEnsAddress({ name: "me.zzresolve.eth" })             → the holder
getEnsText({ name: "me.zzresolve.eth", key: "avatar" }) → the record
```

That's viem's own ENS path, through the Universal Resolver. Two things gate it:

1. **The parent must point at the registry** — `setSubregistry` on the `.eth`
   registry. Without it, names register and mint and resolve to nothing.
2. **The client must override the Universal Resolver** with the hackathon one,
   `0xd26f2040…`. Without it `getEnsAddress` returns `null` *silently* — the
   standard deployment lives on the same chain and knows nothing about this one.

Supported profiles: `addr`, `addr(coinType 60)`, `text`. Anything else reverts
`UnsupportedResolverProfile`, as ENS's own resolvers do. Batched reads need
nothing extra — the Universal Resolver decomposes `multicall` itself.

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
   parameter. `"based.eth"` resolves on Sepolia and silently became an address;
   `"community.eth"` didn't and passed through. Build calldata first.
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
ethRegistry.setSubregistry(labelhash("community"), userRegistry)
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
