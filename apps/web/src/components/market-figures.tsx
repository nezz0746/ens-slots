"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { useAddresses } from "@/hooks/use-addresses";
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
export function MarketFigures({
  subname,
  compact,
}: {
  subname: Subname;
  /** Inside the action panel's own card, so it brings no card of its own. */
  compact?: boolean;
}) {
  const addresses = useAddresses();
  const state = subname.state;
  if (!state) return null;

  const tenure = tenureSecondsOf(state, addresses.minimumTenureHook);

  return (
    <section
      className={cn(
        "space-y-2",
        compact && "border-b border-line px-4 pt-4 pb-3",
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
          The market
        </h3>
        <Status subname={subname} />
      </header>
      <Figures state={state} tenure={tenure} compact={compact} />
      <PendingTerms state={state} minimumTenureHook={addresses.minimumTenureHook} />
    </section>
  );
}

/**
 * The window a holder cannot be outbid in, in seconds — or null.
 *
 * It is the minimum-tenure hook's configuration word, and it is only that if
 * the hook attached is actually that hook: `hookData` is opaque to the slot and
 * means whatever the hook it belongs to says it means, so reading somebody
 * else's word as a duration would print a confident wrong number.
 */
function tenureSecondsOf(
  state: NonNullable<Subname["state"]>,
  minimumTenureHook: `0x${string}`,
): bigint | null {
  if (state.hook.toLowerCase() !== minimumTenureHook.toLowerCase()) return null;
  const seconds = BigInt(state.hookData);
  return seconds > 0n ? seconds : null;
}

/**
 * A change the owner has queued, said to everyone.
 *
 * Deliberately not owner-only. A queued change is the single most important
 * thing a prospective buyer does not otherwise know — it does not touch the
 * sitting occupant, it lands on whoever takes the name NEXT, and that is the
 * person reading this panel.
 */
function PendingTerms({
  state,
  minimumTenureHook,
}: {
  state: NonNullable<Subname["state"]>;
  minimumTenureHook: `0x${string}`;
}) {
  if (!state.pendingHasTax && !state.pendingHasHook) return null;

  const parts: string[] = [];
  if (state.pendingHasTax) {
    parts.push(`tax to ${Number(state.pendingTaxBps) / 100}% / 30d`);
  }
  if (state.pendingHasHook) {
    const none = state.pendingHook === "0x0000000000000000000000000000000000000000";
    const tenure =
      !none && state.pendingHook.toLowerCase() === minimumTenureHook.toLowerCase()
        ? describeDays(BigInt(state.pendingHookData))
        : null;
    parts.push(none ? "no guaranteed run" : tenure ? `guaranteed run to ${tenure}` : "a different hook");
  }

  return (
    <p className="rounded-xl border border-warn-soft bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn">
      <span className="font-semibold">Queued: {parts.join(", ")}.</span>{" "}
      {state.isVacant
        ? "It lands on whoever takes this name."
        : "It does not affect the current holder — it lands at the next turnover."}
    </p>
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
function Figures({
  state,
  tenure,
  compact,
}: {
  state: NonNullable<Subname["state"]>;
  tenure: bigint | null;
  compact?: boolean;
}) {
  // The slot's own answer, not `runwaySeconds` on the deposit. They differ:
  // this one accounts for tax accrued since the last settlement, so it is the
  // number that decides an actual liquidation. Computing it here as well would
  // give the badge and the figure two sources for one fact.
  const runway = state.isVacant ? 0n : state.secondsUntilLiquidation;
  const tone = runwayTone(runway, state.minDepositSeconds);
  const perMonth = rentFor(MONTH_SECONDS, state.price, state.taxBps);

  return (
    <dl
      className={cn(
        "grid",
        // Compact drops the card and the dividers: it sits inside the action
        // panel's own card, and a bordered box inside a bordered box is two
        // frames around one row.
        // Two columns compact, not four: this panel is 380px and four figures
        // across it truncated every value to an ellipsis, which is a figure
        // that cannot be read at all. Two rows of two fit whole.
        compact
          ? "grid-cols-2 gap-x-4 gap-y-2"
          : cn(
              "divide-x divide-line overflow-hidden rounded-xl border border-line bg-canvas/50",
              tenure ? "grid-cols-4" : "grid-cols-3",
            ),
      )}
    >
      <Figure label="Valuation" value={formatAmount(state.price)} compact={compact} />
      {/*
        * The rate rides with the rent, because it is the rent's explanation.
        *
        * It used to be a namespace-wide figure in the page header, which was
        * true only while every label shared one — `base` is at 10% against a
        * 5% default. A rate stated once for the namespace would now be wrong
        * about most of its names; stated beside the monthly figure it derives,
        * it is right about exactly the name being looked at.
        */}
      <Figure
        label="Rent"
        value={
          <>
            {formatAmount(perMonth)}/mo{" "}
            <span className="text-[11px] font-normal text-ink-faint">
              ({Number(state.taxBps) / 100}%)
            </span>
          </>
        }
        compact={compact}
      />
      <Figure
        label="Runway"
        value={state.isVacant ? "—" : describeDays(runway)}
        className={state.isVacant ? undefined : TONE_TEXT[tone]}
        compact={compact}
      />
      {/* What a buyer is actually guaranteed. It was set once when the
          namespace opened and then shown nowhere at all, which made it a
          promise nobody could read. */}
      {tenure && <Figure label="Guaranteed" value={describeDays(tenure)} compact={compact} />}
    </dl>
  );
}

function Figure({
  label,
  value,
  className,
  compact,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("min-w-0", compact ? "" : "px-3 py-2.5")}>
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
