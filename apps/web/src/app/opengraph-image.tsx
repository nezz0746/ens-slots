import { ImageResponse } from "next/og";

import { OG_CONTENT_TYPE, OG_SIZE, OgFrame, ogFonts } from "./_og/frame";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Earn tax on precious subnames";

/**
 * The card for the front page. One line, and nothing under it.
 *
 * ── Why there is no subtitle ────────────────────────────────────────────────
 *
 * There was a three-line one explaining that a holder names a price, pays tax
 * on it, and can be bought out at it. All true, and all of it read as a
 * paragraph — which is the one thing a card cannot be, because it is seen at
 * thumbnail size in a timeline for about a second. Anything that needs reading
 * is not there.
 *
 * The line that replaced it says what the reader GETS, and the mechanism is
 * what they find out afterwards on a page that has room to explain it.
 *
 * ── And no fact strip ───────────────────────────────────────────────────────
 *
 * It carried "Priced by / Taxed / Taken by", three labelled phrases restating
 * what the subtitle had already said. Three columns of 18px labels are texture
 * at thumbnail size rather than words. The namespace card keeps its strip
 * because those are real figures about a real namespace; this one had nothing
 * to put there.
 *
 * Both removals buy the same thing: room for the title, which is the only part
 * that survives being small.
 */
export default async function Image() {
  return new ImageResponse(<OgFrame title="Earn tax on precious subnames" />, {
    ...size,
    fonts: await ogFonts(),
  });
}
