"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import { useTx } from "@/hooks/use-tx";
import { slotAbi, slotFactoryAbi } from "@/lib/abis";
import { useAddresses } from "@/hooks/use-addresses";

/**
 * Whether this chain's factory can collect a batch.
 *
 * `collectAll` landed in SlotFactory v3 and Sepolia is still serving v2, so the
 * app cannot assume it. Asked once per chain and cached for the session — the
 * answer only changes when somebody upgrades the factory, which is not
 * something to poll for.
 *
 * `version()` rather than probing `collectAll` itself: a `pure` getter that has
 * been there since v1 answers cleanly, where probing the new function means
 * telling "this factory is too old" apart from "one of your slots reverted",
 * and those come back looking identical.
 */
export function useFactorySupportsBatch() {
  const client = usePublicClient();
  const addresses = useAddresses();

  const { data } = useQuery({
    queryKey: ["factory-version", addresses.slotFactory],
    enabled: !!client,
    queryFn: async () => {
      if (!client) return 0n;
      return client
        .readContract({
          address: addresses.slotFactory,
          abi: slotFactoryAbi,
          functionName: "version",
        })
        .catch(() => 0n);
    },
  });

  return (data ?? 0n) >= 3n;
}

/**
 * A gas limit for {collectAll}, computed rather than estimated.
 *
 * ── Why `eth_estimateGas` cannot be trusted here ────────────────────────────
 *
 * `collectAll` wraps each slot in `try this.collectFrom(...) catch {}`, so the
 * OUTER call succeeds whether or not the inner ones did — a slot that runs out
 * of gas leaves a zero in the returned array and the transaction still reports
 * success. Estimation binary-searches for the lowest gas at which the outer
 * call succeeds, and that is a limit where the later slots silently fail.
 *
 * Measured against the deployed factory: one slot costs ~116k and two ~172k,
 * while the estimator answered 141k for the pair. The transaction landed with
 * status 1, collected the first slot, skipped the second, and showed no error
 * anywhere — which is exactly what "clicking collect does nothing" looks like
 * from the outside.
 *
 * So: a floor with real headroom per slot. Unused gas is refunded, so the only
 * cost of being generous is the block limit, and the only cost of being tight
 * is money that silently does not move.
 */
const gasForCollectAll = (count: number) =>
  120_000n + 150_000n * BigInt(count);

/**
 * Push every slot's accrued tax to its recipient.
 *
 * ── Two paths, and why the slow one stays ─────────────────────────────────
 *
 * With a v3 factory this is one transaction: `collectAll` isolates each slot on
 * chain, so one that reverts — nothing owed, or a `strict` hook that reverts in
 * `afterSettle` — leaves a zero rather than failing the batch.
 *
 * Without one it is a signature per slot, which is worse but is not nothing:
 * `collect()` is permissionless on every slot and the money goes to the same
 * place either way. Hiding the button until the factory is upgraded would make
 * a working feature invisible on the chain it is actually deployed to.
 *
 * The fallback does NOT stop at the first failure. A slot with nothing owed
 * reverts `NothingToCollect`, and that is the single most likely thing in any
 * batch — treating it as fatal would mean one already-collected slot could
 * block every other recipient in the list.
 */
export function useCollectAll() {
  const batched = useFactorySupportsBatch();
  const addresses = useAddresses();
  const { send, pending, error } = useTx();
  const queryClient = useQueryClient();

  /**
   * Re-read the slots now rather than on the next poll.
   *
   * Every figure in the header comes from `getSlotInfo`, which is polled on an
   * interval — so without this the collectable total went on counting UP for
   * several seconds after the money had already left the slots, which reads as
   * the button having done nothing.
   *
   * By wagmi's key prefix rather than a `refetch` threaded down from the page:
   * the same reads back three separate figures across two components, and
   * passing a refetch through all of them to keep them in step is a lot of
   * plumbing for one invalidation.
   */
  const reread = () =>
    queryClient.invalidateQueries({ queryKey: ["readContracts"] });

  async function collectAll(slots: readonly `0x${string}`[]) {
    if (!slots.length) return null;

    if (batched) {
      const ok = await send("collect-all", {
        address: addresses.slotFactory,
        abi: slotFactoryAbi,
        functionName: "collectAll",
        args: [slots as `0x${string}`[]],
        gas: gasForCollectAll(slots.length),
      });
      if (ok) await reread();
      return ok;
    }

    let landed = 0;
    for (const slot of slots) {
      const ok = await send("collect-all", {
        address: slot,
        abi: slotAbi,
        functionName: "collect",
        args: [],
      });
      if (ok) landed++;
    }
    if (landed > 0) await reread();
    return landed > 0 ? true : null;
  }

  return {
    collectAll,
    /** One transaction, or one per slot. Worth saying on the button. */
    batched,
    busy: pending === "collect-all",
    error,
  };
}
