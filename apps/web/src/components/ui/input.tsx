"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-brand disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The same field, for the one value that runs to a sentence.
 *
 * `description` is prose and the others are a handle or a URL, so a single-line
 * box would hide most of what was typed behind a scroll the writer cannot see
 * out of. Everything else matches {Input} exactly — same border, same focus,
 * same radius — because it is the same control with room to wrap.
 */
export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-brand disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("text-xs font-medium text-ink-soft", className)}
      {...props}
    />
  );
}
