import { ImageResponse } from "next/og";

import { OG_CONTENT_TYPE, OG_SIZE, OgFrame, ogFonts } from "./_og/frame";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Taxable subnames — open slots and earn tax income";

/**
 * The card for the front page.
 *
 * ── Title and line, not title and paragraph ─────────────────────────────────
 *
 * The line under the title used to explain the mechanism: a holder names a
 * price, pays tax on it, and can be bought out at it. All true, and all of it
 * read as prose — which is the one thing a card cannot be, because it is seen
 * at thumbnail size in a timeline for about a second.
 *
 * What replaced it leads with what the reader GETS and compresses the mechanism
 * into three hyphenated adjectives. Someone who reads only the first four words
 * has still read the offer.
 *
 * ── And no fact strip ───────────────────────────────────────────────────────
 *
 * It carried "Priced by / Taxed / Taken by", three labelled phrases restating
 * what the line below the title had already said. Three columns of 18px labels
 * are texture at thumbnail size rather than words. The namespace card keeps its
 * strip because those are real figures about a real namespace; this one had
 * nothing to put there, and the room goes to the title instead.
 */
export default async function Image() {
  return new ImageResponse(
    (
      <OgFrame
        title="Taxable subnames"
        subtitle="Open slots and earn tax income from always-on, self-priced, never-squatted subnames."
      />
    ),
    { ...size, fonts: await ogFonts() },
  );
}
