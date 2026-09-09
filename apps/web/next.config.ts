import type { NextConfig } from "next";

/**
 * Nothing to configure, which is itself the note worth leaving.
 *
 * ── What used to be here ────────────────────────────────────────────────────
 *
 * A webpack block stubbing out `@x402/*`, `@solana/kit`, `pino-pretty`,
 * `lokijs` and `encoding`. `wagmi/connectors` is a barrel, so importing `mock`
 * and `injected` from it also pulled in Coinbase's Base Account connector,
 * which reaches @base-org/account → @coinbase/cdp-sdk → a family of optional
 * packages that are not installed. They sat behind dynamic imports that never
 * ran for the two connectors this app uses, but webpack resolved them anyway
 * and the whole page 500'd.
 *
 * ── Why it is gone ──────────────────────────────────────────────────────────
 *
 * Two things changed at once. wagmi 3 made every connector's SDK an OPTIONAL
 * peer dependency rather than a hard one, and Next 16 builds with Turbopack,
 * which does not eagerly resolve an import that no reachable code path takes.
 * Either alone might have been enough; together the stubs are dead weight, and
 * a build with none of them compiles and runs.
 *
 * Keeping them would have been worse than untidy. A `resolve.alias` naming a
 * package nothing imports any more is a claim about the dependency graph that
 * has quietly stopped being true, and the next person to hit a resolution error
 * would start from a list that no longer describes anything.
 *
 * If a connector SDK ever does need excluding again, the Turbopack spelling is
 * `turbopack.resolveAlias`, pointing the module at an empty file — Turbopack
 * has no `false` shorthand the way webpack did.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
