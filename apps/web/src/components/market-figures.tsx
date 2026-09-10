"use client";

import { Badge } from "@/components/ui/badge";
import type { Subname } from "@/hooks/use-namespaces";
import { formatAmount } from "@/lib/format";
import {
  MONTH_SECONDS,
  TONE_LABEL,
  TONE_TEXT,
  describeDays,
  rentFor,
  runwayTone,
} from "@/lib/runway";
import { cn } from "@/lib/utils";

/**
 * What a name costs, above what it says.
 *
 * ── Why this is not in the action panel any more ──────────────────────────
 *
 * It used to head the column holding the forms, which put the numbers a reader
 * needs to DECIDE next to the controls they need to ACT — and a third of the
 * way across the page from the name they are about. The records sat centre
 * stage instead, which is backwards: a record is what a holder published, and
 * the market is why the name has a holder at all.
 *
 * Facts here, under the name. Controls stay on the right.
 */
export function MarketFigures({ subname }: { subname: Subname }) {
  const state = subname.state;
  if (!state) return null;

  return (
    <section>
      <header className="flex items-center justify-between gap-3 pb-2">
        <h3 className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
          The market
        </h3>
        <Status subname={subname} />
      </header>
      <Figures state={state} />
    </section>
  );
}

export function Status({ subname }: { subname: Subname }) {
  const s = subname.state;
  if (!s) return null;
  if (s.isVacant) return <Badge tone="brand">Available</Badge>;
  if (s.isInsolvent) return <Badge tone="bad">Liquidatable</Badge>;
  const tone = runwayTone(s.secondsUntilLiquidation, s.minDepositSeconds);
  return (
    <Badge tone={tone === "safe" ? "good" : "warn"}>{TONE_LABEL[tone]}</Badge>
  );
}

/**
 * The three numbers the decision turns on.
 *
 * Valuation, what holding it costs per month, and how long the escrow lasts —
 * three because they are the whole trade in order: what you say it is worth,
 * what saying that costs you, how long you have paid for.
 *
 * Escrow and rate used to sit here too and were the wrong kind of true. The
 * rate is a constant of the namespace, the same on every row — it belongs once,
 * in the namespace's own summary, and that is where it now is; and the escrow
 * only means anything divided by the rent, which is the runway. Four figures
 * where two were derivable made the row longer and the decision no clearer.
 */
function Figures({ state }: { state: NonNullable<Subname["state"]> }) {
  // The slot's own answer, not `runwaySeconds` on the deposit. They differ:
  // this one accounts for tax accrued since the last settlement, so it is the
  // number that decides an actual liquidation. Computing it here as well would
  // give the badge and the figure two sources for one fact.
  const runway = state.isVacant ? 0n : state.secondsUntilLiquidation;
  const tone = runwayTone(runway, state.minDepositSeconds);
  const perMonth = rentFor(MONTH_SECONDS, state.price, state.taxBps);

  return (
    <dl className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-xl border border-line bg-canvas/50">
      <Figure label="Valuation" value={formatAmount(state.price)} />
      <Figure label="Rent" value={`${formatAmount(perMonth)}/mo`} />
      <Figure
        label="Runway"
        value={state.isVacant ? "—" : describeDays(runway)}
        className={state.isVacant ? undefined : TONE_TEXT[tone]}
      />
    </dl>
  );
}

function Figure({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm font-semibold tabular-nums",
          className,
        )}
      >
        {value}
      </dd>
    </div>
  );
}
