"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * ENS's own mark, where we have it.
 *
 * ── Why this is not drawn in code ───────────────────────────────────────────
 *
 * Every other glyph in this app is hand-authored SVG. This one is somebody
 * else's trademark, and an approximation of a trademark is worse than no
 * trademark: it is both wrong and still theirs. So it loads the real file and
 * falls back to the word — which is accurate, needs no licence, and is what
 * `Powered by ENS` means anyway.
 *
 * Drop the official SVG at `apps/web/public/ens-mark.svg` and it appears. The
 * fallback is not a placeholder to be cleaned up later; it is the correct
 * rendering when the asset is absent, and it is what a clone of this repo gets.
 */
export function EnsMark({
  className,
  /**
   * What to draw when the asset is absent.
   *
   * `"word"` where the mark stands alone and something must identify it;
   * `"none"` where the caller already writes "ENS" beside it, which would
   * otherwise render as "ens ENS" the moment the file is missing.
   */
  fallback = "word",
}: {
  className?: string;
  fallback?: "word" | "none";
}) {
  const [missing, setMissing] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  /**
   * Catch a failure that already happened.
   *
   * `onError` only fires for an error React was listening for, and the browser
   * requests this image while parsing the server's HTML — before hydration
   * attaches any handler. So a missing file 404'd, the handler arrived late,
   * and the page painted a broken-image glyph next to the word "Powered by"
   * forever. Asking the element after mount catches the case the event missed:
   * a decoded image has a natural width, and a failed one does not.
   */
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) setMissing(true);
  }, []);

  if (missing) {
    if (fallback === "none") return null;
    return (
      <span
        className={cn(
          "font-bold tracking-tight text-brand lowercase",
          className,
        )}
      >
        ens
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      src="/ens-mark.svg"
      // Empty alt where the caller already writes "ENS" beside it: the mark is
      // decorative there, and a missing file otherwise paints its alt text next
      // to that word as "ENS ENS" — which is what it did.
      alt={fallback === "none" ? "" : "ENS"}
      onError={() => setMissing(true)}
      className={cn("inline-block w-auto", className)}
    />
  );
}

/**
 * The line under the hero.
 *
 * Kept to a statement of fact. ENS's brand guidelines ask third parties not to
 * use their marks in a way that implies a partnership, and "powered by" is the
 * plainest true thing this app can say: the names really are ENS names, and
 * nothing here works without them.
 */
export function PoweredByEns({ className }: { className?: string }) {
  return (
    <a
      href="https://ens.domains"
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-ink-soft",
        className,
      )}
    >
      Powered by
      <EnsMark className="h-4" />
    </a>
  );
}
