"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { EnsMark } from "@/components/ens-mark";
import { cn } from "@/lib/utils";

/**
 * One step of the open-a-namespace flow, and whose protocol it belongs to.
 *
 * ── Why the protocol is on the step ─────────────────────────────────────────
 *
 * The flow crosses a boundary twice and the page never said so. Registering a
 * name is ENS; opening a namespace is us; pointing the name at the registry is
 * ENS again. All three arrived as identical cards with identical buttons, so a
 * failure in one read as a failure of the whole thing, and "which of these is
 * the part you built?" had no answer on screen.
 *
 * A badge per step, in the colour that protocol carries everywhere else in the
 * app — ENS blue, or ink for ours.
 *
 * ── Why steps rather than cards ─────────────────────────────────────────────
 *
 * The old page showed every card live at once, including the one that was a
 * prerequisite for the others. Somebody registered two names on it and never
 * pressed the second button, because nothing on the page said there was an
 * order. A numbered column with a connector says it without a sentence, and a
 * step that is not your turn yet is visibly not your turn.
 */
export type StepState = "done" | "active" | "todo";

export function FlowStep({
  index,
  total,
  protocol,
  title,
  summary,
  state,
  children,
}: {
  index: number;
  total: number;
  protocol: "ens" | "nameslots";
  title: string;
  summary: ReactNode;
  state: StepState;
  children?: ReactNode;
}) {
  const done = state === "done";
  const todo = state === "todo";

  return (
    <div className="flex gap-3 sm:gap-4">
      {/* The rail: a numbered marker and the line to the next step. */}
      <div className="flex shrink-0 flex-col items-center">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
            done && "border-good bg-good text-white",
            state === "active" && "border-ink bg-ink text-white",
            todo && "border-line bg-canvas text-ink-faint",
          )}
        >
          {done ? <Check className="size-3.5" /> : index}
        </span>
        {index < total && (
          <span
            className={cn("mt-1 w-px flex-1", done ? "bg-good/40" : "bg-line")}
          />
        )}
      </div>

      <div className={cn("min-w-0 flex-1 pb-6", todo && "opacity-55")}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <ProtocolBadge protocol={protocol} />
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
          {summary}
        </p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}

/**
 * Whose contract this step talks to.
 *
 * The ENS one carries their mark when the asset is present and the word when it
 * is not — see {EnsMark}. Ours is set in type, because "Nameslots" is a word
 * and not a logo, and putting our symbol beside their mark at the same size
 * would claim a parity that does not exist.
 */
function ProtocolBadge({ protocol }: { protocol: "ens" | "nameslots" }) {
  if (protocol === "ens") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-brand-ink uppercase">
        <EnsMark className="h-2.5" fallback="none" />
        ENS
      </span>
    );
  }
  return (
    <span className="rounded-md bg-ink px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
      Nameslots
    </span>
  );
}
