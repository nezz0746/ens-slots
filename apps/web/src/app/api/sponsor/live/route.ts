import { readFigures } from "@ens-slots/sponsor";
import { NextResponse } from "next/server";

/**
 * The figures that move, fetched at RENDER rather than stored.
 *
 * Price, liquidity and 24h volume are the numbers a pool card is actually
 * about, and they are the ones that must never enter the record: frozen at
 * publish time they would be wrong within the hour, and the sponsor would have
 * to pay gas to correct something nobody asked them to promise.
 *
 * Proxied rather than fetched from the browser for two reasons — the card then
 * works under any publisher's content policy, and the index allows 30 anonymous
 * requests a minute, which a page rendering several cards would burn through on
 * its own. Caching here means one request serves every reader.
 */
export const runtime = "nodejs";
export const revalidate = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chainId = Number(url.searchParams.get("chainId"));
  const address = url.searchParams.get("address") ?? "";
  const kind = url.searchParams.get("kind") === "token" ? "token" : "pool";

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ figures: null });
  }

  // A card that cannot reach the index shows its metadata and no figures,
  // which is a worse card and not a broken one.
  const figures = await readFigures(chainId, address, kind).catch(() => null);
  return NextResponse.json({ figures });
}
