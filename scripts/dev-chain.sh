#!/usr/bin/env bash
#
# A forked Sepolia, seeded, on localhost:8545.
#
# Forked rather than fresh, because half of what this project talks to is
# somebody else's deployed code — the ENSv2 verifiable factory, the user
# registry implementation, the 0xSlots factory. A bare anvil would need mocks
# for all of it, and a mock agrees with whatever interface it was written
# from, including a wrong one.
set -euo pipefail

# Foundry nightly prints a banner on stdout, which lands in the middle of the
# JSON these commands are parsed for.
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8545}"

if lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "→ killing whatever holds :$PORT"
  lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "→ anvil, forking $RPC"
anvil --fork-url "$RPC" --port "$PORT" --block-time 2 --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 40); do
  cast block-number --rpc-url "http://127.0.0.1:$PORT" >/dev/null 2>&1 && break
  sleep 0.5
done

echo "→ seeding"
cd "$ROOT/apps/contracts"
forge script script/DevSeed.s.sol:DevSeed \
  --rpc-url "http://127.0.0.1:$PORT" --broadcast --slow \
  | grep -E "^  |wrote " || true

echo
echo "chain ready on http://127.0.0.1:$PORT — ctrl-c to stop"
wait $ANVIL_PID
