import { NextResponse } from "next/server";

/**
 * What a token is worth in dollars, via Alchemy's Prices API.
 *
 * ── Why a route and not a fetch from the page ─────────────────────────────
 *
 * The key. Alchemy puts it in the URL PATH rather than a header, so any
 * browser-side call would ship it to every visitor in plain sight — a
 * `NEXT_PUBLIC_` variable is a published variable. Here it stays on the server
 * and the browser only ever sees a number.
 *
 * ── Missing key is not an error ───────────────────────────────────────────
 *
 * `null`, not a 500. Dollar figures are an ornament on top of the ETH ones; an
 * app cloned without a key should render every slot and simply not say what it
 * is worth in dollars, rather than showing an error where a price would be.
 */
export const runtime = "nodejs";

/**
 * Cached at the EDGE, never prerendered.
 *
 * This was `export const revalidate = 60`, and that is a different thing than
 * it looks: it made the route eligible to be rendered AT BUILD TIME. The build
 * had no `ALCHEMY_API_KEY`, so the branch above ran, and
 * `{"usd":null,"reason":"no key"}` was baked into the ISR cache — with
 * `stale-while-revalidate` measured in a year. The key was added to the running
 * container afterwards and changed nothing, because no request ever reached the
 * function again:
 *
 *     x-nextjs-cache: HIT
 *     {"usd":null,"reason":"no key"}
 *
 * `/api/identity` never had the problem: it reads a search param, which makes
 * it dynamic by force, and it caches with a response header instead. Same
 * approach here. `force-dynamic` guarantees the function runs and reads the
 * environment the container actually has; the header still gives one upstream
 * call a minute for every reader.
 *
 * The rule this is an instance of: a value that depends on a SECRET must not be
 * computed at build time, because the build is the one place the secret is
 * least likely to exist.
 */
export const dynamic = "force-dynamic";
/**
 * Never cached, anywhere.
 *
 * `no-store` on every response, so neither a CDN, a proxy, nor the browser
 * keeps one. This app is demonstrated live and a cached answer during a demo
 * reads as the app being broken, not as a saved request — and this route in
 * particular has already served a stale `{"reason":"no key"}` for a day after
 * the key was added, because it had been rendered once and kept.
 */
const CACHE = "no-store";

export async function GET(request: Request) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key)
    return NextResponse.json(
      { usd: null, reason: "no key" },
      { headers: { "cache-control": CACHE } },
    );

  const symbol = new URL(request.url).searchParams.get("symbol") ?? "ETH";
  // Guard the interpolation: this value lands in a URL path.
  if (!/^[A-Za-z0-9]{1,12}$/.test(symbol))
    return NextResponse.json(
      { usd: null, reason: "bad symbol" },
      { headers: { "cache-control": CACHE } },
    );

  try {
    const res = await fetch(
      `https://api.g.alchemy.com/prices/v1/${key}/tokens/by-symbol?symbols=${symbol}`,
      // `no-store`, not `next.revalidate`: the upstream price must be read
      // per request too, or the route is live and its data is not.
      { headers: { accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok)
      return NextResponse.json(
        { usd: null, reason: `upstream ${res.status}` },
        { headers: { "cache-control": CACHE } },
      );

    const json = (await res.json()) as {
      data?: {
        symbol: string;
        prices?: { currency: string; value: string }[];
      }[];
    };
    const usd = json.data
      ?.find((d) => d.symbol.toUpperCase() === symbol.toUpperCase())
      ?.prices?.find((p) => p.currency === "usd")?.value;

    return NextResponse.json(
      { usd: usd ? Number(usd) : null },
      { headers: { "cache-control": CACHE } },
    );
  } catch {
    return NextResponse.json(
      { usd: null, reason: "unreachable" },
      { headers: { "cache-control": CACHE } },
    );
  }
}
