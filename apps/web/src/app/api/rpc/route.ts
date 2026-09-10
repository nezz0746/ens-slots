import { NextResponse } from "next/server";

/**
 * The chain, through us, so the key stays here.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The wagmi config used to say `http(undefined)`, which means viem's built-in
 * default for the chain — a shared public endpoint, rate limited per IP and
 * shared with everyone else who also never set one. It is fine until several
 * people open the app at once, and then reads start failing in ways that look
 * like the app hanging rather than like a quota.
 *
 * ── Why a route and not `NEXT_PUBLIC_ALCHEMY_...` ───────────────────────────
 *
 * Alchemy puts the key in the URL PATH, so a browser-side URL ships it to every
 * visitor in plain sight. Same reasoning as `/api/price`, which exists for
 * exactly this: `NEXT_PUBLIC_` is a synonym for published.
 *
 * ── No key is not an error ──────────────────────────────────────────────────
 *
 * A clone with no key falls through to the same public endpoint the app used
 * before, so it still works — just with the limits it always had. That keeps
 * this an upgrade rather than a new thing to configure before anything runs.
 */
export const runtime = "nodejs";
// A JSON-RPC answer is only true for one block; caching one would hand a stale
// nonce or balance to the next caller.
export const dynamic = "force-dynamic";

/** viem's built-in default, and what a keyless deployment keeps using. */
const PUBLIC_FALLBACK = "https://11155111.rpc.thirdweb.com";

const upstream = () => {
  const key = process.env.ALCHEMY_API_KEY;
  return key ? `https://eth-sepolia.g.alchemy.com/v2/${key}` : PUBLIC_FALLBACK;
};

export async function POST(request: Request) {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json({ error: "Expected a JSON-RPC body" }, { status: 400 });
  }

  try {
    const res = await fetch(upstream(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      // Batched reads are the common case here and they are not small; a slow
      // upstream should surface as an error the app can show, not as a request
      // that never settles.
      signal: AbortSignal.timeout(20_000),
    });

    // Passed through as text: a JSON-RPC error is a 200 with an `error` member,
    // and re-encoding it risks changing a bigint-shaped string on the way.
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Upstream RPC unreachable" } },
      { status: 502 },
    );
  }
}
