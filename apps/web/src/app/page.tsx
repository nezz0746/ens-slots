"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useNamespaces } from "@/hooks/use-namespaces";
import { formatAmount } from "@/lib/format";
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
      ) : isLoading && namespaces.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-[--radius-card] bg-line-soft" />
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
        <div className="grid gap-3 sm:grid-cols-2">
          {namespaces.map((ns) => (
            <Link key={ns.address} href={`/n/${ns.address}`}>
              <Card className="group h-full p-5 transition-colors hover:border-brand/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold tracking-tight">
                      {ns.parentName}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge>{ns.subnames.length} slotted</Badge>
                      {ns.occupied > 0 && (
                        <Badge tone="good">{ns.occupied} held</Badge>
                      )}
                      {ns.subnames.length - ns.occupied > 0 && (
                        <Badge tone="brand">
                          {ns.subnames.length - ns.occupied} available
                        </Badge>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand" />
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {ns.subnames.slice(0, 5).map((s) => (
                    <span
                      key={s.node}
                      className="rounded-lg bg-canvas px-2 py-1 text-[11px] text-ink-soft"
                    >
                      {s.label}
                    </span>
                  ))}
                  {ns.subnames.length > 5 && (
                    <span className="px-1 py-1 text-[11px] text-ink-faint">
                      +{ns.subnames.length - 5}
                    </span>
                  )}
                </div>

                {ns.totalValue > 0n && (
                  <div className="mt-4 border-t border-line-soft pt-3 text-xs text-ink-faint">
                    Holders value these at{" "}
                    <span className="font-medium tabular-nums text-ink">
                      {formatAmount(ns.totalValue)}
                    </span>
                  </div>
                )}
              </Card>
            </Link>
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
