"use client";

import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";

import { useCurrency } from "@/hooks/use-addresses";
import { useTx } from "@/hooks/use-tx";
import { namespaceAbi } from "@/lib/abis";

/**
 * What a namespace is holding for its owner, and the one call that moves it.
 *
 * ── Why there is a middle step at all ───────────────────────────────────────
 *
 * A slot pays its tax to `recipient`, which is written once at creation and has
 * no setter. Naming a person there pays whoever opened the namespace forever —
 * including after they have sold the name. So the recipient is the NAMESPACE,
 * and the namespace pays whoever owns the parent right now.
 *
 * The cost is that collecting no longer ends at a wallet. Tax leaves the slots,
 * sits here, and a second call sends it on. This hook is the figure for that
 * middle place, so it is visible rather than a sum that disappeared.
 */
export function useNamespaceBalance(namespace: `0x${string}`) {
  const currency = useCurrency();
  const queryClient = useQueryClient();
  const { send, pending } = useTx();

  const { data, refetch } = useReadContract({
    address: currency,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [namespace],
    query: {
      enabled: !!currency && !!namespace,
      // The same cadence the slot figures poll at, so the two halves of one
      // number never disagree on screen for longer than a beat.
      refetchInterval: 5_000,
    },
  });

  async function withdraw() {
    const ok = await send("withdraw", {
      address: namespace,
      abi: namespaceAbi,
      functionName: "withdraw",
      args: [],
    });
    if (!ok) return;
    // Read back now rather than waiting for the interval: the figure this
    // button empties is sitting directly above it.
    await refetch();
    // And the slot figures with it, by wagmi's key prefix — the same reads back
    // several numbers across two components, which is why `use-collect-all`
    // invalidates the same way.
    await queryClient.invalidateQueries({ queryKey: ["readContracts"] });
  }

  return {
    amount: (data as bigint | undefined) ?? 0n,
    withdraw,
    withdrawing: pending === "withdraw",
  };
}
