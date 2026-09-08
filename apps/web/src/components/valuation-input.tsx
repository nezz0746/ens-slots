"use client";

import { useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";

import { cn } from "@/lib/utils";
import { rentFor, MONTH_SECONDS } from "@/lib/runway";

/** Percentage steps, laid out as one continuous scale from cut to raise. */
const STEPS = [-20, -10, -5, 5, 10, 20] as const;

/**
 * A valuation field, with the rent it implies beside it.
 *
 * Carried over from the 0xSlots market app, where the same control names the
 * same number.
 *
 * The percentage buttons COMPOUND off the current value rather than the
 * starting one, so repeated taps behave like a market moving rather than a
 * slider with fixed stops.
 *
 * ── The arithmetic is in integers ─────────────────────────────────────────
 *
 * Stepping in JavaScript numbers and rounding to two decimals is safe for a
 * name priced in whole dollars and catastrophic for one priced in ETH: 0.001
 * raised by 10% rounds to 0.00, and the field would then offer a self-assessed
 * price of zero behind a button that assesses at exactly that — which the core
 * refuses outright. Stepping raw units keeps every currency exact, so the
 * caller passes and receives `bigint` and no float ever touches the value.
 *
 * ── Why the rent is not optional ──────────────────────────────────────────
 *
 * Naming a price is also agreeing to pay tax on it, and the two numbers only
 * mean something together. A field that showed the valuation alone would let
 * someone raise their price to fend off a buyer without ever seeing what that
 * costs them per month — which is the exact trade common ownership exists to force.
 */
export function ValuationInput({
  value,
  onChange,
  taxBps,
  decimals = 18,
  symbol = "ETH",
  disabled,
  id,
}: {
  /** Raw units — the currency's own denomination, never a float. */
  value: bigint;
  onChange: (next: bigint) => void;
  taxBps: bigint;
  decimals?: number;
  symbol?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  /**
   * The value the NEXT step compounds from.
   *
   * `step` closes over `value`, which React only refreshes on re-render — so
   * two taps inside one frame both computed from the same base and the second
   * silently did nothing. Someone tapping +10% quickly to chase a price got
   * one raise for three taps, which is the exact case these buttons exist for.
   */
  const latest = useRef(value);
  latest.current = value;

  /**
   * A draft that no longer describes the value is not a draft, it is a lie.
   *
   * Dropped during render rather than on blur: the percentage buttons move the
   * value without taking focus away, and a stale draft would leave the figure
   * on screen different from the figure that gets signed.
   */
  if (raw !== null) {
    const drafted = tryParse(raw, decimals);
    if (drafted !== null && drafted !== value) setRaw(null);
  }

  const shown =
    raw ?? (value === 0n ? "" : formatUnits(value, decimals));

  const step = (percent: number) => {
    const base = latest.current;
    const next =
      base === 0n
        ? parseUnits("0.01", decimals)
        : (base * BigInt(100 + percent)) / 100n;
    latest.current = next;
    setRaw(null);
    onChange(next > 0n ? next : 1n);
  };

  const perMonth = rentFor(MONTH_SECONDS, value, taxBps);

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-surface px-3 transition-colors",
          focused ? "border-brand" : "border-line",
        )}
      >
        <input
          id={id}
          inputMode="decimal"
          value={shown}
          disabled={disabled}
          placeholder="0.0"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setRaw(null);
          }}
          onChange={(e) => {
            setRaw(e.target.value);
            const parsed = tryParse(e.target.value, decimals);
            if (parsed !== null) {
              latest.current = parsed;
              onChange(parsed);
            }
          }}
          className="h-10 w-full bg-transparent text-base font-medium tabular-nums outline-none placeholder:text-ink-faint"
        />
        <span className="shrink-0 text-sm font-medium text-ink-faint">
          {symbol}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex gap-1">
          {STEPS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => step(s)}
              className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
            >
              {s > 0 ? `+${s}` : s}%
            </button>
          ))}
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
          {formatUnits(perMonth, decimals).slice(0, 8)} {symbol}/mo
        </span>
      </div>
    </div>
  );
}

function tryParse(text: string, decimals: number): bigint | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return 0n;
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;
  try {
    return parseUnits(trimmed, decimals);
  } catch {
    return null;
  }
}
