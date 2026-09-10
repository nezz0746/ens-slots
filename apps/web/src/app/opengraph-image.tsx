import { ImageResponse } from "next/og";

import { OG_CONTENT_TYPE, OG_SIZE, OgFrame, ogFonts } from "./_og/frame";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "ENS Slots — rentable ENS subnames";

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
        title="Rentable ENS subnames"
        subtitle="Whoever holds one sets its price, pays tax on it continuously, and can be taken out by anyone willing to pay that price."
        facts={[
          { label: "Priced by", value: "Whoever holds it", tone: "brand" },
          { label: "Taken by", value: "Anyone who pays", tone: "hot" },
          { label: "Read with", value: "Plain ENS" },
        ]}
      />
    ),
    { ...size, fonts: await ogFonts() },
  );
}
