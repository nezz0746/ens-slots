"use client";

import { Fuel } from "lucide-react";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";

import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";

/**
 * What this account can pay for gas with.
 *
 * ── Why it is in the header at all ──────────────────────────────────────────
 *
 * Because its absence is invisible everywhere else, and it disables the entire
 * app. An account with no native balance estimates gas perfectly well, so a
 * wallet will draw a full confirmation screen — the amount, the fee, the
 * network — and only fail after that, as something that reads like a contract
 * revert. The USDC figure beside this one was already shown for a smaller
 * reason; the number that decides whether any button works was not shown at
 * all.
 *
 * ── Loud only when it is zero ───────────────────────────────────────────────
 *
 * A balance that can pay is a detail, so it is grey and small next to the USDC
 * it sits beside. A balance of zero is the only thing standing between the
 * visitor and every action on the page, so it turns magenta, gains a fuel icon
 * and says so in its title. Nagging about a healthy balance would train people
 * to stop reading the spot where the real warning appears.
 */
export function GasBalance() {
  const { address, isConnected } = useAccount();
  const mounted = useMounted();
  const { data } = useBalance({
    address,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  // See {useMounted}: the server has no wallet, so it renders nothing here, and
  // a client that already knows it is connected would hydrate a chip the server
  // never sent.
  if (!mounted || !isConnected || !data) return null;

  const empty = data.value === 0n;
  // Formatted here rather than read off the hook: wagmi 3's `useBalance`
  // returns `{ decimals, symbol, value }` and no `formatted`.
  //
  // Four decimals, because gas on a testnet is measured in ten-thousandths and
  // a two-decimal balance reads 0.00 while being perfectly able to pay — which
  // would be the same lie this component exists to stop telling.
  const exact = formatUnits(data.value, data.decimals);
  const shown = Number(exact).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });

  return (
    <span
      title={
        empty
          ? `This account has no ${data.symbol}. Every transaction will fail until it does — send it some, or switch accounts.`
          : `${exact} ${data.symbol} available for gas`
      }
      className={cn(
        "items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] tabular-nums",
        // A healthy balance is a detail and the header is crowded, so it waits
        // for room. An empty one is the reason nothing on the page works, so it
        // shows at every width and takes the space from something else.
        empty ? "flex" : "hidden sm:flex",
        empty
          ? "border-hot bg-hot-soft font-semibold text-hot"
          : "border-line bg-surface text-ink-soft",
      )}
    >
      {empty && <Fuel className="size-3" />}
      {/* "No ETH", not "No gas ETH": the symbol IS the sentence when there is
          none of it, so it does not want a separate muted span beside it. */}
      {empty ? (
        `No ${data.symbol}`
      ) : (
        <>
          {shown}
          <span className="text-ink-faint">{data.symbol}</span>
        </>
      )}
    </span>
  );
}
