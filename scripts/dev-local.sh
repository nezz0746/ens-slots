#!/usr/bin/env bash
#
# The whole stack: a forked chain, our contracts on it, and the app.
#
# One command because the three are useless apart — the app reads addresses
# the seed writes, and the seed needs a chain. Killing this kills all of it.
set -euo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8545}"

cleanup() { jobs -p | xargs kill -9 2>/dev/null || true; }
trap cleanup EXIT INT TERM

if lsof -ti :"$PORT" >/dev/null 2>&1; then
  lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "→ anvil, forking sepolia"
anvil --fork-url "$RPC" --port "$PORT" --block-time 2 --silent &

for _ in $(seq 1 60); do
  cast block-number --rpc-url "http://127.0.0.1:$PORT" >/dev/null 2>&1 && break
  sleep 0.5
done

"$ROOT/scripts/seed.sh"

echo
echo "→ app on http://localhost:3000"
cd "$ROOT/apps/web" && pnpm dev
