"use client";

import { HandCoins, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";

import { Button } from "@/components/ui/button";
import { useCollectAll } from "@/hooks/use-collect-all";
import type { Namespace } from "@/hooks/use-namespaces";
import { formatUsd, usdOf, useTokenPrice } from "@/hooks/use-token-price";
import { MONTH_SECONDS, rentFor } from "@/lib/runway";

/** How often the accruing figure moves. */
const TICK_MS = 2_000;

/**
 * The whole namespace as three numbers, and the one action they imply.
 *
 * Valuation is what the holders say the names are worth. Revenue is what that
 * costs them per month, which is the same number seen from the other side — it
 * is the namespace's income, and stating it monthly rather than per second is
 * the only form anyone can act on.
 *
 * Collectable is the one that moves. It is money already earned and sitting in
 * the slots, and the button next to it is what fetches it.
 */
export function NamespaceSummary({ namespace }: { namespace: Namespace }) {
  const price = useTokenPrice("ETH");
  const { collectAll, batched, busy, error } = useCollectAll();

  const held = namespace.subnames.filter((s) => s.state && !s.state.isVacant);

  const monthly = held.reduce(
    (sum, s) => sum + rentFor(MONTH_SECONDS, s.state!.price, s.state!.taxBps),
    0n,
  );

  // What a collection would actually pay out, per slot and summed.
  //
  // `collectedTax + min(taxOwed, deposit)` — the same arithmetic the factory
  // does. `taxOwed` alone is the RAW debt and overstates an insolvent slot,
  // whose excess is carried as arrears against the occupant rather than paid to
  // anybody; showing it here would promise money no transaction can move.
  const collectableNow = held.reduce((sum, s) => {
    const st = s.state!;
    return sum + st.collectedTax + (st.taxOwed > st.deposit ? st.deposit : st.taxOwed);
  }, 0n);

  // What it grows by, per second, across every occupied slot.
  const perSecond = held.reduce(
    (sum, s) => sum + rentFor(1n, s.state!.price, s.state!.taxBps),
    0n,
  );

  const { value: ticking, tick } = useAccruing(collectableNow, perSecond);
  const collectable = held.map((s) => s.slot);

  return (
    <div className="grid gap-px overflow-hidden rounded-[--radius-card] border border-line bg-line sm:grid-cols-3">
      <Figure
        label="Held at"
        value={`${trim(namespace.totalValue)} ETH`}
        sub={formatUsd(usdOf(namespace.totalValue, price))}
      />
      <Figure
        label="Revenue"
        value={`${trim(monthly)} ETH`}
        sub={
          formatUsd(usdOf(monthly, price))
            ? `${formatUsd(usdOf(monthly, price))} / month`
            : "per month"
        }
      />

      <div className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
        <div className="min-w-0">
          <dt className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
            Collectable
          </dt>
          <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">
            <Accruing wei={ticking} tick={tick} />
            <span className="ml-1 text-[11px] font-normal text-ink-faint">
              ETH
            </span>
          </dd>
          <dd className="text-[11px] text-ink-faint tabular-nums">
            {formatUsd(usdOf(ticking, price)) ?? " "}
          </dd>
        </div>

        <Button
          size="sm"
          variant={collectableNow > 0n ? "primary" : "outline"}
          disabled={busy || collectable.length === 0}
          onClick={() => collectAll(collectable)}
          title={
            batched
              ? "One transaction, through the factory"
              : `One transaction per slot — the factory on this chain predates collectAll`
          }
        >
          {busy ? <Loader2 className="animate-spin" /> : <HandCoins />}
          {busy ? "Collecting…" : "Collect all"}
        </Button>
      </div>

      {error && (
        <p className="bg-surface px-4 pb-3 text-[11px] text-hot sm:col-span-3">
          {error}
        </p>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string | null;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">
        {value}
      </dd>
      <dd className="text-[11px] text-ink-faint tabular-nums">
        {sub ?? " "}
      </dd>
    </div>
  );
}

/**
 * The collectable figure, extrapolated between chain reads.
 *
 * ── Why extrapolate at all ────────────────────────────────────────────────
 *
 * `getSlotInfo` is polled every five seconds, so a figure drawn straight from
 * it sits still and then jumps. What it describes is not stepwise — tax accrues
 * per second, continuously — so a number that moves is the more honest drawing
 * of it, not the less.
 *
 * It re-bases on every poll rather than drifting: the chain's answer replaces
 * the estimate whenever one arrives, so the error can never accumulate past one
 * polling interval.
 */
function useAccruing(
  base: bigint,
  perSecond: bigint,
): { value: bigint; tick: number } {
  const [state, setState] = useState({ value: base, tick: 0 });
  const since = useRef({ base, at: Date.now() });

  // A new chain read is the truth. Compared by value because the parent hands
  // down a fresh bigint on every render and identity would re-base constantly.
  if (since.current.base !== base) since.current = { base, at: Date.now() };

  useEffect(() => {
    // `tick` counts INTERVAL FIRES, not value changes, and the distinction is
    // what makes the flash work. The value also moves whenever a chain poll
    // re-bases it — several times between ticks — and keying the animation on
    // the value restarted it faster than its own duration, so it never reached
    // its end state and the figure sat permanently green.
    const step = (advance: boolean) =>
      setState((prev) => {
        const elapsed = BigInt(
          Math.floor((Date.now() - since.current.at) / 1000),
        );
        return {
          value: since.current.base + perSecond * elapsed,
          tick: advance ? prev.tick + 1 : prev.tick,
        };
      });

    // Re-basing is not a tick: it corrects the figure without time having
    // passed, so it must not fire the animation.
    step(false);
    const t = setInterval(() => step(true), TICK_MS);
    return () => clearInterval(t);
  }, [perSecond, base]);

  return state;
}

/**
 * A number that flashes green when it grows.
 *
 * The colour is the point rather than decoration: the figure changes in its
 * eighth decimal every couple of seconds, which is easy to miss, and "money is
 * arriving" is the one thing this panel exists to say.
 *
 * ── Why a key and not a timer ─────────────────────────────────────────────
 *
 * This was a `setTimeout` that lit a class and cleared it 1.2s later. Every
 * update cleared the PENDING timeout before it could fire, so the number went
 * green once and stayed green — an animation that never animated, which is
 * worse than none: a permanently green figure reads as a status, not an event.
 *
 * Remounting on each increase restarts the CSS animation instead. There is no
 * timer to cancel and no state that can be left switched on.
 *
 * The key counts INCREASES only. A drop means somebody collected, and flashing
 * the same "money arrived" green at the moment it leaves would say the opposite
 * of what happened.
 */
function Accruing({ wei, tick }: { wei: bigint; tick: number }) {
  return (
    <span key={tick} className="tick-flash">
      {trim(wei, TICKING_DECIMALS)}
    </span>
  );
}

/**
 * Enough decimals to see it MOVE, which is more than enough to read it.
 *
 * A namespace earning a fraction of an ETH a month accrues tens of gwei a
 * second, so a two-second tick moves the eighth decimal and nothing above it.
 * At six — where this started — the live figure rendered as a constant and the
 * flash animated a number that never changed, which is worse than not animating
 * it: it says money is arriving and shows the same total either way.
 *
 * Eight is only for the ticking figure. The static ones read as money.
 */
const TICKING_DECIMALS = 8;
const STATIC_DECIMALS = 6;

function trim(wei: bigint, decimals = STATIC_DECIMALS): string {
  const s = formatUnits(wei, 18);
  const [whole, frac = ""] = s.split(".");
  return `${whole}.${frac.slice(0, decimals).padEnd(decimals, "0")}`;
}
