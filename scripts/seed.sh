#!/usr/bin/env bash
#
# Fill a forked chain with something worth looking at.
#
# ── Why bash and cast, and not a forge script ────────────────────────────────
#
# There was a forge script. It cannot work here. `SlotFactory.createSlot` uses
# plain CREATE, so each slot's address comes from the FACTORY's nonce — and
# forge's script EVM does not increment the nonce of a contract it loaded from
# a fork. The first slot is created, the second collides, every time.
#
# The tell is that ENS's VerifiableFactory in the same script is fine: it uses
# CREATE2, whose address comes from a salt rather than a nonce. Sent as
# ordinary transactions through anvil, which tracks the nonce properly, both
# work. So the seed is transactions.
set -euo pipefail

# Foundry nightly prints a banner on stdout, which lands in the middle of the
# JSON these commands are parsed for.
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

RPC="${RPC:-http://127.0.0.1:8545}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/contracts"

# anvil's defaults, so the app's dev bar can act as any of them without a key.
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
DEPLOYER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ALICE=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
ALICE_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
BOB=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
BOB_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

SLOT_FACTORY=0x14df7d78ef556A80F0AD3ede3F10F1e24f92E1cE
ENS_VF=0x894bc9cC8ff1ad96B8a288C86A8C71D662C07780
ENS_UR_IMPL=0x47B442d0CF617c41CAbAFf5f02f44DD1e5f72546
ENS_ETH_REGISTRAR=0x7d1B7f586a62Ac3F54b9A396849757814283270b
ENS_ETH_REGISTRY=0x1D78834d97c1D7b1A38c1deDBD1a287cFEd3971e
MOCK_USDC=0xcBFD80F74375c54E545AF34788Ff465F96F66F05
YEAR=31536000
ALL_ROLES=0x1111111111111111111111111111111111111111111111111111111111111111
ROLE_REGISTRAR_AND_UNREGISTER=4097   # (1 << 0) | (1 << 12)

TAX_BPS=500
MIN_DEPOSIT_SECONDS=604800
ZERO=0x0000000000000000000000000000000000000000
ZERO32=0x0000000000000000000000000000000000000000000000000000000000000000
TERMS="($DEPLOYER,$ZERO,$ZERO,$ZERO,$ZERO32,$TAX_BPS,$MIN_DEPOSIT_SECONDS,false,false)"

send() { cast send --private-key "$1" --rpc-url "$RPC" "${@:2}" >/dev/null; }
call() { cast call --rpc-url "$RPC" "$@"; }

# ── Un-delegate the dev accounts ────────────────────────────────────────────
#
# Every anvil default account has an EIP-7702 delegation on Sepolia — somebody
# has pointed those famous test keys at smart-account implementations, and a
# fork inherits it. That makes them CONTRACTS, so `onERC1155Received` gets
# called on them and reverts, and registering an ENS name to one fails with
# `ERC1155InvalidReceiver` naming an address that looks like a plain EOA.
#
# Clearing the code locally turns them back into the EOAs everyone assumes they
# are. Local only, and invisible to anything but this chain.
for a in "$DEPLOYER" "$ALICE" "$BOB" 0x90F79bf6EB2c4f870365E785982E1f101E93b906; do
  cast rpc anvil_setCode "$a" 0x --rpc-url "$RPC" >/dev/null
done

ETH_NODE=$(cast keccak "$(cast concat-hex "$ZERO32" "$(cast keccak eth)")")
namehash() { cast keccak "$(cast concat-hex "$ETH_NODE" "$(cast keccak "$1")")"; }

echo "→ SlotNamespaceFactory"
# Parsed from the human output rather than `--json`, which this foundry
# nightly accepts and then ignores.
NSF=$(forge create src/SlotNamespaceFactory.sol:SlotNamespaceFactory \
  --rpc-url "$RPC" --private-key "$DEPLOYER_PK" --broadcast \
  --constructor-args "$SLOT_FACTORY" \
  | grep "Deployed to:" | awk '{print $3}')
[ -n "$NSF" ] || { echo "factory deploy failed"; exit 1; }

# ── Actually own the parent name ────────────────────────────────────────────
#
# Not optional, and not decoration. Slotting a label under a parent nobody has
# registered works perfectly — the names register, the tokens mint, the records
# store — and then `getEnsText` returns nothing, silently, because resolution
# only ever walks DOWN from the root and the walk stops at a `.eth` label that
# points nowhere. Since resolving through viem is the entire claim, the seed has
# to make the claim true rather than assume it.
#
# The subregistry is passed at REGISTRATION rather than set afterwards: the
# registrar takes it as an argument, so one transaction does what would
# otherwise be a register and then a `setSubregistry`.
register_parent() {          # $1 = label, $2 = the UserRegistry to point it at
  local label="$1" registry="$2" secret price total wait commitment data

  if [ "$(call "$ENS_ETH_REGISTRAR" "isAvailable(string)(bool)" "$label")" != "true" ]; then
    echo "  ✗ $label.eth is already registered on Sepolia — pick another label" >&2
    exit 1
  fi

  secret=$(cast keccak "ens-slots-seed-$label")

  # `getRegisterPrice` returns (base, premium); the registrar pulls their sum.
  price=$(call "$ENS_ETH_REGISTRAR" "getRegisterPrice(string,uint64,address)(uint256,uint256)" \
    "$label" "$YEAR" "$MOCK_USDC")
  total=$(python3 -c "import sys;print(sum(int(x.split()[0]) for x in sys.stdin.read().strip().splitlines()))" <<<"$price")

  send "$DEPLOYER_PK" "$MOCK_USDC" "mint(address,uint256)" "$DEPLOYER" "$total"
  send "$DEPLOYER_PK" "$MOCK_USDC" "approve(address,uint256)" "$ENS_ETH_REGISTRAR" "$total"

  commitment=$(call "$ENS_ETH_REGISTRAR" \
    "makeCommitment(string,address,bytes32,address,address,uint64,bytes32)(bytes32)" \
    "$label" "$DEPLOYER" "$secret" "$registry" "$ZERO" "$YEAR" "$ZERO32")
  send "$DEPLOYER_PK" "$ENS_ETH_REGISTRAR" "commit(bytes32)" "$commitment"

  # Commit-reveal wants a minimum age between the two. Local chain, so jump it.
  wait=$(call "$ENS_ETH_REGISTRAR" "MIN_COMMITMENT_AGE()(uint256)" | cut -d' ' -f1)
  cast rpc evm_increaseTime "$((wait + 1))" --rpc-url "$RPC" >/dev/null
  cast rpc evm_mine --rpc-url "$RPC" >/dev/null

  data=$(cast calldata "register(string,address,bytes32,address,address,uint64,address,bytes32)" \
    "$label" "$DEPLOYER" "$secret" "$registry" "$ZERO" "$YEAR" "$MOCK_USDC" "$ZERO32")
  send "$DEPLOYER_PK" "$ENS_ETH_REGISTRAR" "$data"
}

open_namespace() {           # $1 = label, e.g. "community"
  local label="$1" node registry ns res init data
  node=$(namehash "$label")

  init=$(cast calldata "initialize((address,uint256)[])" "[($DEPLOYER,$ALL_ROLES)]")
  registry=$(call "$ENS_VF" "deployProxy(address,uint256,bytes)(address)" "$ENS_UR_IMPL" "$node" "$init" --from "$DEPLOYER")
  send "$DEPLOYER_PK" "$ENS_VF" "deployProxy(address,uint256,bytes)" "$ENS_UR_IMPL" "$node" "$init"

  register_parent "$label" "$registry"

  # Encoded first, then sent as raw calldata, and it has to be this way round:
  # `cast` ENS-RESOLVES any argument ending in `.eth`, even for a `string`
  # parameter. On a Sepolia fork "based.eth" resolves and "community.eth" does
  # not, so passing the names directly stored an address for one of them and
  # the name for the other. `cast calldata` does no such thing.
  data=$(cast calldata \
    "open(address,bytes32,string,(address,address,address,address,bytes32,uint256,uint256,bool,bool),address)" \
    "$registry" "$node" "$label.eth" "$TERMS" "$DEPLOYER")
  send "$DEPLOYER_PK" "$NSF" "$data"

  # Read back rather than predicted: the factory records both.
  ns=$(call "$NSF" "namespaceOf(bytes32)(address)" "$node")
  res=$(call "$NSF" "resolverOf(bytes32)(address)" "$node")

  send "$DEPLOYER_PK" "$registry" "grantRootRoles(uint256,address)" "$ROLE_REGISTRAR_AND_UNREGISTER" "$ns"
  send "$DEPLOYER_PK" "$ns" "setResolver(address)" "$res"

  # ── and point the PARENT name at the same resolver ──────────────────────
  #
  # `namespace.setResolver` above is for the names this contract REGISTERS,
  # which are its subnames. The parent is not one of them — it lives in the
  # `.eth` registry and was registered by the deployer, so its resolver is set
  # there, by its owner, once.
  #
  # Without this the namespace's own avatar and description store perfectly and
  # resolve to nothing: `getEnsText({ name: "nezzar.eth", key: "avatar" })`
  # walks down to a `.eth` label with no resolver and stops. The subnames are
  # unaffected either way — resolution takes the deepest resolver it finds, and
  # each of them carries its own.
  send "$DEPLOYER_PK" "$ENS_ETH_REGISTRY" "setResolver(uint256,address)" "$(cast keccak "$label")" "$res"

  echo "$ns"
}

# LabelKind: 0 = COMMON, 1 = SPONSORING.
slot_label() {               # $1 = namespace, $2 = label, $3 = kind, $4 = permanent
  send "$DEPLOYER_PK" "$1" "slotLabel(string,uint8,address,bytes32,bool)" \
    "$2" "$3" "$ZERO" "$ZERO32" "$4"
}

node_of() {                  # $1 = namespace, $2 = label
  cast keccak "$(cast concat-hex "$(call "$1" "PARENT_NODE()(bytes32)")" "$(cast keccak "$2")")"
}

# Written by the OCCUPANT, which is the only party that can. Pre-baked rather
# than enriched here: enrichment is a publish-time network call, and a seed that
# needed the index to be up would fail for reasons that have nothing to do
# with the chain.
set_record() {               # $1 = namespace, $2 = label, $3 = pk, $4 = json
  local data
  data=$(cast calldata "setText(bytes32,string,string)" \
    "$(node_of "$1" "$2")" "org.0xslots.sponsor" "$4")
  send "$3" "$1" "$data"
}

# The namespace's OWN profile, written by its owner rather than by an occupant.
# Ordinary ENS keys — `avatar`, `header`, `description`, `url` — because a
# namespace is a name like any other and every ENS client already knows how to
# draw one.
set_parent_record() {        # $1 = namespace, $2 = key, $3 = value
  local data
  data=$(cast calldata "setParentText(string,string)" "$2" "$3")
  send "$DEPLOYER_PK" "$1" "$data"
}

take() {                     # $1 = namespace, $2 = label, $3 = pk, $4 = who, $5 = price
  local node slot dep owed
  node=$(cast keccak "$(cast concat-hex "$(call "$1" "PARENT_NODE()(bytes32)")" "$(cast keccak "$2")")")
  slot=$(call "$1" "slotOfNode(bytes32)(address)" "$node")
  # Twice the floor: funding exactly the minimum sits on the liquidation
  # boundary and reads as "running low" the moment a block passes.
  dep=$(call "$slot" "minDepositForBuy(uint256)(uint256)" "$5" | cut -d' ' -f1)
  dep=$((dep * 2))
  owed=$(call "$slot" "quoteBuy(address,uint256)(uint256)" "$4" "$dep" | cut -d' ' -f1)
  send "$3" "$slot" "buy(address,uint256,uint256,uint256)" "$4" "$5" "$dep" \
    115792089237316195423570985008687907853269984665640564039457584007913129639935 --value "$owed"
}

# ── who these namespaces are ────────────────────────────────────────────────
#
# Three real names, chosen because they are three different reasons to open a
# namespace, and each one draws a different card:
#
#   nezzar.eth     a person. Subnames are identity first, a sponsoring space
#                  second. Its avatar and header are the ones nezzar.eth
#                  actually has on mainnet today.
#   clanker.eth    a product. Every subname under it is a sponsoring space,
#                  because that is what the product is for.
#   dailygwei.eth  a publication. Sponsorship is the business model, so the
#                  slotted labels ARE the ad inventory.
#
# The `.eth` labels are registered here on the fork; the profiles are the real
# ones, read from each project's own site and from mainnet ENS.

echo "→ nezzar.eth"
NEZZAR=$(open_namespace nezzar)
slot_label "$NEZZAR" gm    1 false
slot_label "$NEZZAR" links 0 false
slot_label "$NEZZAR" hire  1 false

echo "→ clanker.eth"
CLANKER=$(open_namespace clanker)
slot_label "$CLANKER" pool  1 true
slot_label "$CLANKER" token 1 false
slot_label "$CLANKER" app   1 false

echo "→ dailygwei.eth"
DAILYGWEI=$(open_namespace dailygwei)
slot_label "$DAILYGWEI" sponsor 1 true
slot_label "$DAILYGWEI" press   1 false
slot_label "$DAILYGWEI" guest   0 false

# ── what each namespace says about itself ───────────────────────────────────
#
# Ordinary ENS text records on the parent name, written by its owner. `header`
# rather than `banner` because `header` is the key ENS's own manager app writes
# for exactly this, and the whole argument here is that these are records any
# ENS client already knows how to read.
#
# nezzar.eth's two images are its REAL mainnet records, pinned where they
# actually are. The other two profiles are each project's own assets, taken
# from the meta tags their sites serve.
echo "→ profiles"

set_parent_record "$NEZZAR" avatar      'https://rainbow.mypinata.cloud/ipfs/QmXgMeifcb1sswRCp8BKZKvmfd4WtEag9KLoQ4nEsUFzQ5'
set_parent_record "$NEZZAR" header      'https://rainbow.mypinata.cloud/ipfs/QmTLar2ZqZ7hhZDzqBdcBF9AdqZQR4NdohjJn9yiDqHAeX'
set_parent_record "$NEZZAR" description 'Fullstack developer and product builder. Opening a few subnames to whoever wants them.'
set_parent_record "$NEZZAR" url         'https://nezzar.dev'

set_parent_record "$CLANKER" avatar      'https://www.clanker.world/logo_circle.png'
set_parent_record "$CLANKER" header      'https://www.clanker.world/api/og/home'
set_parent_record "$CLANKER" description 'Launch ERC-20 tokens on Base, Arbitrum, BNB Chain and more — no code required. Instant liquidity, built-in fee rewards, and presales.'
set_parent_record "$CLANKER" url         'https://www.clanker.world'

set_parent_record "$DAILYGWEI" avatar      'https://substackcdn.com/image/fetch/$s_!nXWu!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-e05bbc84-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F66edc435-3321-4611-9d5f-732e1ad2d71d%2Fapple-touch-icon-180x180.png'
set_parent_record "$DAILYGWEI" header      'https://substackcdn.com/image/fetch/$s_!fPzj!,f_auto,q_auto:best,fl_progressive:steep/https%3A%2F%2Fthedailygwei.substack.com%2Ftwitter%2Fsubscribe-card.jpg%3Fv%3D162594653%26version%3D9'
set_parent_record "$DAILYGWEI" description 'Daily commentary on the Ethereum ecosystem, by Anthony Sassano.'
set_parent_record "$DAILYGWEI" url         'https://thedailygwei.substack.com'

echo "→ occupancy"
take "$NEZZAR"    gm      "$BOB_PK"   "$BOB"   400000000000000000
take "$NEZZAR"    links   "$ALICE_PK" "$ALICE" 250000000000000000
take "$CLANKER"   pool    "$BOB_PK"   "$BOB"   2000000000000000000
take "$CLANKER"   token   "$ALICE_PK" "$ALICE" 750000000000000000
take "$CLANKER"   app     "$BOB_PK"   "$BOB"   500000000000000000
take "$DAILYGWEI" sponsor "$ALICE_PK" "$ALICE" 900000000000000000
take "$DAILYGWEI" press   "$ALICE_PK" "$ALICE" 300000000000000000
take "$DAILYGWEI" guest   "$BOB_PK"   "$BOB"   120000000000000000

# ── what the sponsoring spaces are showing ──────────────────────────────────
#
# Real pointers, and the metadata is what `packages/sponsor` actually returned
# for them — generated by running the enrichment and pasting the result, not
# written by hand. Pre-baked rather than enriched here on purpose: enrichment is
# a publish-time network call against an index that rate limits anonymous
# callers at 30 a minute, and a seed that needed it up would fail for reasons
# that have nothing to do with the chain.
#
# `hire` is deliberately left vacant and `guest` deliberately has no record: an
# empty sponsoring space and a plain identity name are both states the app has
# to draw, and the first is the one a visitor is most likely to arrive on.
echo "→ records"

# an ordinary page, on a personal namespace
set_record "$NEZZAR" gm "$BOB_PK" '{"v":1,"type":"url","data":{"url":"https://l2beat.com"},"metadata":{"name":"L2BEAT","image":"https://l2beat.com/static/apple-icon.7b05d4c1.png","tagline":"Track the Ethereum ecosystem in one view: L2s and Ethereum metrics, interoperability flows, privacy protocols and ZK provers, ongoing anomal","host":"l2beat.com"}}'

# a live pool, whose figures the card fetches rather than stores
set_record "$CLANKER" pool "$BOB_PK" '{"v":1,"type":"pool","data":{"chainId":8453,"address":"0xc1a6fbedae68e1472dbb91fe29b51f7a0bd44f97"},"metadata":{"name":"CLANKER / WETH 1%","image":"https://coin-images.coingecko.com/coins/images/51440/large/CLANKER.png?1731232869","tagline":"Uniswap V3 (Base) · Base","pair":"CLANKER / WETH 1%","dex":"Uniswap V3 (Base)","chainLabel":"Base"}}'

# a token
set_record "$CLANKER" token "$ALICE_PK" '{"v":1,"type":"token","data":{"chainId":8453,"address":"0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b"},"metadata":{"name":"BankrCoin","image":"https://coin-images.coingecko.com/coins/images/52626/large/bankr-static.png?1736405365","tagline":"BNKR on Base","symbol":"BNKR","chainLabel":"Base"}}'

# a mini app that publishes its own manifest
set_record "$CLANKER" app "$BOB_PK" '{"v":1,"type":"miniapp","data":{"url":"https://app.astroblock.xyz"},"metadata":{"name":"Astroblock","image":"https://app.astroblock.xyz/icon.png","tagline":"Astroblock is an onchain galaxy. Explore the universe, leave your mark, and interact with others onchain. Get ahead and fuel your journey wi","host":"app.astroblock.xyz","verified":true}}'

# an ordinary page — a publication's sponsor slot, doing the obvious thing
set_record "$DAILYGWEI" sponsor "$ALICE_PK" '{"v":1,"type":"url","data":{"url":"https://splits.org"},"metadata":{"name":"Splits | Process revenue, move money, run operations globally","image":"https://splits.org/logo_compressed.svg","tagline":"Process revenue, move money, and run operations instantly, anywhere in the world. Treasury and personal accounts, agent-ready tools, and ope","host":"splits.org"}}'

# a post
set_record "$DAILYGWEI" press "$ALICE_PK" '{"v":1,"type":"post","data":{"url":"https://x.com/cobie/status/2090725931853758650"},"metadata":{"name":"Cobie (@cobie) on X","image":"https://pbs.twimg.com/profile_images/1955773696565719040/zVpm_8at_400x400.jpg","tagline":"Nobody move","network":"X","excerpt":"Nobody move"}}'

python3 - "$NSF" "$ENS_ETH_REGISTRY" <<'PY'
import json, sys
json.dump({
    "chainId": 31337,
    "namespaceFactory": sys.argv[1],
    "slotFactory": "0x14df7d78ef556A80F0AD3ede3F10F1e24f92E1cE",
    "ensVerifiableFactory": "0x894bc9cC8ff1ad96B8a288C86A8C71D662C07780",
    "ensUserRegistryImpl": "0x47B442d0CF617c41CAbAFf5f02f44DD1e5f72546",
    "ensEthRegistry": sys.argv[2],
    "ensEthRegistrar": "0x7d1B7f586a62Ac3F54b9A396849757814283270b",
    "ensUniversalResolver": "0xd26f2040D083Af1cD2962ba303F4BEa0c4faf142",
    "mockUsdc": "0xcBFD80F74375c54E545AF34788Ff465F96F66F05",
    "minimumTenureHook": "0xB1e68532Ba467b2310A931abcDD682E718426c9C",
}, open("../web/src/lib/deployment.json", "w"), indent=2)
PY

echo
echo "  namespace factory  $NSF"
echo "  nezzar.eth         $NEZZAR"
echo "  clanker.eth        $CLANKER"
echo "  dailygwei.eth      $DAILYGWEI"
