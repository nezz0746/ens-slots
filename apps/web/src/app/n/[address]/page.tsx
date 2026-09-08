"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SlotLabelForm } from "@/components/slot-label-form";
import { SlotPanel } from "@/components/slot-panel";
import { useNamespace } from "@/hooks/use-namespaces";
import { formatAmount, shortAddress } from "@/lib/format";
import { describeRunway, runwayTone, TONE_DOT } from "@/lib/runway";
import { cn } from "@/lib/utils";

/**
 * One namespace: its subnames on the left, what you can do on the right.
 *
 * Two panes rather than a row that expands, because the actions are a form and
 * a form inside a table row makes the table jump every time somebody clicks. A
 * fixed panel also keeps the list readable while you are deciding.
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
          {namespace.occupied} held · opened by{" "}
          {shortAddress(namespace.owner)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
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
                  <div className="truncate text-sm font-medium">
                    {s.label}
                    <span className="text-ink-faint">
                      .{namespace.parentName}
                    </span>
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

        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            {current ? (
              /* Keyed on the subname so picking another one RESETS the form.
                 Without it the price field kept the last name's number, and
                 the first thing you saw on a free name was somebody else's
                 valuation already typed in. */
              <SlotPanel
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
      </div>
    </div>
  );
}
