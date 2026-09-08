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
    <div className="grid grid-cols-3 gap-1.5">
      {options.map(({ m, seconds, cost }) => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m, cost)}
            className={cn(
              "rounded-lg border px-2 py-2 text-left transition-colors disabled:opacity-40",
              active
                ? "border-brand bg-brand-soft"
                : "border-line bg-surface hover:border-brand/40",
            )}
          >
            <div
              className={cn(
                "text-[11px] font-medium",
                active ? "text-brand-ink" : "text-ink-faint",
              )}
            >
              ×{m} · {describeRunway(seconds)}
            </div>
            <div className="text-[13px] font-semibold tabular-nums">
              {Number(formatUnits(cost, decimals)).toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}
              <span className="ml-1 text-[11px] font-normal text-ink-faint">
                {symbol}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
