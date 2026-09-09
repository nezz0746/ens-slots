"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A modal, on the platform's own `<dialog>`.
 *
 * ── Why the element and not a div ───────────────────────────────────────────
 *
 * `showModal()` brings the things a hand-rolled overlay has to reimplement and
 * usually gets wrong: the top layer, so no `z-index` can lose to a sticky
 * header; a real focus trap; Escape; and `inert` on everything behind it, which
 * keeps a screen reader out of the page underneath. The backdrop is a
 * pseudo-element rather than a sibling, so nothing can end up painted over it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Guarded: calling showModal on an already-open dialog throws.
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      // A click that lands on the element itself is the backdrop — the content
      // below stops propagation by being a child that fills it.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(24rem,calc(100vw-2rem))] rounded-[--radius-card] border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/20 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[11px] text-ink-faint">{description}</p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-mt-1 -mr-1 rounded-lg p-1 text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
