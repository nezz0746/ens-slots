import { isKnownType, SPONSOR_TYPES } from "@ens-slots/sponsor";
import { ZodError } from "zod";
import { NextResponse } from "next/server";

/**
 * Turn what a sponsor typed into what goes on chain.
 *
 * ── Why this is a route and not a hook ────────────────────────────────────
 *
 * Enrichment fetches third-party pages and indexes. Doing it in the browser
 * would put every one of those hosts behind the publisher's CORS policy and
 * their content policy, and OG scraping in particular is simply not possible
 * from a page. Server-side it is four fetches and no permission.
 *
 * ── Why it runs ONCE, at publish ──────────────────────────────────────────
 *
 * The result is frozen into the record, so a reader never calls this — or us —
 * again. That is the whole point: a record that needed this endpoint to be
 * readable would make this app the infrastructure the design exists to avoid
 * being. Anything that would go stale is deliberately not here; see the note
 * on `SponsorDefinition`.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const { type, data } = (body ?? {}) as { type?: string; data?: unknown };

  if (!type || !isKnownType(type)) {
    return NextResponse.json(
      { error: `Unknown type: ${type ?? "(none)"}` },
      { status: 400 },
    );
  }

  try {
    const built = await SPONSOR_TYPES[type].build(data);
    return NextResponse.json({ type, ...built });
  } catch (error) {
    // The sponsor is about to sign a transaction on the strength of this, so
    // the reason has to reach them in words. A pointer that does not resolve is
    // the common case and it is their input to fix, not an outage.
    return NextResponse.json({ error: explain(error) }, { status: 422 });
  }
}

/**
 * The failure, said the way the person who caused it would say it.
 *
 * Two shapes reach here and neither is presentable raw. A `ZodError` serialises
 * to an array of objects with `path` and `code`, which is a stack trace wearing
 * a schema; and `fetch` rejects with the single word "fetch failed" for
 * everything from a typo in a hostname to a host that is simply down.
 */
function explain(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
  }

  const message = error instanceof Error ? error.message : "";

  if (/fetch failed|ENOTFOUND|ECONNREFUSED|aborted|timeout/i.test(message)) {
    return "Could not reach that — check the address and that the page loads.";
  }

  return message || "Could not read that";
}
