"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { usePublicClient, useReadContracts } from "wagmi";

import { namespaceAbi } from "@/lib/abis";

/**
 * What a namespace says about itself, in ordinary ENS records.
 *
 * ── Why these four keys and not a schema of our own ───────────────────────
 *
 * A namespace is a `.eth` name like any other, so the question "what does it
 * look like" already has an answer everywhere else: `avatar`, `header`,
 * `description`, `url`. Every ENS client and explorer reads them today. A
 * bespoke `org.0xslots.profile` blob would have carried the same four strings
 * and been legible to nothing but this app.
 *
 * `header` rather than `banner`, because `header` is the key ENS's own manager
 * app writes for exactly this. The word on the button says banner; the key on
 * the chain is the one everyone else already looks under.
 *
 * ── Which is different from the sponsor record, deliberately ──────────────
 *
 * One level down, a sponsoring space carries `com.ethglobal.sponsor` — a
 * structured payload under a custom key, because "a token, on this chain, at
 * this address" is not a thing ENS has a key for. A profile is, so it doesn't
 * get one.
 */
export const PROFILE_KEYS = ["avatar", "header", "description", "url"] as const;

/**
 * Where to find whoever opened the namespace, in the keys ENS already uses.
 *
 * Separate from {PROFILE_KEYS} because these are not part of what the app
 * DRAWS — the cards render an avatar, a banner, a description and a link, and
 * nothing here changes that. They are written because a namespace's owner has
 * somewhere to be found, and every other ENS client already knows to look under
 * these keys. Folding them into `PROFILE_KEYS` would have made the home page
 * read three more records per namespace to render none of them.
 */
export const LINK_KEYS = ["com.twitter", "com.github", "org.telegram"] as const;

/** Everything the owner can write on the parent name. */
export const ROOT_KEYS = [...PROFILE_KEYS, ...LINK_KEYS] as const;

export type RootKey = (typeof ROOT_KEYS)[number];

export interface Profile {
  avatar: string;
  /** The banner. `header` is the key ENS's manager app writes for it. */
  header: string;
  description: string;
  url: string;
  /**
   * Which path answered, or null when the name has no profile at all.
   *
   * `contract` is a claim about the name's CONFIGURATION — the ENS reads came
   * back and were empty, so the parent does not point at the resolver and no
   * other client can see this profile. `unverified` is the same data with no
   * such claim: the ENS reads did not come back at all, so nothing was learnt
   * about how the name is wired. Conflating them told owners with a perfectly
   * wired name that it was broken, every time the RPC hiccuped.
   */
  via: "ens" | "contract" | "unverified" | null;
}

const EMPTY: Profile = {
  avatar: "",
  header: "",
  description: "",
  url: "",
  via: null,
};

export function hasProfile(p: Profile | undefined): boolean {
  return !!p && p.via !== null;
}

/**
 * Every listed namespace's profile, in one query.
 *
 * ── Read through ENS, with the contract as a stated fallback ──────────────
 *
 * The same argument `useSponsorRecord` makes, for the same reason. This app
 * holds the namespace's address and ABI and could call `parentTextOf` directly
 * — and doing so would demonstrate nothing. The claim is that these are
 * ordinary ENS records that any client can read, so the app reads them the way
 * any client would: `getEnsText`, through the Universal Resolver.
 *
 * The fallback exists because that path has a real precondition. The parent
 * `.eth` name must point at the namespace's resolver, which only the parent's
 * owner can arrange — so a namespace opened by somebody who has not done it
 * stores its profile perfectly and resolves nothing. Falling back keeps the
 * app usable; `via` keeps it honest about which happened.
 *
 * ── One query for all of them ─────────────────────────────────────────────
 *
 * Rather than one per card. React Query would otherwise run a subscription and
 * a refetch timer per namespace and the grid would repaint in pieces as they
 * landed. The reads themselves still batch — the transport folds every
 * `getEnsText` issued in a tick into a single `aggregate3`.
 */
export function useProfiles(
  namespaces: { address: `0x${string}`; parentName: string }[],
) {
  const client = usePublicClient();
  const key = namespaces.map((n) => `${n.address}:${n.parentName}`).join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["profiles", key],
    enabled: !!client && namespaces.length > 0,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Record<string, Profile>> => {
      if (!client) return {};

      const entries = await Promise.all(
        namespaces.map(async ({ address, parentName }) => {
          const ens = await readAll((k) =>
            client.getEnsText({ name: parentName, key: k }),
          );
          if (ens.records) return [address, { ...ens.records, via: "ens" }] as const;

          const direct = await readAll((k) =>
            client.readContract({
              address,
              abi: namespaceAbi,
              functionName: "parentTextOf",
              args: [k],
            }),
          );
          if (direct.records) {
            return [
              address,
              // Only an ENS read that SUCCEEDED and was empty proves the name
              // is not wired up. One that threw proves nothing.
              { ...direct.records, via: ens.failed ? "unverified" : "contract" },
            ] as const;
          }

          return [address, EMPTY] as const;
        }),
      );

      return Object.fromEntries(entries);
    },
  });

  return { profiles: data ?? {}, isLoading };
}

/**
 * What the parent name actually STORES, for the owner about to change it.
 *
 * ── Why this reads the contract, when {useProfiles} reads ENS ──────────────
 *
 * They are answering different questions. A reader asks what the name resolves
 * to, so `useProfiles` goes through the Universal Resolver and only falls back
 * here. An editor asks what is about to be overwritten, and the answer to that
 * is whatever `setParentTexts` last wrote — the one store the Save button acts
 * on.
 *
 * Reading resolution instead would be actively unsafe. A parent whose `.eth`
 * name does not point at the namespace's resolver stores its records perfectly
 * and resolves nothing, so the form would open with seven empty fields over
 * seven populated records, and saving any one of them would blank the rest.
 *
 * Seven reads, folded into a single `aggregate3` by the transport.
 */
export function useParentRecords(address?: `0x${string}`) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: ROOT_KEYS.map(
      (key) =>
        ({
          address,
          abi: namespaceAbi,
          functionName: "parentTextOf",
          args: [key],
        }) as const,
    ),
    query: { enabled: !!address },
  });

  const records = useMemo(() => {
    const out = {} as Record<RootKey, string>;
    for (const [i, key] of ROOT_KEYS.entries()) {
      const entry = data?.[i];
      out[key] = entry?.status === "success" ? (entry.result as string) : "";
    }
    return out;
  }, [data]);

  // `data` is undefined until the first read lands, and a form must not open on
  // blanks it would then save over — see above.
  return { records, isLoading, loaded: !!data, refetch };
}

/**
 * The four keys, plus whether any of the reads actually failed.
 *
 * `records` is null when the name answered nothing to any of them — null
 * rather than four empty strings, because the caller has to tell "this path
 * found nothing, try the other one" from "this name has no profile", and an
 * unset ENS record and a record set to `""` are the same answer.
 *
 * `failed` is the part that keeps the caller honest. A rejected read and an
 * empty one both leave the string empty, so without it a dropped request looks
 * exactly like a name with no records — and the caller draws a conclusion
 * about the name's configuration from what was really a network problem.
 */
async function readAll(get: (key: string) => Promise<unknown>): Promise<{
  records: Omit<Profile, "via"> | null;
  failed: boolean;
}> {
  let failed = false;

  const [avatar, header, description, url] = await Promise.all(
    PROFILE_KEYS.map(async (k) => {
      try {
        return ((await get(k)) as string | null) ?? "";
      } catch {
        failed = true;
        return "";
      }
    }),
  );

  if (!avatar && !header && !description && !url) return { records: null, failed };
  return { records: { avatar, header, description, url }, failed };
}
