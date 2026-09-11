import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The picture that goes in front of a link, and the one place it is drawn.
 *
 * ── Why a shared frame and not one file per route ─────────────────────────
 *
 * Three routes want the same card with different words in it. Satori's layout
 * is inline styles only — no Tailwind, no `globals.css` — so every route that
 * drew its own would carry its own copy of the palette, the mark and the
 * spacing, and they would drift apart the first time one of them was touched.
 *
 * ── Why the font is vendored rather than fetched ──────────────────────────
 *
 * `next/font/google` cannot help here: it emits CSS for a browser, and Satori
 * needs the font's BYTES. The obvious fix is to fetch Urbanist from Google when
 * the image is generated, and the reason not to is the same one in `layout.tsx`
 * — except one step removed. A reader's browser never touches Google either
 * way, since it only ever sees the finished PNG. What it would cost is that
 * generating an image becomes a network call that can fail, on a path whose
 * whole job is to answer a crawler quickly. Two 40KB TTFs ship with the app
 * instead.
 *
 * WOFF2 is deliberately not used: Satori cannot read it. These are the plain
 * TrueType files Google serves to a client that asks for no format at all.
 *
 * They live in `public/` rather than beside this file because the dynamic card
 * reads them per REQUEST, and `public/` is the one directory every Next.js
 * deployment target is guaranteed to ship. Source next to a compiled route is
 * not: a build image free to drop `src/` after building would take the fonts
 * with it, and the failure would appear only in production, only on the one
 * card that is not prerendered.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const BRAND = "#0080bc";
const BRAND_INK = "#093c52";
const BRAND_SOFT = "#cee1e8";
const HOT = "#f53293";
const INK = "#011a25";
const INK_SOFT = "#4a5c63";
const SURFACE = "#ffffff";

/**
 * The two weights, read off disk once per render.
 *
 * `process.cwd()` is the app's own root under both `next dev` and `next start`,
 * which is the only thing this path depends on.
 */
export async function ogFonts() {
  const at = (file: string) =>
    readFile(join(process.cwd(), "public/fonts", file));

  const [medium, bold] = await Promise.all([
    at("Urbanist-Medium.ttf"),
    at("Urbanist-Bold.ttf"),
  ]);

  return [
    { name: "Urbanist", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "Urbanist", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}

/**
 * The mark, as nine divs rather than the SVG in `components/mark.tsx`.
 *
 * Same nine squares, same three colours, same construction — three columns of
 * 7 with 1.5 between them — scaled up. Drawn with boxes because that is the
 * one primitive Satori is certain about, and a favicon that failed to render
 * inside an OG image would fail silently, as a blank corner nobody notices
 * until the link is already posted.
 */
function Mark({ size }: { size: number }) {
  const cell = (size - 2 * (size / 16)) / 3;
  const gap = size / 16;
  const cells = [
    BRAND, BRAND, BRAND,
    BRAND, BRAND_SOFT, BRAND,
    BRAND, BRAND, HOT,
  ];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: size, height: size, gap }}>
      {cells.map((fill, i) => (
        <div
          key={i}
          style={{
            width: cell,
            height: cell,
            borderRadius: cell / 3.5,
            backgroundColor: fill,
          }}
        />
      ))}
    </div>
  );
}

/** One fact in the strip along the bottom. */
export type Fact = { label: string; value: string; tone?: "ink" | "brand" | "hot" };

export function OgFrame({
  title,
  subtitle,
  facts = [],
}: {
  title: string;
  /** Optional: a card whose title already says the whole thing omits it. */
  subtitle?: string;
  facts?: Fact[];
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: SURFACE,
        // `ens-wash`, at this canvas's scale. The same three tints in the same
        // three corners as the app's own background.
        //
        // `rgba()` rather than the 8-digit hex `globals.css` uses: Satori reads
        // `#f2c4da88` as neither a colour nor an error, and the whole wash came
        // out a flat grey smudge — worse than no wash at all, and silent.
        //
        // The tints are also stronger here than in the app. This is drawn once
        // at 1200×630 and then seen at whatever size a timeline gives it, where
        // a background tuned to sit behind a page of text disappears entirely.
        backgroundImage: [
          "radial-gradient(760px 460px at 0% 0%, rgba(206,225,232,0.95) 0%, rgba(206,225,232,0) 70%)",
          "radial-gradient(620px 380px at 100% 0%, rgba(242,196,218,0.75) 0%, rgba(242,196,218,0) 72%)",
          "radial-gradient(560px 300px at 62% 100%, rgba(248,246,214,0.65) 0%, rgba(248,246,214,0) 74%)",
        ].join(","),
        padding: 72,
        fontFamily: "Urbanist",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Mark size={56} />
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: INK }}>
          Nameslots
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          gap: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            // Bigger with no strip below it. A card is read as a thumbnail
            // first, and the title is the only part that survives that.
            fontSize: facts.length > 0 ? 86 : 104,
            fontWeight: 700,
            color: INK,
            lineHeight: 1.05,
            letterSpacing: -2,
            // Wrapped by hand nowhere: Satori breaks on width, and a title long
            // enough to need three lines is a title that should be shorter.
            maxWidth: 940,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              display: "flex",
              fontSize: facts.length > 0 ? 30 : 34,
              fontWeight: 500,
              color: INK_SOFT,
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {facts.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 48,
            borderTop: `2px solid ${BRAND_SOFT}`,
            paddingTop: 26,
          }}
        >
          {facts.map((fact) => (
            <div
              key={fact.label}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: INK_SOFT,
                }}
              >
                {fact.label}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 34,
                  fontWeight: 700,
                  color:
                    fact.tone === "brand"
                      ? BRAND
                      : fact.tone === "hot"
                        ? HOT
                        : BRAND_INK,
                }}
              >
                {fact.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
