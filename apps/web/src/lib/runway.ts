/**
 * How long an escrow keeps a slot solvent, and how alarming that is.
 *
 * Carried over from the 0xSlots market app, where the same arithmetic answers
 * the same question. Shared here for the same reason it was shared there:
 * three places ask it — the figures row, the hold form as it edits, and the
 * caption under a subname — and two copies would eventually disagree about
 * whether a position was safe, which is the one figure where disagreeing is
 * the whole problem.
 */

export const BASIS_POINTS = 10_000n;
export const MONTH_SECONDS = 2_592_000n;
const DAY = 86_400n;

/** How long `escrow` funds a slot held at `price`, in seconds. */
export function runwaySeconds(
  escrow: bigint,
  price: bigint,
  taxBps: bigint,
): bigint {
  const perMonth = price * taxBps;
  if (perMonth === 0n) return 0n;
  return (escrow * MONTH_SECONDS * BASIS_POINTS) / perMonth;
}

/** Rent for `seconds` at this price and rate, by the contract's own formula. */
export function rentFor(
  seconds: bigint,
  price: bigint,
  taxBps: bigint,
): bigint {
  return (price * taxBps * seconds) / (BASIS_POINTS * MONTH_SECONDS);
}

/** Whole units, largest one. "6d", "3h", "40m". */
export function describeRunway(seconds: bigint, zeroLabel = "none"): string {
  if (seconds <= 0n) return zeroLabel;
  // Past a year, days stop being a unit anyone reads — and an escrow that
  // outlives the arithmetic reports 2^256-1, which in days is absurd.
  if (seconds > 365n * DAY) return "∞";
  const days = seconds / DAY;
  if (days >= 1n) return `${days}d`;
  const hours = seconds / 3600n;
  if (hours >= 1n) return `${hours}h`;
  return `${seconds / 60n}m`;
}

/**
 * Runway in whole days, which is the unit this reads in.
 *
 * `describeRunway` gives the tersest true answer — "6d", "3h" — and that is
 * right in a list where the column is 40px wide. A figure with room for a word
 * should use one: "6 days" is read, "6d" is decoded.
 */
export function describeDays(seconds: bigint, zeroLabel = "—"): string {
  if (seconds <= 0n) return zeroLabel;
  if (seconds > 365n * DAY) return "∞";
  const days = seconds / DAY;
  if (days >= 1n) return `${days} ${days === 1n ? "day" : "days"}`;
  const hours = seconds / 3600n;
  if (hours >= 1n) return `${hours} ${hours === 1n ? "hour" : "hours"}`;
  return `${seconds / 60n} min`;
}

export type Tone = "safe" | "short" | "gone";

/**
 * Red, amber, green — and a word, because colour alone is not a signal.
 *
 * Roughly eight percent of men cannot separate this red from this green, and
 * this figure is the difference between a name that is safe and one about to
 * change hands. Every caller pairs the tone with the label below it, so the
 * meaning survives without the hue.
 *
 * The amber threshold is the slot's OWN minimum window rather than a round
 * number of days: a runway shorter than one funded window means it can be
 * taken before the window being paid for has even elapsed.
 */
export function runwayTone(seconds: bigint, window: bigint): Tone {
  if (seconds <= 0n) return "gone";
  return seconds < window ? "short" : "safe";
}

export const TONE_TEXT: Record<Tone, string> = {
  safe: "text-good",
  short: "text-warn",
  gone: "text-hot",
};

/**
 * The dot beside the word.
 *
 * ENS Green, their Yellow, and their Magenta — the last one standing in for
 * red, which their palette does not have. Magenta reads as urgent without
 * pretending to be an error, which is right: a name that can be taken is not
 * broken, it is available.
 */
export const TONE_DOT: Record<Tone, string> = {
  safe: "bg-good",
  short: "bg-[#FFF72F] ring-1 ring-warn/30",
  gone: "bg-hot",
};

export const TONE_LABEL: Record<Tone, string> = {
  safe: "funded",
  short: "running low",
  gone: "unfunded",
};
