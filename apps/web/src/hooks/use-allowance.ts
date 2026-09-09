"use client";

import { useAccount, useReadContract } from "wagmi";

import { useTx } from "@/hooks/use-tx";
import { mockUsdcAbi } from "@/lib/abis";
import { isNative, ZERO_ADDRESS } from "@/lib/currency";
import { useCurrency } from "@/hooks/use-addresses";

/**
 * Whether `spender` may already pull `amount`, and a way to let it.
 *
 * ── Why exact rather than infinite ────────────────────────────────────────
 *
 * The approval is sized to what this transaction actually spends. An unlimited
 * approval is one fewer signature for the rest of time and a standing licence
 * for a slot to drain the wallet if it is ever upgraded to something that
 * would — and these slots sit behind an upgradeable beacon, so that is not a
 * hypothetical. The cost is an approval per top-up, which is the honest price.
 *
 * A native slot needs none of this: `enough` is always true and `approve` is a
 * no-op, so callers can ask unconditionally instead of branching first.
 */
export function useAllowance(spender: `0x${string}`, amount: bigint) {
  const { address } = useAccount();
  const currency = useCurrency();
  const native = isNative(currency);

  const { data: allowance, refetch } = useReadContract({
    address: currency,
    abi: mockUsdcAbi,
    functionName: "allowance",
    args: [address ?? ZERO_ADDRESS, spender],
    query: { enabled: !native && !!address, refetchInterval: 8_000 },
  });

  const { send, pending } = useTx();

  const enough = native || amount === 0n || (allowance ?? 0n) >= amount;

  /** True when there is nothing left to do — already approved, or just did. */
  async function approve(): Promise<boolean> {
    if (enough) return true;
    const ok = await send("approve", {
      address: currency,
      abi: mockUsdcAbi,
      functionName: "approve",
      args: [spender, amount],
    });
    if (!ok) return false;
    // Read it back rather than assuming: the next call in the sequence is the
    // one the allowance exists for, and sending it against a stale `enough`
    // would surface as the slot reverting on a transfer nobody authorised.
    await refetch();
    return true;
  }

  return {
    /** Whether `spender` can pull `amount` right now. */
    enough,
    approve,
    approving: pending === "approve",
    /** How many signatures the caller still owes before its own call. */
    steps: enough ? 0 : 1,
  };
}
