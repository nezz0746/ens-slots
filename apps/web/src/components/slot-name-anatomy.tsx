/**
 * What a slot name is, in one picture.
 *
 * ── Why this is hand-built and not a Mermaid diagram ────────────────────────
 *
 * Every other drawing on this page is a graph of contracts, and Mermaid is good
 * at those. This one is a piece of TYPOGRAPHY: the whole point is that the two
 * halves of `base.l2beat.eth` belong to different people, and the way to show
 * that is to set the name large and colour the halves. A box-and-arrow tool
 * draws boxes, and a box around the word "base" says nothing the word did not
 * already say.
 *
 * It is also the first thing on the page, which means it is the diagram most
 * people will read and many will only read — so it gets to be the one that is
 * laid out by hand.
 */

type Part = {
  text: string;
  /** The trailing dot, kept out of the coloured span so the colour hugs the word. */
  dot?: boolean;
  tone: "hot" | "brand" | "faint";
  label: string;
  who: string;
  lines: string[];
};

const PARTS: Part[] = [
  {
    text: "base",
    dot: true,
    tone: "hot",
    label: "The slot",
    who: "Whoever is paying for it",
    lines: [
      "They named the price themselves.",
      "They pay tax on that number, continuously.",
      "Anyone can take it from them at it.",
    ],
  },
  {
    text: "l2beat",
    dot: true,
    tone: "brand",
    label: "Your name",
    who: "You",
    lines: [
      "An ordinary .eth name you already own.",
      "You choose which subnames open, and on what terms.",
      "Every slot under it pays its tax to you.",
    ],
  },
  {
    text: "eth",
    tone: "faint",
    label: "Ordinary ENS",
    who: "No one — it is just ENS",
    lines: [
      "No SDK, no API key, no contract address.",
      "getEnsAddress('base.l2beat.eth') is the whole integration.",
    ],
  },
];

const TONE = {
  hot: {
    text: "text-hot",
    rule: "bg-hot",
    chip: "bg-hot-soft text-ink",
    card: "border-hot-soft",
  },
  brand: {
    text: "text-brand",
    rule: "bg-brand",
    chip: "bg-brand-soft text-brand-ink",
    card: "border-brand-soft",
  },
  faint: {
    text: "text-ink-faint",
    rule: "bg-line",
    chip: "bg-canvas text-ink-soft",
    card: "border-line",
  },
} as const;

export function SlotNameAnatomy() {
  return (
    <figure className="my-8">
      {/* The name itself. `break-words` rather than `nowrap`: on a narrow
          screen a wrapped name is still readable, a clipped one is not. */}
      <div className="rounded-card border border-line bg-surface px-5 py-8 sm:px-8">
        {/*
         * The separators are their own spans, OUTSIDE the coloured words and
         * outside the underlines. A dot inside `base`'s span would be tinted
         * as if it belonged to the slot and would sit over its rule — but the
         * dot belongs to neither side, which is the whole point of the picture.
         *
         * `aria-hidden` on the pieces and the real name in one `sr-only` span:
         * a screen reader should hear "base.l2beat.eth", not seven fragments.
         */}
        <div
          aria-hidden
          className="flex flex-wrap items-end justify-center gap-y-2"
        >
          {PARTS.map((part) => (
            <span key={part.text} className="flex items-end">
              <span className="flex flex-col items-center">
                <span
                  className={`text-4xl leading-none font-bold tracking-tight sm:text-6xl ${TONE[part.tone].text}`}
                >
                  {part.text}
                </span>
                {/* The only thing tying a word to its card below, so it
                    matches that card's accent exactly. */}
                <span
                  className={`mt-2 h-[3px] w-full rounded-full ${TONE[part.tone].rule}`}
                />
              </span>
              {part.dot && (
                <span className="pb-[11px] text-4xl leading-none font-bold text-ink-faint sm:text-6xl">
                  .
                </span>
              )}
            </span>
          ))}
        </div>
        <span className="sr-only">base.l2beat.eth</span>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {PARTS.map((part) => (
            <div
              key={part.text}
              className={`rounded-xl border bg-surface p-4 ${TONE[part.tone].card}`}
            >
              <span
                className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${TONE[part.tone].chip}`}
              >
                {part.label}
              </span>
              <p className="mt-2 text-sm font-semibold text-ink">{part.who}</p>
              <ul className="mt-2 space-y-1.5">
                {part.lines.map((line) => (
                  <li
                    key={line}
                    className="text-[12px] leading-relaxed text-ink-soft"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
