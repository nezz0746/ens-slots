"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useAddresses } from "@/hooks/use-addresses";
import type { Namespace, Subname } from "@/hooks/use-namespaces";
import { useTx } from "@/hooks/use-tx";
import { namespaceAbi } from "@/lib/abis";
import { DAY_SECONDS } from "@/lib/runway";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const ZERO32 = `0x${"0".repeat(64)}` as const;

/**
 * The owner's controls for one name's terms.
 *
 * ── Why this is safe to offer at all ────────────────────────────────────────
 *
 * A namespace's owner can re-price the market they run, and the reason that is
 * not a trap for the people in it is that they cannot do it NOW. The slot only
 * ever queues a change: it ripens, and lands at the next occupancy transition.
 * Whoever is holding the name keeps the terms they agreed to until they leave.
 *
 * So the form says "queue", never "set", and the panel everyone can see says
 * what is queued. A change nobody could see coming would be the trap.
 *
 * ── Why zero is not a value here ────────────────────────────────────────────
 *
 * Opening a label, zero tax means "inherit the namespace's rate". Proposing
 * one, the slot rejects zero outright. The same number means two different
 * things a screen apart, so this form never sends a rate the owner did not
 * type — the checkbox decides whether tax travels at all.
 */
export function TermsEditor({
  namespace,
  subname,
}: {
  namespace: Namespace;
  subname: Subname;
}) {
  const { address } = useAccount();
  const addresses = useAddresses();
  const { send, pending, error } = useTx();
  const queryClient = useQueryClient();

  const state = subname.state;
  const isOwner =
    !!address && namespace.owner.toLowerCase() === address.toLowerCase();

  const [open, setOpen] = useState(false);
  const [changeTax, setChangeTax] = useState(false);
  const [tax, setTax] = useState(() =>
    state ? String(Number(state.taxBps) / 100) : "5",
  );
  const [changeHook, setChangeHook] = useState(false);
  const [days, setDays] = useState("7");

  if (!isOwner || !state) return null;

  // Read out here rather than inside `cancel`: a function declaration does not
  // carry the narrowing from the early return above it.
  const pendingTax = state.pendingHasTax;
  const pendingHook = state.pendingHasHook;
  const queued = pendingTax || pendingHook;
  const taxBps = BigInt(Math.round(Number(tax || "0") * 100));
  const tenureSeconds = BigInt(Math.max(0, Math.round(Number(days || "0")))) * DAY_SECONDS;

  // The slot refuses a zero rate, and refuses a hook without data or data
  // without a hook — so the two always move together, and zero days means
  // detaching the hook rather than a hook that guarantees nothing.
  const taxValid = !changeTax || (taxBps > 0n && taxBps <= 10_000n);
  const nothingChosen = !changeTax && !changeHook;

  async function propose() {
    const ok = await send("terms", {
      address: namespace.address,
      abi: namespaceAbi,
      functionName: "proposeLabelTerms",
      args: [
        subname.label,
        changeTax ? taxBps : 0n,
        changeHook && tenureSeconds > 0n ? addresses.minimumTenureHook : ZERO,
        changeHook && tenureSeconds > 0n
          ? (`0x${tenureSeconds.toString(16).padStart(64, "0")}` as `0x${string}`)
          : ZERO32,
        changeTax,
        changeHook,
      ],
    });
    if (ok) {
      setOpen(false);
      setChangeTax(false);
      setChangeHook(false);
      // Re-read now. The banner this queues is drawn from `getSlotInfo`, which
      // is polled — without this the form closed on success and nothing on the
      // page changed, which reads as the transaction having done nothing.
      // wagmi's key prefix — the same reads back several figures across two
      // components, which is why `use-collect-all` invalidates the same way.
      await queryClient.invalidateQueries({ queryKey: ["readContracts"] });
    }
  }

  async function cancel() {
    await send("terms", {
      address: namespace.address,
      abi: namespaceAbi,
      functionName: "cancelLabelTerms",
      args: [subname.label, pendingTax, pendingHook],
    });
    // wagmi's key prefix — the same reads back several figures across two
      // components, which is why `use-collect-all` invalidates the same way.
      await queryClient.invalidateQueries({ queryKey: ["readContracts"] });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {queued ? "Change what's queued" : "Change the terms"}
        </Button>
        {queued && (
          <Button size="sm" variant="ghost" disabled={!!pending} onClick={cancel}>
            {pending === "terms" ? <Loader2 className="animate-spin" /> : null}
            Cancel it
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Queued, not applied. It ripens, then lands the next time this name
        changes hands — whoever holds it now keeps what they agreed to.
      </p>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={changeTax}
          onChange={(e) => setChangeTax(e.target.checked)}
        />
        <span>Tax rate</span>
      </label>
      {changeTax && (
        <div className="space-y-1">
          <Label htmlFor="newtax">Per 30 days</Label>
          <div className="flex items-center gap-2">
            <Input
              id="newtax"
              value={tax}
              inputMode="decimal"
              onChange={(e) => setTax(e.target.value)}
              className="h-9"
            />
            <span className="text-xs text-ink-faint">%</span>
          </div>
          {!taxValid && (
            <p className="text-[11px] text-hot">
              Between 0 and 100, and not zero — the slot rejects a zero rate.
            </p>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={changeHook}
          onChange={(e) => setChangeHook(e.target.checked)}
        />
        <span>Guaranteed run</span>
      </label>
      {changeHook && (
        <div className="space-y-1">
          <Label htmlFor="newtenure">Days a holder cannot be outbid</Label>
          <Input
            id="newtenure"
            value={days}
            inputMode="numeric"
            onChange={(e) => setDays(e.target.value)}
            className="h-9"
          />
          <p className="text-[11px] text-ink-faint">
            Zero removes the guarantee entirely — anyone could be outbid the
            moment after they pay.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={nothingChosen || !taxValid || !!pending}
          onClick={propose}
        >
          {pending === "terms" ? <Loader2 className="animate-spin" /> : null}
          Queue it
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {error && <p className="text-[11px] text-hot">{error}</p>}
    </div>
  );
}
