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
# Forked, but with anvil's own chain id.
#
# `--fork-url` alone INHERITS the forked chain's id, so a local chain would
# answer 11155111 — the same id as Sepolia proper. Two things break on that and
# both are silent: the app declares its local chain as 31337 in `chains.ts`, so
# every write is prepared for a chain the node does not claim to be; and
# `pnpm protocol` keys its deployment ledger on the chain id, so a local deploy
# would overwrite the record of what is live on real Sepolia.
anvil --fork-url "$RPC" --chain-id 31337 --port "$PORT" --block-time 2 --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 40); do
  cast block-number --rpc-url "http://127.0.0.1:$PORT" >/dev/null 2>&1 && break
  sleep 0.5
done

# The same seed `dev:local` runs. It used to be a `forge script` that no
# longer exists — see the note at the top of seed.sh for why it cannot be one.
"$ROOT/scripts/seed.sh"

echo
echo "chain ready on http://127.0.0.1:$PORT — ctrl-c to stop"
wait $ANVIL_PID
