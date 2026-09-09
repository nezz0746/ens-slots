"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A menu anchored under its trigger.
 *
 * Closes on Escape, on a click anywhere outside, and — the one that is easy to
 * miss — on losing focus to somewhere else in the page, so a keyboard user
 * tabbing past it does not leave an open menu floating behind them.
 */
export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={cn(
            "absolute top-[calc(100%+0.375rem)] z-30 min-w-[11rem] overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

/** One row in a {Dropdown}. */
export function MenuItem({
  onClick,
  children,
  active,
  tone,
}: {
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
        tone === "danger"
          ? "text-hot hover:bg-hot-soft"
          : active
            ? "bg-brand-soft font-medium text-brand-ink"
            : "text-ink-soft hover:bg-canvas hover:text-ink",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
      )}
    >
      {children}
    </button>
  );
}
