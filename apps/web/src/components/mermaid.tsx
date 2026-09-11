"use client";

import { useEffect, useId, useState } from "react";

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
export function Mermaid({ chart, caption }: { chart: string; caption?: string }) {
  // `useId` is stable across server and client, which matters: Mermaid uses the
  // id to key the `<style>` it emits, and a value from `Math.random()` would
  // differ between the two renders and trip hydration.
  const reactId = useId();
  const id = `m${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  const [svg, setSvg] = useState<string | null>(null);
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
            fontSize: "14px",
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
        if (live) setSvg(out);
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
      <div
        // Mermaid writes an intrinsic width onto the SVG, and left alone it is
        // whatever the layout engine wanted — wider than this column, and wide
        // enough that the PAGE scrolled sideways rather than the figure. Capping
        // it at the container scales the drawing down to fit; `overflow-x-auto`
        // stays as the backstop for one that still will not.
        className="overflow-x-auto rounded-card border border-line bg-surface p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
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
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-ink-faint">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
