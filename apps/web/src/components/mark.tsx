/**
 * Our symbol. Not ENS's.
 *
 * ENS's guidelines let ecosystem builders adapt their marks but not imply a
 * partnership, and the safe reading of that is to draw our own. This one is a
 * namespace seen from above: nine spaces in a grid, one standing empty and one
 * changing hands. That is the whole product in a shape — a parent name is a
 * set of slots, most of them held, some free, and the interesting one is
 * whichever is being taken.
 *
 * ── Nine rects, not a traced image ──────────────────────────────────────────
 *
 * The artwork is `public/logo.png`, and it is nine rounded squares on a grid,
 * so this is not a tracing of it — it is the same construction stated
 * directly. Three columns of 7 with 1.5 between them fills the 24 box exactly
 * (3×7 + 2×1.5), which is why the numbers are round and why the mark stays
 * crisp at 16px in a browser tab.
 *
 * ── The colours are the palette's, spelled out ──────────────────────────────
 *
 * `--color-brand`, `--color-brand-soft` and `--color-hot` from `globals.css`.
 * Hardcoded rather than read through `currentColor` or a CSS variable because
 * `app/icon.svg` is a static file served outside React and cannot see either,
 * and a favicon that drifts from the header mark is worse than a literal.
 * Changing a colour means changing it in both places, on purpose.
 *
 * That file carries no comment of its own, deliberately: it is served as raw
 * bytes to a favicon parser, and the explanation belongs here where it can be
 * read next to the thing it explains.
 */
const BRAND = "#0080bc";
const BRAND_SOFT = "#cee1e8";
const HOT = "#f53293";

/** Row-major, so the picture is legible in the source. */
const CELLS = [
  BRAND, BRAND, BRAND,
  BRAND, BRAND_SOFT, BRAND,
  BRAND, BRAND, HOT,
];

/** Left/top edge of each column and row. */
const AT = [0, 8.5, 17];

export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      role="presentation"
    >
      {CELLS.map((fill, i) => (
        <rect
          key={i}
          x={AT[i % 3]}
          y={AT[Math.floor(i / 3)]}
          width="7"
          height="7"
          rx="2"
          fill={fill}
        />
      ))}
    </svg>
  );
}
