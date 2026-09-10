"use client";

import { HandCoins, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";

import { DECIMALS, isDollarPegged, SYMBOL } from "@/lib/currency";
import { shortAddress } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { useCollectAll } from "@/hooks/use-collect-all";
import { useNamespaceBalance } from "@/hooks/use-namespace-balance";
import type { Namespace } from "@/hooks/use-namespaces";
import { formatUsd, usdOf, useTokenPrice } from "@/hooks/use-token-price";
import { MONTH_SECONDS, rentFor } from "@/lib/runway";

/** How often the accruing figure moves. */
const TICK_MS = 2_000;

/**
 * The whole namespace as three numbers, on one line, with the actions.
 *
 * Valuation is what the holders say the names are worth. Revenue is what that
 * costs them per month, which is the same number seen from the other side — it
 * is the namespace's income, and stating it monthly rather than per second is
 * the only form anyone can act on.
 *
 * Collectable is the one that moves. It is money already earned and sitting in
 * the slots, and the button at the end of the row is what fetches it.
 *
 * ── Why one row and not three stacked cards ───────────────────────────────
 *
 * Each figure used to be a card with a label above it and a sub-line below,
 * and the sub-line is empty whenever the currency is already dollars — which
 * it is, here — so two thirds of the height was blank. Three labelled figures
 * are a sentence, not a dashboard, and they fit on a line.
 *
 * `actions` is whatever the page wants beside "Collect all". It is a prop
 * rather than something this component knows about, because the other button
 * is the OWNER's and only the page knows whether it is looking at one.
 */
export function NamespaceSummary({
  namespace,
  actions,
}: {
  namespace: Namespace;
  actions?: ReactNode;
}) {
  // Priced in the protocol's own currency. When that is a dollar stablecoin
  // the USD line would just restate the figure above it, so it is dropped
  // rather than printed twice.
  const price = useTokenPrice();
  const showUsd = !isDollarPegged();
  const { collectAll, batched, busy, error } = useCollectAll();
  const { address, isConnected } = useAccount();
  const treasury = useNamespaceBalance(namespace.address);

  /**
   * Collect, then send it on, from one press.
   *
   * Tax is paid to the namespace rather than to a person — that is what keeps
   * the income attached to the parent name instead of to whoever opened it —
   * so collecting moves money out of the slots and stops there. Left as two
   * buttons, pressing the first made a second one appear, which reads as the
   * first having half-worked rather than as a second leg of the same trip.
   *
   * Two transactions unless the wallet batches, and that is fine: they are
   * sequential either way, and `useTx` queues writes so the second cannot race
   * the first for a nonce.
   *
   * The standalone Withdraw stays for the balance somebody ELSE's collect left
   * here, which this button would never see.
   */
  async function collectAndWithdraw() {
    const ok = await collectAll(collectable);
    if (ok) await treasury.withdraw();
  }

  const held = namespace.subnames.filter((s) => s.state && !s.state.isVacant);
  // Only occupied slots earn. A vacant one is inventory, not income.
  const earning = held;
  const isOwner =
    !!address && namespace.owner.toLowerCase() === address.toLowerCase();


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
    <div className="rounded-[--radius-card] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        {/*
          * The namespace as a sentence rather than two labelled figures.
          *
          * "Held at" was the sum of what the holders say their names are
          * worth, which is a number about THEM. What an owner is here for is
          * what it earns and where it goes — and the third of those was
          * nowhere on the page at all, even though it is now derived from the
          * parent name rather than chosen, and so is the one thing about this
          * namespace most worth stating out loud.
          */}
        <p className="text-sm text-ink-soft">
          <span className="font-semibold tabular-nums text-ink">
            {earning.length}
          </span>{" "}
          {earning.length === 1 ? "slot" : "slots"} earning{" "}
          <span className="font-semibold tabular-nums text-ink">
            {trim(monthly)} {SYMBOL}/mo
          </span>
          {showUsd && formatUsd(usdOf(monthly, price)) ? (
            <span className="text-ink-faint">
              {" "}
              ({formatUsd(usdOf(monthly, price))})
            </span>
          ) : null}{" "}
          to{" "}
          <span className="font-medium text-ink">
            {isOwner ? "you" : shortAddress(namespace.owner)}
          </span>
        </p>
        <Stat
          label="Collectable"
          value={
            <>
              <Accruing wei={ticking} tick={tick} />
              <span className="ml-1 text-[11px] font-normal text-ink-faint">
                {SYMBOL}
              </span>
            </>
          }
          sub={showUsd ? formatUsd(usdOf(ticking, price)) : null}
        />

        {/*
          * Money that has left the slots but not yet reached the owner.
          *
          * Collecting flushes tax to the RECIPIENT, which is the namespace
          * itself — that is what keeps the income attached to the name rather
          * than to whoever opened it. So there are two steps now, and hiding
          * the middle one would leave a figure that vanished from
          * "collectable" and appeared nowhere.
          */}
        {treasury.amount > 0n && (
          <Stat
            label="To withdraw"
            value={`${trim(treasury.amount)} ${SYMBOL}`}
            sub={showUsd ? formatUsd(usdOf(treasury.amount, price)) : null}
          />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          {treasury.amount > 0n && (
            <Button
              size="sm"
              variant="primary"
              disabled={treasury.withdrawing}
              // Anyone may press it; it can only pay the owner.
              onClick={treasury.withdraw}
              title="Send what the namespace holds to whoever owns the parent name"
            >
              {treasury.withdrawing ? <Loader2 className="animate-spin" /> : <HandCoins />}
              Withdraw
            </Button>
          )}
          <Button
            size="sm"
            variant={collectableNow > 0n ? "primary" : "outline"}
            // Disabled without a wallet, rather than failing on click. The
            // button used to invite a press it could never honour, and answered
            // with a line of wagmi's internals under the card.
            disabled={
              busy || treasury.withdrawing || !isConnected || collectable.length === 0
            }
            onClick={collectAndWithdraw}
            title={
              !isConnected
                ? "Connect a wallet to collect"
                : collectable.length === 0
                  ? "Nothing has accrued yet"
                  : batched
                    ? "One transaction, through the factory"
                    : "One transaction per slot — the factory on this chain predates collectAll"
            }
          >
            {busy || treasury.withdrawing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <HandCoins />
            )}
            {busy
              ? "Collecting…"
              : treasury.withdrawing
                ? "Sending…"
                : "Collect all"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="border-t border-line-soft px-4 py-2 text-[11px] text-hot">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One labelled figure, on the line rather than stacked.
 *
 * The sub-line is DROPPED when there is nothing to say, instead of rendering a
 * space to hold the row's height. Stacked, that blank mattered — the three
 * cards had to agree on a height. Inline, nothing depends on it.
 */
function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string | null;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      {sub && (
        <span className="text-[11px] text-ink-faint tabular-nums">{sub}</span>
      )}
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
 * How many decimals each figure earns, capped by what the token actually has.
 *
 * The ticking figure needs enough to be seen moving — an accrual of a few
 * hundredths of a cent a second is invisible at two — but never more than the
 * currency carries. Eight decimals of a six-decimal token is two digits the
 * balance cannot express: `formatUnits` returns six and the padding invented
 * the rest, so the figure ended in a permanent `00` that looked like precision.
 *
 * The static figures are money and read as money.
 */
const TICKING_DECIMALS = Math.min(8, DECIMALS);
const STATIC_DECIMALS = Math.min(2, DECIMALS);

function trim(wei: bigint, decimals = STATIC_DECIMALS): string {
  const s = formatUnits(wei, DECIMALS);
  const [whole, frac = ""] = s.split(".");
  return `${whole}.${frac.slice(0, decimals).padEnd(decimals, "0")}`;
}
