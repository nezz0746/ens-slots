"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useTx } from "@/hooks/use-tx";
import { namespaceAbi } from "@/lib/abis";
import type { Namespace } from "@/hooks/use-namespaces";


/**
 * Put labels on the market. Shown only to whoever opened the namespace.
 *
 * ── Why it queues ───────────────────────────────────────────────────────────
 *
 * A namespace worth looking at opens three or four labels, and this used to be
 * one signature each — four wallet confirmations for what is one decision, made
 * in one sitting. `slotLabels` takes an array, so the queue below collects them
 * and sends one transaction.
 *
 * All or nothing, which is the contract's choice and the right one: a partial
 * batch would leave you reading a receipt to work out which of your labels are
 * live, and re-sending the array would then revert on the ones that already
 * exist.
 *
 * ── Why a row has no options on it ──────────────────────────────────────────
 *
 * It used to carry three: kind, permanent, and a minimum tenure. The kind was
 * application vocabulary and is gone from the contract entirely; permanent is
 * off until there is a reason to hand out an irreversible commitment through a
 * form; and the tenure came back, alongside the rate, because there are no
 * namespace defaults left for a label to inherit.
 *
 * The terms are per BATCH rather than per row. Opening four names at four
 * different rates is a thing somebody will want eventually, and four rows of
 * two inputs is not the shape to discover that in — a name opened here can be
 * repriced afterwards with its own cog.
 */
export function SlotLabelForm({ namespace }: { namespace: Namespace }) {
  const { address } = useAccount();
  const { send, pending, error } = useTx();
  const [input, setInput] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  // The terms every label in this batch opens on. One pair for the batch
  // rather than per row: opening four names at four rates is a thing somebody
  // will want eventually, and four rows of two inputs is not the shape to
  // discover that in. Reprice one afterwards with its own cog.
  const [tax, setTax] = useState("5");
  const [days, setDays] = useState("7");

  const isOwner =
    !!address && namespace.owner.toLowerCase() === address.toLowerCase();
  if (!isOwner) return null;

  const taxBps = BigInt(Math.round(Number(tax || "0") * 100));
  const tenureSeconds = BigInt(Math.max(0, Math.round(Number(days || "0")))) * 86_400n;
  // The contract refuses both, so refuse them here where it costs no gas.
  const taxValid = taxBps > 0n && taxBps <= 10_000n;

  const clean = input.trim().toLowerCase();
  const taken =
    !!clean &&
    (namespace.subnames.some((s) => s.label === clean) ||
      queue.includes(clean));

  const add = () => {
    if (!clean || taken) return;
    setQueue((q) => [...q, clean]);
    setInput("");
  };

  const open = async () => {
    const ok = await send("slot", {
      address: namespace.address,
      abi: namespaceAbi,
      functionName: "slotLabels",
      args: [
        queue.map((label) => ({
          label,
          taxBps,
          minTenureSeconds: tenureSeconds,
          permanent: false,
        })),
      ],
    });
    if (ok) setQueue([]);
  };

  return (
    <div className="space-y-3 rounded-[--radius-card] border border-dashed border-line bg-surface p-4">
      <p className="text-xs font-medium text-ink-soft">
        Open labels — you own this namespace
      </p>

      <div className="flex gap-2">
        <Input
          value={input}
          placeholder="label"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button variant="outline" disabled={!clean || taken} onClick={add}>
          <Plus />
          Add
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="label-tax">Tax, per 30 days</Label>
          <div className="flex items-center gap-1.5">
            <Input
              id="label-tax"
              value={tax}
              inputMode="decimal"
              className="h-9"
              onChange={(e) => setTax(e.target.value)}
            />
            <span className="text-xs text-ink-faint">%</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="label-tenure">Guaranteed run, days</Label>
          <Input
            id="label-tenure"
            value={days}
            inputMode="numeric"
            className="h-9"
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
      </div>
      {!taxValid && (
        <p className="text-[11px] text-hot">
          A rate is required, above zero and no more than 100%.
        </p>
      )}

      {taken && (
        <p className="text-[11px] text-warn">{clean} is already open.</p>
      )}

      {queue.map((label, i) => (
        <div
          key={label}
          className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2"
        >
          <span className="text-xs font-semibold">
            {label}
            <span className="font-normal text-ink-faint">
              .{namespace.parentName}
            </span>
          </span>
          <button
            type="button"
            aria-label={`Remove ${label}`}
            className="text-ink-faint hover:text-hot"
            onClick={() => setQueue((q) => q.filter((_, j) => j !== i))}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}

      {queue.length > 0 && (
        <Button className="w-full" disabled={!!pending || !taxValid} onClick={open}>
          {pending === "slot"
            ? "Confirming…"
            : `Open ${queue.length} label${queue.length > 1 ? "s" : ""} — one transaction`}
        </Button>
      )}

      {error && <p className="text-[11px] text-hot">{error}</p>}
    </div>
  );
}
