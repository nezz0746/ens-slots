import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tones map onto ENS's extended palette — see `globals.css` for why.
 *
 * `warn` sets Dark Brown on Light Yellow rather than anything on #FFF72F:
 * their yellow is a highlighter, not a text colour, and type on it fails
 * contrast at any weight.
 */
export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & {
  tone?: "neutral" | "brand" | "good" | "warn" | "bad";
}) {
  const tones = {
    neutral: "bg-canvas text-ink-soft border-line",
    brand: "bg-brand-soft text-brand-ink border-transparent",
    good: "bg-good-soft text-good border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
    bad: "bg-hot-soft text-hot border-transparent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
