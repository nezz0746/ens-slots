import { ImageResponse } from "next/og";

import { OG_CONTENT_TYPE, OG_SIZE, OgFrame, ogFonts } from "../_og/frame";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Open a namespace on ENS Slots";

/**
 * The card for the page that opens a namespace.
 *
 * Addressed to the other side of the market. Everything else here speaks to
 * somebody who might take a name; this speaks to the person who has one and
 * has not thought of its subnames as inventory.
 */
export default async function Image() {
  return new ImageResponse(
    (
      <OgFrame
        title="Open a namespace"
        subtitle="Put the subnames of a name you own on the market. You set the terms once; the holders set the prices, continuously."
        facts={[
          { label: "You keep", value: "The parent name", tone: "brand" },
          { label: "You collect", value: "The tax" },
          { label: "They set", value: "The price", tone: "hot" },
        ]}
      />
    ),
    { ...size, fonts: await ogFonts() },
  );
}
