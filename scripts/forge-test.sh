#!/usr/bin/env bash
#
# `forge test`, with the repository's `.env` actually loaded.
#
# ── Why this exists ─────────────────────────────────────────────────────────
#
# The fork tests need `SEPOLIA_RPC_URL` and skip themselves without it. The
# endpoint is configured in `.env` at the REPOSITORY ROOT, which is where
# `.env.example` puts it and where `scripts/protocol` reads it from — but
# `forge` reads a `.env` from the Foundry project root, which is
# `apps/contracts`. There has never been one there.
#
# So `pnpm test` ran with no endpoint, every suite skipped its `setUp`, and the
# run finished:
#
#     Ran 5 test suites: 0 tests passed, 0 failed, 5 skipped (5 total tests)
#     Tasks: 3 successful, 3 total
#
# Exit 0. A green banner over sixty-six tests that did not execute — and this
# suite is the only thing standing between a changed ENSv2 or 0xSlots signature
# and a deploy, so it was the one green light that most needed to be real.
#
# Everything after `--` is handed to `forge test`, so `pnpm test -- --match-path
# test/Terms.t.sol` works the way it looks like it should.
set -euo pipefail

export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

# Said here rather than from inside `setUp`, because forge hides a skipped
# test's logs at default verbosity — a warning there is one nobody sees, which
# is the same silence it would be trying to break. This is on stderr, before
# forge prints anything, and it is the only place the reader is guaranteed to
# be looking.
if [ -z "${SEPOLIA_RPC_URL:-}" ]; then
  cat >&2 <<'WARN'

  ────────────────────────────────────────────────────────────────────────
   SEPOLIA_RPC_URL is not set. EVERY FORK TEST WILL SKIP.

   Whatever this run prints, nothing was verified — and this suite is the
   only check on the ENSv2 and 0xSlots signatures this repo declares by
   hand. Copy .env.example to .env at the repository root.
  ────────────────────────────────────────────────────────────────────────

WARN
fi

cd "$ROOT/apps/contracts"
exec forge test "$@"
