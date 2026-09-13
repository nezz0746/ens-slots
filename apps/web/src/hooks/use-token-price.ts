"use client";

import { useQuery } from "@tanstack/react-query";

import { DECIMALS, SYMBOL } from "@/lib/currency";

/**
 * A token's dollar price, or null.
 *
 * Null is a first-class answer rather than an error state: no key configured,
 * Alchemy down, or a symbol it does not track all arrive the same way, and the
 * caller's response to all three is identical — show the ETH figure on its own.
 * Anything that renders a price has to handle null anyway, so making some of
 * those cases throw would only add a branch nobody wants.
 *
 * Every figure on a page shares one query key, so a header showing three
 * amounts in dollars makes one request rather than three.
 */
export function useTokenPrice(symbol = SYMBOL) {
  const { data } = useQuery({
    queryKey: ["token-price", symbol],
    // Slower than the chain reads on purpose. A price that moved a cent between
    // two figures on the same screen would show them inconsistent with each
    // other, which looks like a bug and is worth less than the freshness.
    refetchInterval: 120_000,
    queryFn: async (): Promise<number | null> => {
      const res = await fetch(`/api/price?symbol=${symbol}`);
      if (!res.ok) return null;
      const json = (await res.json()) as { usd: number | null };
      return json.usd;
    },
  });

  return data ?? null;
}

/**
 * `amount` in the currency's own units, priced. Null in, null out.
 *
 * `decimals` defaults to the protocol's currency rather than to 18, so a
 * caller cannot silently price a 6-decimal balance as an 18-decimal one — an
 * error of a factor of a trillion that still renders as a plausible number.
 */
export function usdOf(
  wei: bigint,
  price: number | null,
  decimals = DECIMALS,
): number | null {
  if (price === null) return null;
  // Through Number only after scaling down: a wei figure times a float would
  // overflow the mantissa long before it overflowed a bigint.
  return (Number(wei) / 10 ** decimals) * price;
}

/** Dollars, rounded the way money is read rather than the way it is stored. */
export function formatUsd(usd: number | null): string | null {
  if (usd === null) return null;
  if (usd === 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toLocaleString(undefined, {
    minimumFractionDigits: usd < 1000 ? 2 : 0,
    maximumFractionDigits: usd < 1000 ? 2 : 0,
  })}`;
}
