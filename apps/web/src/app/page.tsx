"use client";

import Link from "next/link";

import { NamespaceCard } from "@/components/namespace-card";
import { useNamespaces } from "@/hooks/use-namespaces";
import { useProfiles } from "@/hooks/use-profile";
import { isDeployed } from "@/lib/addresses";

/**
 * Every parent name with at least one slotted subname.
 *
 * The list comes from the factory rather than from an indexer, which is the
 * only reason the factory exists — resolution in ENS only ever walks DOWN from
 * the root, so there is no way to ask "which names have subnames like this"
 * without something recording it.
 */
export default function Home() {
  const { namespaces, isLoading } = useNamespaces();

  // Every parent's own ENS records, so the list can say who these people are
  // rather than only what they have opened.
  const { profiles, isLoading: loadingProfiles } = useProfiles(namespaces);

  return (
    <div className="space-y-8">
      <section className="space-y-4 py-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface/70 px-3 py-1 text-[11px] font-medium text-brand-ink">
          <span className="size-1.5 rounded-full bg-brand" />
          Common ownership subnames on ENSv2
        </span>
        <h1 className="max-w-2xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance">
          Names that are{" "}
          <span className="text-brand">always for sale</span>
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
          Each of these parent names has opened some of its subnames to the
          market. Whoever holds one names their own price, pays tax on it
          continuously, and can be bought out by anyone willing to pay what they
          asked. Nothing here can be squatted.
        </p>
      </section>

      {!isDeployed ? (
        <Empty>
          No deployment found. Run{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 text-[13px]">
            pnpm dev:local
          </code>{" "}
          from the repo root.
        </Empty>
      ) : /*
         * The skeleton also covers the PROFILE reads, not just the chain ones.
         *
         * They are two queries and the second cannot start until the first has
         * returned — it is keyed by the namespaces it describes. Showing cards
         * the moment the chain answered therefore guaranteed a frame of plain
         * cards followed by every one of them growing by a banner, a
         * description and a link as the ENS reads landed: roughly 180px of
         * reflow under whatever the reader had just moved their cursor to.
         */
      (isLoading && namespaces.length === 0) || loadingProfiles ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[26rem] animate-pulse rounded-[--radius-card] bg-line-soft"
            />
          ))}
        </div>
      ) : namespaces.length === 0 ? (
        <Empty>
          Nobody has opened a namespace yet.{" "}
          <Link href="/register" className="text-brand hover:underline">
            Open the first one
          </Link>
          .
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {namespaces.map((ns) => (
            <NamespaceCard
              key={ns.address}
              namespace={ns}
              profile={profiles[ns.address]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[--radius-card] border border-dashed border-line bg-surface p-10 text-center text-sm text-ink-soft">
      {children}
    </div>
  );
}
