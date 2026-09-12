"use client";

import { useQuery } from "@tanstack/react-query";

export interface Identity {
  /** The mainnet primary name, or null where the address has not set one. */
  name: string | null;
  /** A URL the browser can load — `getEnsAvatar` has already followed the record. */
  avatar: string | null;
}

const NOBODY: Identity = { name: null, avatar: null };

/**
 * The mainnet name and avatar behind an address.
 *
 * ── Keyed on the lowercased address ───────────────────────────────────────
 *
 * The same person turns up more than once on a page — as the connected wallet
 * in the header and as the owner of the namespace being read — and the two
 * sites get the address from different places, one checksummed and one not.
 * Keying on the raw string would make those separate queries answering the
 * same question. Lowercasing collapses them into one request.
 *
 * ── Stale for a long time, on purpose ─────────────────────────────────────
 *
 * A primary name changes a handful of times in its life, so refetching it on
 * every mount would be pure noise. The route sets a matching `s-maxage`; this
 * is the same decision made a second time, on the side that can skip the
 * request entirely.
 */
export function useIdentity(address?: string): Identity {
  const key = address?.toLowerCase();

  const { data } = useQuery({
    queryKey: ["identity", key],
    enabled: !!key,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    // Identity is decoration over an address that is already on screen, so a
    // failed lookup should fall back quietly rather than retry three times.
    retry: false,
    queryFn: async (): Promise<Identity> => {
      const res = await fetch(`/api/identity?address=${key}`);
      if (!res.ok) return NOBODY;
      const json = (await res.json()) as Partial<Identity>;
      return { name: json.name ?? null, avatar: json.avatar ?? null };
    },
  });

  return data ?? NOBODY;
}
