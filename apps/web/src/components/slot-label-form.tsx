"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTx } from "@/hooks/use-tx";
import { namespaceAbi } from "@/lib/abis";
import type { Namespace } from "@/hooks/use-namespaces";
import { KIND_SPONSORING } from "@/lib/addresses";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const ZERO32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

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
 * It used to carry three: kind, permanent, and a minimum tenure. Every space
 * here is a sponsoring space now, so the kind carries no information; the
 * minimum tenure is a promise the whole namespace makes, set once when it is
 * opened and passed to every slot through the terms; and permanent is off until
 * there is a reason to hand out an irreversible commitment through a form.
 *
 * What is left is the only thing that ever differed: the word.
 */
export function SlotLabelForm({ namespace }: { namespace: Namespace }) {
  const { address } = useAccount();
  const { send, pending, error } = useTx();
  const [input, setInput] = useState("");
  const [queue, setQueue] = useState<string[]>([]);

  const isOwner =
    !!address && namespace.owner.toLowerCase() === address.toLowerCase();
  if (!isOwner) return null;

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
          kind: KIND_SPONSORING,
          // Zero means "use the namespace's hook" — the minimum tenure set when
          // it was opened. See {SlotNamespaceCuration-_slotOne}.
          hook: ZERO,
          hookData: ZERO32,
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
        <Button className="w-full" disabled={!!pending} onClick={open}>
          {pending === "slot"
            ? "Confirming…"
            : `Open ${queue.length} label${queue.length > 1 ? "s" : ""} — one transaction`}
        </Button>
      )}

      {error && <p className="text-[11px] text-hot">{error}</p>}
    </div>
  );
}
