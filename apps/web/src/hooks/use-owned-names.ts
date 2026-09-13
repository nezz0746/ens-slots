"use client";

import { useQuery } from "@tanstack/react-query";
import { keccak256, toHex } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { useAddresses, useIsDeployed } from "@/hooks/use-addresses";
import { ensRegistryAbi, namespaceFactoryAbi } from "@/lib/abis";
import { ethNode } from "@/lib/names";

/**
 * Every `.eth` name this account holds that has no namespace yet.
 *
 * ── Why events, and why this one ────────────────────────────────────────────
 *
 * ERC-1155 does not enumerate, so there is no call that answers "what does this
 * address own". And a token id does not reverse to a label — the registry
 * stores the hash, and hashes do not come back. The only place the NAME exists
 * as a string is the log the registry writes when it is created:
 *
 *   LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelhash,
 *                   string label, address owner, uint64 expiry,
 *                   address indexed sender)
 *
 * `owner` is not indexed — `sender` takes the third topic, and on every
 * registration through the registrar that is the registrar. So the filter
 * cannot narrow by owner and the check happens here instead, which is
 * necessary anyway: see below.
 *
 * ── Why the event's owner is not trusted ────────────────────────────────────
 *
 * It says who held the name at REGISTRATION. Names transfer, expire and get
 * re-registered, so a log from last week is evidence a name exists and nothing
 * more. Every candidate is re-checked against the chain — `ownerOf` now, and
 * `namespaceOf` now — before it is offered.
 *
 * ── The window ─────────────────────────────────────────────────────────────
 *
 * Public RPCs cap `eth_getLogs` at 50,000 blocks; ours answers
 * `exceed maximum block range: 50000` past that. One window under the cap
 * currently covers the whole hackathon registry with room to spare — its
 * first registration sits about 8,000 blocks in — so this is one request, not
 * a paged crawl. If that stops being true the list silently shortens rather
 * than breaking, which is the right failure for a convenience.
 */
const WINDOW = 45_000n;

const LABEL_REGISTERED = {
  type: "event",
  name: "LabelRegistered",
  inputs: [
    { name: "tokenId", type: "uint256", indexed: true },
    { name: "labelhash", type: "bytes32", indexed: true },
    { name: "label", type: "string", indexed: false },
    { name: "owner", type: "address", indexed: false },
    { name: "expiry", type: "uint64", indexed: false },
    { name: "sender", type: "address", indexed: true },
  ],
} as const;

export type OwnedName = {
  label: string;
  /** Its `.eth` token id, so the caller can act on it without re-deriving. */
  tokenId: bigint;
};

export function useOwnedNames() {
  const { address } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient();
  const addresses = useAddresses();
  const isDeployed = useIsDeployed();

  return useQuery<OwnedName[]>({
    queryKey: ["owned-names", chainId, address],
    enabled: !!address && !!client && isDeployed,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!address || !client) return [];

      const latest = await client.getBlockNumber();
      const logs = await client.getLogs({
        address: addresses.ensEthRegistry,
        event: LABEL_REGISTERED,
        fromBlock: latest > WINDOW ? latest - WINDOW : 0n,
        toBlock: "latest",
      });

      // Newest wins: a re-registered name appears twice and only the last one
      // describes the name as it is now.
      const byLabel = new Map<string, string>();
      for (const log of logs) {
        const label = log.args.label;
        if (label) byLabel.set(label, label);
      }
      const labels = [...byLabel.keys()];
      if (labels.length === 0) return [];

      // Ownership as it is NOW, not as the log remembers it. Two calls per
      // name because `ownerOf` takes a token id and a labelhash is not one —
      // asking it about the hash returns zero with no error, which would read
      // here as "nobody owns this".
      const hashes = labels.map((l) => keccak256(toHex(l)));
      const ids = await client.multicall({
        contracts: hashes.map(
          (h) =>
            ({
              address: addresses.ensEthRegistry,
              abi: ensRegistryAbi,
              functionName: "getTokenId",
              args: [BigInt(h)],
            }) as const,
        ),
        allowFailure: true,
      });

      const known = labels
        .map((label, i) => ({ label, id: ids[i] }))
        .filter((x) => x.id.status === "success")
        .map((x) => ({ label: x.label, tokenId: x.id.result as bigint }));
      if (known.length === 0) return [];

      const checks = await client.multicall({
        contracts: known.flatMap(
          (n) =>
            [
              {
                address: addresses.ensEthRegistry,
                abi: ensRegistryAbi,
                functionName: "ownerOf",
                args: [n.tokenId],
              },
              {
                address: addresses.namespaceFactory,
                abi: namespaceFactoryAbi,
                functionName: "namespaceOf",
                args: [ethNode(n.label)],
              },
            ] as const,
        ),
        allowFailure: true,
      });

      const mine: OwnedName[] = [];
      known.forEach((n, i) => {
        const owner = checks[i * 2];
        const namespace = checks[i * 2 + 1];
        if (owner.status !== "success" || namespace.status !== "success") return;
        const isMine =
          (owner.result as string)?.toLowerCase() === address.toLowerCase();
        // An opened namespace is not a candidate: this list exists to start
        // one, and the name's own page is where an existing one is managed.
        const open =
          (namespace.result as string) !==
          "0x0000000000000000000000000000000000000000";
        if (isMine && !open) mine.push(n);
      });

      return mine.sort((a, b) => a.label.localeCompare(b.label));
    },
  });
}
