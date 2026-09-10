"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

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
