"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";

import { addresses, isDeployed } from "@/lib/addresses";
import { namespaceAbi, namespaceFactoryAbi, slotAbi } from "@/lib/abis";

/**
 * Reading the whole world without an indexer.
 *
 * Three rounds of multicall: which namespaces exist, what each one holds, then
 * the live state of every slot in them. That is affordable here because the
 * contracts were built to be read this way — `listing()` returns a namespace's
 * whole contents in one call, and `getSlotInfo()` returns a slot's whole state
 * in another, so the round count is fixed rather than growing with the number
 * of subnames.
 *
 * It would not survive thousands of namespaces, and that is the honest limit
 * of going without an indexer. At the scale this runs at, an indexer would be
 * a second source of truth to keep in sync for no benefit.
 */

export interface SlotState {
  occupant: `0x${string}`;
  price: bigint;
  deposit: bigint;
  taxBps: bigint;
  minDepositSeconds: bigint;
  tenureId: bigint;
  occupiedSince: bigint;
  isVacant: boolean;
  isInsolvent: boolean;
  secondsUntilLiquidation: bigint;
  taxOwed: bigint;
  recipient: `0x${string}`;
  hook: `0x${string}`;
}

export interface Subname {
  node: `0x${string}`;
  label: string;
  slot: `0x${string}`;
  state?: SlotState;
}

export interface Namespace {
  address: `0x${string}`;
  parentName: string;
  parentNode: `0x${string}`;
  owner: `0x${string}`;
  resolver: `0x${string}`;
  subnames: Subname[];
  occupied: number;
  /** What every occupant has collectively declared their names are worth. */
  totalValue: bigint;
}

/** Flatten the tuple `getSlotInfo` returns into what the UI actually reads. */
// biome-ignore lint/suspicious/noExplicitAny: the tuple is typed by viem at the call site
function toState(info: any): SlotState {
  return {
    occupant: info.occupant,
    price: info.price,
    deposit: info.deposit,
    taxBps: info.taxBps,
    minDepositSeconds: info.minDepositSeconds,
    tenureId: info.tenureId,
    occupiedSince: info.occupiedSince,
    isVacant: info.isVacant,
    isInsolvent: info.isInsolvent,
    secondsUntilLiquidation: info.secondsUntilLiquidation,
    taxOwed: info.taxOwed,
    recipient: info.recipient,
    hook: info.hook,
  };
}

export function useNamespaces(only?: `0x${string}`) {
  const { data: all, isLoading: loadingAll } = useReadContract({
    address: addresses.namespaceFactory,
    abi: namespaceFactoryAbi,
    functionName: "all",
    query: { enabled: isDeployed && !only, refetchInterval: 8_000 },
  });

  const list = useMemo<readonly `0x${string}`[]>(
    () => (only ? [only] : ((all as `0x${string}`[]) ?? [])),
    [only, all],
  );

  // Round two: who each namespace is.
  const { data: meta, isLoading: loadingMeta } = useReadContracts({
    contracts: list.flatMap((address) => [
      { address, abi: namespaceAbi, functionName: "parentName" } as const,
      { address, abi: namespaceAbi, functionName: "PARENT_NODE" } as const,
      { address, abi: namespaceAbi, functionName: "owner" } as const,
      { address, abi: namespaceAbi, functionName: "resolver" } as const,
      { address, abi: namespaceAbi, functionName: "listing" } as const,
    ]),
    query: { enabled: list.length > 0, refetchInterval: 8_000 },
  });

  // Round three: every slot's live state, in one call.
  const slots = useMemo(() => {
    if (!meta) return [] as `0x${string}`[];
    const out: `0x${string}`[] = [];
    for (let i = 0; i < list.length; i++) {
      const listing = meta[i * 5 + 4]?.result as
        | [readonly `0x${string}`[], readonly string[], readonly `0x${string}`[]]
        | undefined;
      if (listing) out.push(...listing[2]);
    }
    return out;
  }, [meta, list.length]);

  const { data: infos, isLoading: loadingInfos } = useReadContracts({
    contracts: slots.map(
      (address) =>
        ({ address, abi: slotAbi, functionName: "getSlotInfo" }) as const,
    ),
    query: { enabled: slots.length > 0, refetchInterval: 5_000 },
  });

  const namespaces = useMemo<Namespace[]>(() => {
    if (!meta) return [];
    let cursor = 0;
    return list.map((address, i) => {
      const listing = meta[i * 5 + 4]?.result as
        | [readonly `0x${string}`[], readonly string[], readonly `0x${string}`[]]
        | undefined;
      const [nodes, labels, slotAddrs] = listing ?? [[], [], []];

      const subnames: Subname[] = slotAddrs.map((slot, j) => {
        const info = infos?.[cursor++];
        return {
          node: nodes[j],
          label: labels[j],
          slot,
          state:
            info?.status === "success" ? toState(info.result) : undefined,
        };
      });

      return {
        address,
        parentName: (meta[i * 5]?.result as string) ?? "",
        parentNode: (meta[i * 5 + 1]?.result as `0x${string}`) ?? "0x",
        owner: (meta[i * 5 + 2]?.result as `0x${string}`) ?? "0x",
        resolver: (meta[i * 5 + 3]?.result as `0x${string}`) ?? "0x",
        subnames,
        occupied: subnames.filter((s) => s.state && !s.state.isVacant).length,
        totalValue: subnames.reduce(
          (sum, s) => sum + (s.state?.price ?? 0n),
          0n,
        ),
      };
    });
  }, [meta, infos, list]);

  return {
    namespaces,
    isLoading: loadingAll || loadingMeta || loadingInfos,
  };
}

/** One namespace, by address. */
export function useNamespace(address?: `0x${string}`) {
  const { namespaces, isLoading } = useNamespaces(address);
  return { namespace: namespaces[0], isLoading };
}
