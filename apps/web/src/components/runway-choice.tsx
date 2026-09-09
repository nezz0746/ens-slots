"use client";

import { formatUnits } from "viem";

import { cn } from "@/lib/utils";
import { describeRunway, rentFor } from "@/lib/runway";

/**
 * How long to fund, as multiples of the slot's own minimum window.
 *
 * Carried over from 0xSlots. Three choices rather than a number field, and
 * they are multiples of the slot's OWN minimum rather than round numbers of
 * days, because that minimum is the only duration with meaning here: it is the
 * shortest the slot will accept, so ×1 is "the least I am allowed" and ×3 is
 * "three times that". A generic 30/90/180-day picker would offer durations a
 * given slot rejects, and hide the one it requires.
 *
 * Each option shows what it costs, which is the whole decision.
 *
 * One segmented control rather than three gapped cards. The multiplier is not
 * shown: "×2" is a fact about how the option was derived, and the reader only
 * needs the duration and the price. The first is marked as the minimum because
 * that is the one thing about it worth knowing — below it the slot refuses.
 *
 * The selected option is a solid fill rather than an inset ring. A ring on a
 * child of an `overflow-hidden` container is clipped square at the rounded
 * corners, so the first and last options lost theirs on two sides.
 */
export function RunwayChoice({
  window,
  price,
  taxBps,
  value,
  onChange,
  decimals = 18,
  symbol = "ETH",
  disabled,
}: {
  /** The slot's `minDepositSeconds`. */
  window: bigint;
  price: bigint;
  taxBps: bigint;
  /** The chosen multiple. */
  value: number;
  onChange: (multiple: number, deposit: bigint) => void;
  decimals?: number;
  symbol?: string;
  disabled?: boolean;
}) {
  const options = [1, 2, 3].map((m) => {
    const seconds = window * BigInt(m);
    return { m, seconds, cost: rentFor(seconds, price, taxBps) };
  });

  return (
    <div className="flex overflow-hidden rounded-lg border border-line">
      {options.map(({ m, seconds, cost }, i) => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m, cost)}
            className={cn(
              "min-w-0 flex-1 px-2 py-1.5 text-left transition-colors disabled:opacity-40",
              i > 0 && "border-l border-line-soft",
              active
                ? "bg-brand text-white"
                : "bg-surface text-ink hover:bg-canvas",
            )}
          >
            <div
              className={cn(
                "truncate text-[11px] font-medium",
                active ? "text-white/75" : "text-ink-faint",
              )}
            >
              {describeRunway(seconds)}
              {i === 0 && " (min)"}
            </div>
            <div className="truncate text-[13px] font-semibold tabular-nums">
              {Number(formatUnits(cost, decimals)).toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}
              <span
                className={cn(
                  "ml-1 text-[11px] font-normal",
                  active ? "text-white/70" : "text-ink-faint",
                )}
              >
                {symbol}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
