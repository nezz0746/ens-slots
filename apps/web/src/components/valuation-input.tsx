"use client";

import { useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";

import { cn } from "@/lib/utils";

/**
 * Percentage steps, laid out as one continuous scale from cut to raise.
 *
 * Drawn as a segmented control in the same shape and colours as the runway
 * scale below it — cuts red on the left, raises green on the right, one real
 * division at the turn. They are the same kind of question asked about two
 * different numbers, and two different-looking rows of buttons made them look
 * like two different kinds of control.
 *
 * Unlike the runway scale there is no selected state, because these are not a
 * selection: each tap COMPOUNDS off the current value, so any of them can be
 * pressed repeatedly and none of them is ever "the one that is on".
 */
const STEPS = [-20, -10, -5, 5, 10, 20] as const;

/** Where the cuts end and the raises begin — the one real division. */
const TURN = STEPS.findIndex((s) => s > 0);

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
 * ── Where the rent went ───────────────────────────────────────────────────
 *
 * Naming a price is also agreeing to pay tax on it, and the two numbers only
 * mean something together — so the rent is still always on screen, in the
 * caller's summary beside everything else this form computes. It sat inline
 * here first, which put a derived figure between two halves of one control and
 * left each form with its results in two places.
 */
export function ValuationInput({
  value,
  onChange,
  decimals = 18,
  symbol = "ETH",
  disabled,
  id,
}: {
  /** Raw units — the currency's own denomination, never a float. */
  value: bigint;
  onChange: (next: bigint) => void;
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

  return (
    // No gap and no seam: the field and the steps are one control, so the
    // field loses its bottom border and the strip its top, and both take the
    // focus colour together. Two separately-rounded boxes read as a number and
    // an unrelated row of buttons that happened to sit under it.
    <div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-t-lg border border-b-0 bg-surface px-3 transition-colors",
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

      <div
        className={cn(
          "flex overflow-hidden rounded-b-lg border border-t-0 transition-colors",
          focused ? "border-brand" : "border-line",
        )}
      >
        {STEPS.map((s, i) => {
          const cutting = s < 0;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => step(s)}
              className={cn(
                "min-w-0 flex-1 py-1.5 text-[11px] font-medium tabular-nums transition-colors disabled:opacity-40",
                i === TURN
                  ? "border-l border-line"
                  : i > 0 && "border-l border-line-soft",
                cutting
                  ? "bg-hot-soft/50 text-hot hover:bg-hot-soft"
                  : "bg-good-soft/50 text-good hover:bg-good-soft",
              )}
            >
              {s > 0 ? `+${s}` : s}%
            </button>
          );
        })}
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
