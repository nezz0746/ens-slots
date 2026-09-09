"use client";

import { parseSponsorRecord, RECORD_KEY, type SponsorRecord } from "@ens-slots/sponsor";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import { namespaceAbi } from "@/lib/abis";

/**
 * A name's sponsor record, read the way anybody else would read it.
 *
 * ── Why `getEnsText` and not the contract ─────────────────────────────────
 *
 * This app knows the namespace's address, its ABI and its storage layout. It
 * could call `textOf(node, key)` directly and save a hop. It deliberately does
 * not, because doing so would prove nothing: the claim being made here is that
 * a record published into one of these spaces is readable by ANY client that
 * speaks ENS, with no SDK, no ABI and no permission — and the only way to
 * demonstrate that is to read it the way that client would.
 *
 * `getEnsText` goes name → Universal Resolver → our `IExtendedResolver` →
 * `textOf`. Every step is somebody else's standard except the last one.
 *
 * ── The fallback, and why it is visible ───────────────────────────────────
 *
 * Resolution only works if the parent `.eth` name points at the namespace's
 * registry. A namespace opened under a parent nobody has wired up stores
 * records perfectly and resolves nothing, silently — so the direct read stays
 * as a fallback, and `via` says which path answered. A demo that quietly fell
 * back to the contract would be claiming something it was not doing.
 */
export function useSponsorRecord({
  name,
  namespace,
  node,
  enabled = true,
}: {
  /** The full name, e.g. `sponsor.community.eth`. */
  name: string;
  namespace: `0x${string}`;
  node: `0x${string}`;
  enabled?: boolean;
}) {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["sponsor", name, node],
    enabled: enabled && !!client && !!name && !!node,
    refetchInterval: 10_000,
    queryFn: async (): Promise<{
      raw: string;
      record: SponsorRecord | null;
      via: "ens" | "contract";
    } | null> => {
      if (!client) return null;

      const viaEns = await client
        .getEnsText({ name, key: RECORD_KEY })
        .catch(() => null);

      if (viaEns) {
        return { raw: viaEns, record: parseSponsorRecord(viaEns), via: "ens" };
      }

      const direct = await client
        .readContract({
          address: namespace,
          abi: namespaceAbi,
          functionName: "textOf",
          args: [node, RECORD_KEY],
        })
        .catch(() => "");

      if (!direct) return null;
      return {
        raw: direct,
        record: parseSponsorRecord(direct),
        via: "contract",
      };
    },
  });
}


/**
 * Every record in a namespace, so the list can say what each space is showing.
 *
 * One query rather than one per row: React Query would otherwise key eight
 * separate subscriptions with eight separate refetch timers, and the list would
 * repaint in pieces as they landed. Read through `getEnsText` like everything
 * else — the transport batches them into a single multicall.
 */
export function useSponsorRecords({
  parentName,
  nodes,
  enabled = true,
}: {
  parentName: string;
  /** The labels to ask about, with the node each answer belongs to. */
  nodes: { node: `0x${string}`; label: string }[];
  enabled?: boolean;
}) {
  const client = usePublicClient();
  const key = nodes.map((n) => n.label).join(",");

  return useQuery({
    queryKey: ["sponsor-records", parentName, key],
    enabled: enabled && !!client && nodes.length > 0,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!client) return {};
      const entries = await Promise.all(
        nodes.map(async ({ node, label }) => {
          const raw = await client
            .getEnsText({ name: `${label}.${parentName}`, key: RECORD_KEY })
            .catch(() => null);
          return [node, raw ? parseSponsorRecord(raw) : null] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<
        string,
        SponsorRecord | null
      >;
    },
  });
}

/**
 * The standard ENS text records a name has set.
 *
 * ── Why a fixed list and not "all of them" ────────────────────────────────
 *
 * ENS text records are not enumerable. `text(node, key)` answers about a key
 * you already know, and there is no `keys()` — on our resolver or on ENS's own,
 * because the underlying storage is a mapping and mappings cannot be walked.
 * An indexer could reconstruct the set from `TextChanged` events; without one,
 * asking about a known list is the only thing a client can do, and it is what
 * every ENS front end does.
 *
 * So this is a short list of the keys people actually set, drawn as a profile
 * whether or not each one has a value — an empty row is an invitation, where
 * an absent one is nothing at all. A record under some other key is invisible
 * here, which is a real limitation rather than a bug — the profile is fixed,
 * and a name carrying some other key keeps it, unread and unharmed.
 */
export const KNOWN_TEXT_KEYS = [
  "avatar",
  "header",
  "description",
  "url",
  "location",
  "email",
  "com.github",
  "com.twitter",
] as const;

export function useTextRecords({
  name,
  keys = KNOWN_TEXT_KEYS as unknown as string[],
  enabled = true,
}: {
  name: string;
  keys?: string[];
  enabled?: boolean;
}) {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["text-records", name, keys.join(",")],
    enabled: enabled && !!client && !!name,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!client) return [];
      // Every requested key comes back, set or not. The list is a fixed
      // profile now, so dropping the empty ones would silently shorten it and
      // leave nothing to click on for the record you came to add.
      return await Promise.all(
        keys.map(async (key) => ({
          key,
          value:
            (await client.getEnsText({ name, key }).catch(() => null)) ?? "",
        })),
      );
    },
  });
}
