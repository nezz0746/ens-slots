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

open_namespace() {           # $1 = label, e.g. "community"
  local label="$1" node registry ns res init data
  node=$(namehash "$label")

  init=$(cast calldata "initialize((address,uint256)[])" "[($DEPLOYER,$ALL_ROLES)]")
  registry=$(call "$ENS_VF" "deployProxy(address,uint256,bytes)(address)" "$ENS_UR_IMPL" "$node" "$init" --from "$DEPLOYER")
  send "$DEPLOYER_PK" "$ENS_VF" "deployProxy(address,uint256,bytes)" "$ENS_UR_IMPL" "$node" "$init"

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

  echo "$ns"
}

slot_label() {               # $1 = namespace, $2 = label, $3 = permanent
  send "$DEPLOYER_PK" "$1" "slotLabel(string,address,bytes32,bool)" "$2" "$ZERO" "$ZERO32" "$3"
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

echo "→ community.eth"
COMMUNITY=$(open_namespace community)
for l in sponsor partner banner; do slot_label "$COMMUNITY" "$l" false; done
slot_label "$COMMUNITY" hero true

echo "→ based.eth"
BASED=$(open_namespace based)
for l in builder degen; do slot_label "$BASED" "$l" false; done

echo "→ occupancy"
take "$COMMUNITY" sponsor "$ALICE_PK" "$ALICE" 500000000000000000
take "$COMMUNITY" hero    "$BOB_PK"   "$BOB"   2000000000000000000
take "$BASED"     builder "$ALICE_PK" "$ALICE" 250000000000000000

python3 - "$NSF" <<'PY'
import json, sys
json.dump({
    "chainId": 31337,
    "namespaceFactory": sys.argv[1],
    "slotFactory": "0x14df7d78ef556A80F0AD3ede3F10F1e24f92E1cE",
    "ensVerifiableFactory": "0x894bc9cC8ff1ad96B8a288C86A8C71D662C07780",
    "ensUserRegistryImpl": "0x47B442d0CF617c41CAbAFf5f02f44DD1e5f72546",
    "ensEthRegistry": "0x1D78834d97c1D7b1A38c1deDBD1a287cFEd3971e",
    "ensEthRegistrar": "0x7d1B7f586a62Ac3F54b9A396849757814283270b",
    "ensUniversalResolver": "0xd26f2040D083Af1cD2962ba303F4BEa0c4faf142",
    "mockUsdc": "0xcBFD80F74375c54E545AF34788Ff465F96F66F05",
    "minimumTenureHook": "0xB1e68532Ba467b2310A931abcDD682E718426c9C",
}, open("../web/src/lib/deployment.json", "w"), indent=2)
PY

echo
echo "  namespace factory  $NSF"
echo "  community.eth      $COMMUNITY"
echo "  based.eth          $BASED"
