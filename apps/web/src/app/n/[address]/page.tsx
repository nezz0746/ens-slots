"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NameDetails } from "@/components/name-details";
import { NamespaceSummary } from "@/components/namespace-summary";
import { SlotLabelForm } from "@/components/slot-label-form";
import { SlotPanel } from "@/components/slot-panel";
import { useNamespace } from "@/hooks/use-namespaces";
import { useSponsorRecords } from "@/hooks/use-sponsor";
import { formatAmount, shortAddress } from "@/lib/format";
import { describeRunway, runwayTone, TONE_DOT } from "@/lib/runway";
import { cn } from "@/lib/utils";

/**
 * One namespace, in three columns: what is here, what this one is, what it costs.
 *
 * Panes rather than a row that expands, because the actions are a form and a
 * form inside a table row makes the table jump every time somebody clicks. Fixed
 * columns also keep the list readable while you are deciding.
 *
 * Three rather than two because the middle column answers a different question
 * from the right one. Details is RESOLUTION — the holder, the records, the
 * payload, the things any ENS client can see. The auction is the MARKET. Sharing
 * a column meant opening a valuation form pushed the thing being valued out of
 * sight, which is the one moment you want to look at it.
 *
 * They collapse to one column below `xl`, in that order: you want to know what
 * a name is before what it costs.
 */
export default function NamespacePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const { namespace, isLoading } = useNamespace(address as `0x${string}`);
  const { address: me } = useAccount();
  const [selected, setSelected] = useState<string | null>(null);

  // What each space is showing, so a row can say so without being opened.
  const { data: records } = useSponsorRecords({
    parentName: namespace?.parentName ?? "",
    nodes: namespace?.subnames.map((s) => ({ node: s.node, label: s.label })) ?? [],
    enabled: !!namespace,
  });

  // Open on something rather than an empty panel — the first available name if
  // there is one, since that is what a visitor is here for.
  useEffect(() => {
    if (selected || !namespace?.subnames.length) return;
    const free = namespace.subnames.find((s) => s.state?.isVacant);
    setSelected((free ?? namespace.subnames[0]).node);
  }, [namespace, selected]);

  if (isLoading && !namespace) {
    return <div className="h-64 animate-pulse rounded-[--radius-card] bg-line-soft" />;
  }

  if (!namespace) {
    return (
      <div className="rounded-[--radius-card] border border-dashed border-line bg-surface p-10 text-center text-sm text-ink-soft">
        No namespace at that address.
      </div>
    );
  }

  const current = namespace.subnames.find((s) => s.node === selected);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-ink-faint transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          All namespaces
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {namespace.parentName}
        </h1>
        <p className="mt-1 text-xs text-ink-faint">
          {namespace.subnames.length} slotted ·{" "}
          {namespace.subnames.filter((s) => s.sponsoring).length} sponsoring ·{" "}
          {namespace.occupied} held · opened by{" "}
          {shortAddress(namespace.owner)}
        </p>

        <div className="mt-4">
          <NamespaceSummary namespace={namespace} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,380px)]">
        <div className="space-y-3">
        <Card className="divide-y divide-line-soft overflow-hidden">
          {namespace.subnames.map((s) => {
            const st = s.state;
            const vacant = !st || st.isVacant;
            const mine =
              !!me && st?.occupant.toLowerCase() === me.toLowerCase();
            // The slot's own figure — see `Figures` in slot-panel.
            const runway = vacant ? 0n : st.secondsUntilLiquidation;
            const tone = runwayTone(runway, st?.minDepositSeconds ?? 0n);

            return (
              <button
                key={s.node}
                type="button"
                onClick={() => setSelected(s.node)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                  selected === s.node ? "bg-brand-soft/50" : "hover:bg-canvas",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {s.label}
                      <span className="text-ink-faint">
                        .{namespace.parentName}
                      </span>
                    </span>
                    {/* The TYPE where there is one, since it says more than
                        the kind does: "pool" tells you what you are looking at,
                        "sponsoring" only tells you what the label is for. The
                        kind shows through when the space is still empty. */}
                    {records?.[s.node] ? (
                      <span className="shrink-0 rounded border border-brand-soft bg-brand-soft px-1 py-px text-[9px] font-semibold tracking-wide text-brand-ink uppercase">
                        {records[s.node]?.type}
                      </span>
                    ) : (
                      s.sponsoring && (
                        <span className="shrink-0 rounded border border-line bg-canvas px-1 py-px text-[9px] font-semibold tracking-wide text-ink-faint uppercase">
                          Sponsoring
                        </span>
                      )
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-ink-faint">
                    {vacant
                      ? "Nobody holds this"
                      : `→ ${mine ? "you" : shortAddress(st.occupant)}`}
                  </div>
                </div>

                {!vacant && (
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                    <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} />
                    {describeRunway(runway)}
                  </div>
                )}

                <div className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {vacant ? (
                    <Badge tone="brand">Free</Badge>
                  ) : (
                    formatAmount(st.price)
                  )}
                </div>
              </button>
            );
          })}
        </Card>

        <SlotLabelForm namespace={namespace} />
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card className="p-4">
            {current ? (
              <NameDetails
                key={current.node}
                namespace={namespace}
                subname={current}
              />
            ) : (
              <p className="p-8 text-center text-sm text-ink-faint">
                Pick a name.
              </p>
            )}
          </Card>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card className="overflow-hidden">
            {current ? (
              /* Keyed on the subname so picking another one RESETS the form.
                 Without it the price field kept the last name's number, and
                 the first thing you saw on a free name was somebody else's
                 valuation already typed in. */
              <SlotPanel key={current.node} subname={current} />
            ) : (
              <p className="p-8 text-center text-sm text-ink-faint">
                Pick a name.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
