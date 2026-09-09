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

TAX_BPS=500
MIN_DEPOSIT_SECONDS=604800
# The run every sponsor is guaranteed, carried by the namespace's hook rather
# than set per label. Without it a sponsor can be outbid minutes after paying
# and the space they bought never runs.
MIN_TENURE_HOOK=0xB1e68532Ba467b2310A931abcDD682E718426c9C
MIN_TENURE_SECONDS=$(printf "0x%064x" 604800)
ZERO=0x0000000000000000000000000000000000000000
ZERO32=0x0000000000000000000000000000000000000000000000000000000000000000
# One currency for the whole protocol: the same MockUSDC the .eth registrar
# charges in. Slots priced in native ETH while registration was priced in a
# token meant two mental models and two balances on one screen — and MockUSDC
# is the one anybody can mint, so it is the one a demo can hand out.
#
# The SECOND field is the currency. Native is the zero address; anything else
# is pulled with `transferFrom`, so every buy and top-up needs an allowance
# first and must send no `msg.value` at all.
#
# Fields four and five are the hook and its data — the minimum tenure, applied
# to every space opened in the namespace. A label passing hook zero inherits it.
TERMS="($DEPLOYER,$MOCK_USDC,$ZERO,$MIN_TENURE_HOOK,$MIN_TENURE_SECONDS,$TAX_BPS,$MIN_DEPOSIT_SECONDS,false,false)"

# MockUSDC is 6 decimals, not 18. Every price below is in whole dollars.
USDC=1000000

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

echo "→ the protocol"
# Deployed by the same CLI that deploys to Sepolia, rather than a `forge create`
# of its own. The seed used to build the factory by hand, which meant the local
# chain and a real one were stood up by two different pieces of code and only
# one of them was ever exercised before a deploy.
rm -f "$ROOT/apps/contracts/deployments/31337/"*.json
"$ROOT/scripts/protocol" deploy >/dev/null

read_deployment() {          # $1 = contract name
  python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['address'])" \
    "$ROOT/apps/contracts/deployments/31337/$1.json"
}
NSF=$(read_deployment SlotNamespaceFactory)
RESOLVER=$(read_deployment SlotNamespaceResolver)
[ -n "$NSF" ] || { echo "deploy failed"; exit 1; }

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

# ── Open a namespace, in one transaction ────────────────────────────────────
#
# This used to be five: deploy a UserRegistry, register the parent, open the
# namespace, grant it two roles, point it at a resolver. `open` does all but the
# parent registration now — including granting the namespace its roles, which it
# can only do because the registry is deployed inside the same call, with the
# grants in its own initializer.
#
# The registry address is still needed BEFORE the call, because the parent name
# is registered with `subregistry` already set. ENS derives it by CREATE2 from
# (verifiable factory, our factory, parent node), so it is knowable in advance —
# simulated here with `--from $NSF`, which is ENS's own code answering rather
# than a derivation of ours that could drift.
open_namespace() {           # $1 = label, e.g. "community", $2.. = label specs
  local label="$1" node registry init ns data specs
  shift
  node=$(namehash "$label")

  init=$(cast calldata "initialize((address,uint256)[])" "[($DEPLOYER,$ALL_ROLES)]")
  registry=$(call "$ENS_VF" "deployProxy(address,uint256,bytes)(address)" \
    "$ENS_UR_IMPL" "$node" "$init" --from "$NSF")

  register_parent "$label" "$registry"

  # `(label, kind, hook, hookData, permanent)` per label, as a tuple array.
  specs="[$(IFS=,; echo "$*")]"

  # Encoded first, then sent as raw calldata, and it has to be this way round:
  # `cast` ENS-RESOLVES any argument ending in `.eth`, even for a `string`
  # parameter. On a Sepolia fork "based.eth" resolves and "community.eth" does
  # not, so passing the names directly stored an address for one of them and the
  # name for the other. `cast calldata` does no such thing.
  data=$(cast calldata \
    "open((address,bytes32,string,(address,address,address,address,bytes32,uint256,uint256,bool,bool),address,(string,uint8,address,bytes32,bool)[]))" \
    "($ZERO,$node,$label.eth,$TERMS,$DEPLOYER,$specs)")
  send "$DEPLOYER_PK" "$NSF" "$data"

  ns=$(call "$NSF" "namespaceOf(bytes32)(address)" "$node")

  # ── and point the PARENT name at the shared resolver ──────────────────────
  #
  # The namespace's own subnames were pointed there by `open`. The parent is not
  # one of them — it lives in the `.eth` registry and was registered by the
  # deployer, so its resolver is set there, by its owner, once.
  #
  # Without this the namespace's own avatar and description store perfectly and
  # resolve to nothing: `getEnsText({ name: "nezzar.eth", key: "avatar" })` walks
  # down to a `.eth` label with no resolver and stops.
  send "$DEPLOYER_PK" "$ENS_ETH_REGISTRY" "setResolver(uint256,address)" "$(cast keccak "$label")" "$RESOLVER"

  echo "$ns"
}

# A `LabelSpec` tuple. Every space is SPONSORING (kind 1), never permanent, and
# passes hook zero so it inherits the namespace's minimum tenure.
spec() {                     # $1 = label
  echo "($1,1,$ZERO,$ZERO32,false)"
}

node_of() {                  # $1 = namespace, $2 = label
  cast keccak "$(cast concat-hex "$(call "$1" "parentNode()(bytes32)")" "$(cast keccak "$2")")"
}

# Written by the OCCUPANT, which is the only party that can. Pre-baked rather
# than enriched here: enrichment is a publish-time network call, and a seed that
# needed the index to be up would fail for reasons that have nothing to do
# with the chain.
set_record() {               # $1 = namespace, $2 = label, $3 = pk, $4 = json
  local data
  data=$(cast calldata "setText(bytes32,string,string)" \
    "$(node_of "$1" "$2")" "com.ethglobal.sponsor" "$4")
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
  node=$(cast keccak "$(cast concat-hex "$(call "$1" "parentNode()(bytes32)")" "$(cast keccak "$2")")")
  slot=$(call "$1" "slotOfNode(bytes32)(address)" "$node")
  # Twice the floor: funding exactly the minimum sits on the liquidation
  # boundary and reads as "running low" the moment a block passes.
  dep=$(call "$slot" "minDepositForBuy(uint256)(uint256)" "$5" | cut -d' ' -f1)
  dep=$((dep * 2))
  owed=$(call "$slot" "quoteBuy(address,uint256)(uint256)" "$4" "$dep" | cut -d' ' -f1)

  # An ERC-20 slot pulls what it is owed, so the buyer has to hold it and have
  # approved it. `mint` is open on the mock, which is the whole point of using
  # it — the dev accounts fund themselves.
  send "$3" "$MOCK_USDC" "mint(address,uint256)" "$4" "$owed"
  send "$3" "$MOCK_USDC" "approve(address,uint256)" "$slot" "$owed"

  # No `--value`: the slot rejects a non-zero `msg.value` on the ERC-20 path.
  send "$3" "$slot" "buy(address,uint256,uint256,uint256)" "$4" "$5" "$dep" \
    115792089237316195423570985008687907853269984665640564039457584007913129639935
}

# ── the one namespace ───────────────────────────────────────────────────────
#
# `ethglobal.eth`, with three sponsoring spaces under it. One name rather than
# three, because the point being demonstrated is what a namespace IS — a parent
# with spaces on the market — and three of them said the same thing three times
# while taking three times as long to seed.
#
# `sponsor-1..3` are deliberately plain. Names like `pool` or `press` invited
# the reading that a space is typed, and it is not: any space can show any of
# the payload kinds, which is exactly what these three do.

echo "→ ethglobal.eth"
ETHGLOBAL=$(open_namespace ethglobal "$(spec sponsor-1)" "$(spec sponsor-2)" "$(spec sponsor-3)")

# ── what the namespace says about itself ────────────────────────────────────
#
# Read off ethglobal.com at seed time rather than pasted in here.
#
# `ethglobal.eth` resolves to an address on mainnet and carries no text records
# at all — checked, not assumed — so there is no ENS profile to copy. What the
# site serves in its own meta tags is the next most honest source, and it is the
# same one `packages/sponsor` reads when somebody publishes a link.
#
# Fetched with a timeout and a fallback: a seed that cannot run without the
# network would fail for reasons that have nothing to do with the chain, and
# this is scaffolding, not a test of ethglobal.com's uptime.
echo "→ profile"

meta() {                     # $1 = property, $2 = fallback
  local html value
  html=$(curl -sL --max-time 10 -A "Mozilla/5.0" https://ethglobal.com 2>/dev/null || true)
  value=$(printf '%s' "$html" \
    | grep -oiE "<meta[^>]+(property|name)=\"$1\"[^>]*>" \
    | grep -oiE 'content="[^"]*"' \
    | head -1 | sed -E 's/^content="//; s/"$//')
  printf '%s' "${value:-$2}"
}

ETHGLOBAL_TITLE=$(meta "og:title" "ETHGlobal")
ETHGLOBAL_DESC=$(meta "og:description" "Bringing developers onchain to build the future of the internet.")
ETHGLOBAL_IMAGE=$(meta "og:image" "https://ethglobal.com/og.png")

echo "     $ETHGLOBAL_TITLE — $ETHGLOBAL_DESC"

set_parent_record "$ETHGLOBAL" avatar      "https://ethglobal.com/favicon.ico"
set_parent_record "$ETHGLOBAL" header      "$ETHGLOBAL_IMAGE"
set_parent_record "$ETHGLOBAL" description "$ETHGLOBAL_DESC"
set_parent_record "$ETHGLOBAL" url         "https://ethglobal.com"

# ── occupancy ───────────────────────────────────────────────────────────────
#
# Two of the three held, one left vacant. An empty space is the state a visitor
# is most likely to arrive on and the only one from which the buy flow can be
# demonstrated, so the seed has to leave one.
echo "→ occupancy"
take "$ETHGLOBAL" sponsor-1 "$ALICE_PK" "$ALICE" $((900 * USDC))
take "$ETHGLOBAL" sponsor-2 "$BOB_PK"   "$BOB"   $((300 * USDC))

# ── what the spaces are showing ─────────────────────────────────────────────
#
# Two different payload kinds on two identical spaces, which is the argument:
# nothing about a space decides what it shows, only its occupant does.
#
# The metadata is what `packages/sponsor` actually returned for these, pasted
# rather than enriched here — enrichment is a publish-time network call against
# an index that rate limits anonymous callers at 30 a minute.
echo "→ records"

# an ordinary page
set_record "$ETHGLOBAL" sponsor-1 "$ALICE_PK" '{"v":1,"type":"url","data":{"url":"https://splits.org"},"metadata":{"name":"Splits | Process revenue, move money, run operations globally","image":"https://splits.org/logo_compressed.svg","tagline":"Process revenue, move money, and run operations instantly, anywhere in the world. Treasury and personal accounts, agent-ready tools, and ope","host":"splits.org"}}'

# a token
set_record "$ETHGLOBAL" sponsor-2 "$BOB_PK" '{"v":1,"type":"token","data":{"chainId":8453,"address":"0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b"},"metadata":{"name":"BankrCoin","image":"https://coin-images.coingecko.com/coins/images/52626/large/bankr-static.png?1736405365","tagline":"BNKR on Base","symbol":"BNKR","chainLabel":"Base"}}'

# The app's address book, regenerated from the ledgers this deploy just wrote
# and the constants in `Addresses.sol`. Every chain with a ledger gets an entry,
# so a Sepolia deploy shows up in the app without touching this script.
"$ROOT/scripts/app-deployments.py"

echo
echo "  namespace factory  $NSF"
echo "  resolver           $RESOLVER"
echo "  ethglobal.eth      $ETHGLOBAL"
