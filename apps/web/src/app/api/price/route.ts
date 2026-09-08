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
// Prices move slower than the page refetches, and every card asks for the same
// one. One upstream call a minute serves every reader.
export const revalidate = 60;

export async function GET(request: Request) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return NextResponse.json({ usd: null, reason: "no key" });

  const symbol = new URL(request.url).searchParams.get("symbol") ?? "ETH";
  // Guard the interpolation: this value lands in a URL path.
  if (!/^[A-Za-z0-9]{1,12}$/.test(symbol))
    return NextResponse.json({ usd: null, reason: "bad symbol" });

  try {
    const res = await fetch(
      `https://api.g.alchemy.com/prices/v1/${key}/tokens/by-symbol?symbols=${symbol}`,
      { headers: { accept: "application/json" }, next: { revalidate: 60 } },
    );
    if (!res.ok) return NextResponse.json({ usd: null, reason: `upstream ${res.status}` });

    const json = (await res.json()) as {
      data?: { symbol: string; prices?: { currency: string; value: string }[] }[];
    };
    const usd = json.data
      ?.find((d) => d.symbol.toUpperCase() === symbol.toUpperCase())
      ?.prices?.find((p) => p.currency === "usd")?.value;

    return NextResponse.json({ usd: usd ? Number(usd) : null });
  } catch {
    return NextResponse.json({ usd: null, reason: "unreachable" });
  }
}
