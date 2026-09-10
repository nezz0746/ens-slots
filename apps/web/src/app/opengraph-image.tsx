import { ImageResponse } from "next/og";

import { OG_CONTENT_TYPE, OG_SIZE, OgFrame, ogFonts } from "./_og/frame";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Nameslots — taxable subnames";

/**
 * The card for the front page.
 *
 * ── No fact strip ───────────────────────────────────────────────────────────
 *
 * It carried "Priced by / Taxed / Taken by", three labelled phrases restating
 * what the subtitle had already said in a sentence. A card is read at the size
 * of a thumbnail in a timeline, where three columns of 18px labels are texture
 * rather than words — and they were spending the bottom third of the canvas to
 * be it. The namespace card keeps its strip because those are real figures
 * about a real namespace; this one had nothing to put there.
 *
 * The room goes to the title, which is the part that survives being small.
 */
export default async function Image() {
  return new ImageResponse(
    (
      <OgFrame
        title="Taxable subnames"
        subtitle="Subnames of a name you own, opened to a market. The holder sets what one is worth and pays tax on that number for as long as they keep it — which is also the price anyone can take it from them at."
      />
    ),
    { ...size, fonts: await ogFonts() },
  );
}
