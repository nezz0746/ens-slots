"use client";

import { useEffect, useId, useState } from "react";

/**
 * The smallest a diagram may be scaled before it is allowed to overflow and
 * scroll instead. At Mermaid's 16px base this keeps labels at ~11px, which is
 * the bottom of what is comfortable rather than the bottom of what is possible.
 */
const MIN_SCALE = 0.7;

/**
 * One Mermaid diagram, drawn in the browser.
 *
 * ── Why the import is dynamic ───────────────────────────────────────────────
 *
 * Mermaid is well over a megabyte — larger than the rest of this app put
 * together — and exactly one route uses it. A static import would put it in the
 * shared chunk and make every page that never draws a diagram pay for it, so it
 * is loaded inside the effect instead: nothing is fetched until a diagram is
 * actually on screen.
 *
 * ── Why the source is not trusted to be valid ───────────────────────────────
 *
 * The diagrams come from `docs/protocol.md`, which is edited by hand. A typo
 * there is a parse error here, and Mermaid's default response to one is to
 * inject its own red error graphic into the DOM — inside whatever container it
 * was pointed at, styled nothing like this app. `suppressErrorRendering` turns
 * that off so the throw reaches the catch below and the page can say what broke
 * and keep the rest of itself intact.
 */
export function Mermaid({
  chart,
  caption,
}: {
  chart: string;
  caption?: string;
}) {
  // `useId` is stable across server and client, which matters: Mermaid uses the
  // id to key the `<style>` it emits, and a value from `Math.random()` would
  // differ between the two renders and trip hydration.
  const reactId = useId();
  const id = `m${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  const [svg, setSvg] = useState<string | null>(null);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: "base",
          // The app's own palette, so a diagram reads as part of the page
          // rather than as a screenshot of a different tool. Per-node colour
          // still comes from each diagram's own `classDef`.
          themeVariables: {
            fontFamily: "var(--font-urbanist), system-ui, sans-serif",
            fontSize: "16px",
            primaryColor: "#cee1e8",
            primaryTextColor: "#011a25",
            primaryBorderColor: "#0080bc",
            lineColor: "#4a5c63",
            secondaryColor: "#f6f6f6",
            tertiaryColor: "#ffffff",
            background: "#ffffff",
            mainBkg: "#cee1e8",
          },
        });
        const { svg: out } = await mermaid.render(id, chart);
        if (!live) return;
        // The drawing's own width, before any scaling. Read from the viewBox
        // because that is the only place Mermaid states it honestly — the
        // `width`/`style` it also writes are already a fitted size.
        const box = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(out);
        setNaturalWidth(box ? Number(box[1]) : 0);
        setSvg(out);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      live = false;
    };
  }, [chart, id]);

  if (error) {
    return (
      <div className="rounded-card border border-hot-soft bg-hot-soft/40 px-4 py-3 text-xs text-ink">
        <p className="font-semibold">This diagram did not parse.</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-soft">
          {error}
        </pre>
      </div>
    );
  }

  return (
    <figure className="my-6">
      <div className="overflow-x-auto rounded-card border border-line bg-surface p-4">
        {/*
         * A floor on legibility, not on size.
         *
         * Left to fit the page, a wide diagram shrinks until it fits — and the
         * widest one here is 2762px of drawing, which fitted to the column at
         * 0.46 and put its labels at an effective 6.5px. That is not a small
         * diagram, it is an unreadable one, and shrinking further to avoid a
         * scrollbar trades the only thing the picture was for.
         *
         * `MIN_SCALE` of the natural width as a floor inverts it: anything that
         * fits above that scale simply fits, and anything that does not stops
         * shrinking and scrolls sideways inside this box instead. The page never
         * scrolls horizontally either way — the overflow is the figure's.
         */}
        <div
          style={{
            minWidth: naturalWidth ? naturalWidth * MIN_SCALE : undefined,
          }}
          className="[&_svg]:mx-auto [&_svg]:!h-auto [&_svg]:!w-full"
        >
          {svg ? (
            // Mermaid's own output, rendered from source this repo controls.
            // eslint-disable-next-line react/no-danger
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="flex h-40 items-center justify-center text-xs text-ink-faint">
              drawing…
            </div>
          )}
        </div>
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-ink-faint">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
