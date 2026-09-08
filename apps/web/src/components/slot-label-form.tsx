"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTx } from "@/hooks/use-tx";
import { namespaceAbi } from "@/lib/abis";
import type { Namespace } from "@/hooks/use-namespaces";
import { addresses } from "@/lib/addresses";
import { cn } from "@/lib/utils";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const ZERO32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Put another label on the market. Shown only to whoever opened the namespace.
 *
 * The two options are the ones that change what a holder is buying, so they
 * are on the form rather than behind a settings page:
 *
 *   Permanent — gives up the right to ever take this label back, even while
 *   vacant. A promise to whoever holds it, and irreversible by construction.
 *
 *   Minimum tenure — a window in which the holder cannot be outbid cheaply.
 *   It is the slot's one hook, which this system deliberately leaves free.
 */
export function SlotLabelForm({ namespace }: { namespace: Namespace }) {
  const { address } = useAccount();
  const { send, pending, error } = useTx();
  const [label, setLabel] = useState("");
  const [permanent, setPermanent] = useState(false);
  const [tenure, setTenure] = useState(false);

  const isOwner =
    !!address && namespace.owner.toLowerCase() === address.toLowerCase();
  if (!isOwner) return null;

  const clean = label.trim().toLowerCase();
  const taken = namespace.subnames.some((s) => s.label === clean);

  return (
    <div className="space-y-3 rounded-[--radius-card] border border-dashed border-line bg-surface p-4">
      <p className="text-xs font-medium text-ink-soft">
        Open another label — you own this namespace
      </p>

      <div className="flex gap-2">
        <Input
          value={label}
          placeholder="label"
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button
          disabled={!clean || taken || !!pending}
          onClick={async () => {
            await send("slot", {
              address: namespace.address,
              abi: namespaceAbi,
              functionName: "slotLabel",
              args: [
                clean,
                // hookData is the tenure window in seconds, and it must be
                // zero when there is no hook — the slot refuses the pair
                // otherwise.
                tenure ? addresses.minimumTenureHook : ZERO,
                tenure
                  ? (`0x${(604_800).toString(16).padStart(64, "0")}` as `0x${string}`)
                  : ZERO32,
                permanent,
              ],
            });
            setLabel("");
          }}
        >
          <Plus />
          {pending === "slot" ? "Confirming…" : "Open"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Toggle on={permanent} onClick={() => setPermanent(!permanent)}>
          Permanent
        </Toggle>
        <Toggle on={tenure} onClick={() => setTenure(!tenure)}>
          7-day minimum tenure
        </Toggle>
      </div>

      <p className="text-[11px] leading-snug text-ink-faint">
        {permanent
          ? "You will never be able to take this label back, even while nobody holds it."
          : "You can take this label back later, but only while nobody holds it."}
      </p>

      {taken && (
        <p className="text-[11px] text-warn">
          {clean} is already open.
        </p>
      )}
      {error && <p className="text-[11px] text-hot">{error}</p>}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
        on
          ? "border-brand bg-brand-soft text-brand-ink"
          : "border-line text-ink-soft hover:border-brand/40",
      )}
    >
      {children}
    </button>
  );
}
