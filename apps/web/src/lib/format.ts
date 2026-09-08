import { formatUnits } from "viem";

/**
 * An amount, at a length a person can read.
 *
 * Never `toFixed`: a slot priced at 0.0001 ETH rounded to two places is 0.00,
 * and a figure that reads as zero beside a button that spends it is the worst
 * kind of wrong. Significant digits instead, so small numbers keep their
 * magnitude and large ones stay short.
 */
export function formatAmount(value: bigint, decimals = 18, symbol = "ETH") {
  const n = Number(formatUnits(value, decimals));
  if (n === 0) return `0 ${symbol}`;
  const digits = n >= 1000 ? 0 : n >= 1 ? 3 : n >= 0.001 ? 4 : 6;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: digits })} ${symbol}`;
}

export const shortAddress = (a?: string) =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";

/** Basis points per 30 days, as the percentage people talk in. */
export const taxPercent = (bps: bigint) => `${Number(bps) / 100}%`;
