"use client";

import { Loader2 } from "lucide-react";
import { useAccount } from "wagmi";

import { useMounted } from "@/hooks/use-mounted";
import { useOwnedNames } from "@/hooks/use-owned-names";
import { cn } from "@/lib/utils";

/**
 * Names this account already holds, as a shortcut into the form.
 *
 * ── Why it exists ───────────────────────────────────────────────────────────
 *
 * Step 1 is a text field, and a text field asks somebody to remember and
 * retype a name they already own — then tells them, two chain reads later,
 * whether they got it right. Every name in this list is one the account holds
 * and has NOT opened yet, so clicking it skips both the typing and the
 * possibility of typing it wrong.
 *
 * ── Why "already open" ones are absent rather than disabled ─────────────────
 *
 * This is a list of things you can do next. A name with a namespace is managed
 * on its own page, not here, so offering it greyed out would be offering the
 * wrong destination. {useOwnedNames} filters them out at the source.
 */
export function OwnedNames({
  selected,
  onPick,
}: {
  selected: string;
  onPick: (label: string) => void;
}) {
  const { isConnected } = useAccount();
  const mounted = useMounted();
  const { data: names, isLoading } = useOwnedNames();

  // See {useMounted}: the server has no wallet, so it renders nothing here.
  if (!mounted || !isConnected) return null;

  return (
    <aside className="lg:w-56 lg:shrink-0">
      <p className="text-[10px] font-semibold tracking-wide text-ink-faint uppercase">
        Names you hold
      </p>

      {isLoading ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-faint">
          <Loader2 className="size-3 animate-spin" />
          Looking…
        </p>
      ) : !names || names.length === 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          None without a namespace yet. Register one in step 2 and it appears
          here.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {names.map((n) => {
            const active = n.label === selected;
            return (
              <li key={n.label}>
                <button
                  type="button"
                  onClick={() => onPick(n.label)}
                  className={cn(
                    "w-full truncate rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                    active
                      ? "border-brand bg-brand-soft font-semibold text-brand-ink"
                      : "border-line bg-surface text-ink-soft hover:border-brand/50 hover:text-ink",
                  )}
                >
                  {n.label}
                  <span className="text-ink-faint">.eth</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
