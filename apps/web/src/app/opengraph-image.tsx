import { ImageResponse } from "next/og";

import { OG_CONTENT_TYPE, OG_SIZE, OgFrame, ogFonts } from "./_og/frame";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Nameslots — taxable subnames";

/**
 * The card for the front page.
 *
 * The three facts are the three properties the headline claims, stated as
 * things rather than adjectives. They are constants because they are true of
 * the protocol rather than of any deployment — a figure read off a chain would
 * be a number a crawler cached last Tuesday.
 */
export default async function Image() {
  return new ImageResponse(
    (
      <OgFrame
        title="Taxable subnames"
        subtitle="Subnames of a name you own, opened to a market. The holder sets what one is worth and pays tax on that number for as long as they keep it."
        facts={[
          { label: "Priced by", value: "Whoever holds it", tone: "brand" },
          { label: "Taxed", value: "Continuously" },
          { label: "Taken by", value: "Anyone who pays", tone: "hot" },
        ]}
      />
    ),
    { ...size, fonts: await ogFonts() },
  );
}
