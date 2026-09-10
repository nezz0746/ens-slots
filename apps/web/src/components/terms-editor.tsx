"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
 * So the button says "queue", never "set", and the panel everyone can see says
 * what is queued. A change nobody could see coming would be the trap.
 *
 * ── Prefilled, and dirtiness decides what travels ───────────────────────────
 *
 * Both fields open showing what is true today, and a field that still says what
 * it said is not sent. That replaces two checkboxes which asked the owner to
 * declare an intention they had already expressed by typing — and which, left
 * unticked beside an edited number, silently discarded the edit.
 *
 * It also keeps the app away from a real trap in the contracts: opening a
 * label, a zero rate means "inherit the namespace's"; proposing one, the slot
 * rejects zero outright. The same number, two meanings, one screen apart.
 * Nothing here can send a rate nobody typed, because the only rate it can send
 * is one that differs from the rate on screen.
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
  const { send, pending, error, clearError } = useTx();
  const queryClient = useQueryClient();

  const state = subname.state;
  const isOwner =
    !!address && namespace.owner.toLowerCase() === address.toLowerCase();

  const [open, setOpen] = useState(false);
  const [tax, setTax] = useState("");
  const [days, setDays] = useState("");

  // What is true right now, spelled the way the fields spell it — so a
  // comparison against what is typed is a string comparison and nothing has to
  // round-trip through a bigint to decide whether it changed.
  const currentTax = state ? String(Number(state.taxBps) / 100) : "";
  const currentDays =
    state &&
    state.hook.toLowerCase() === addresses.minimumTenureHook.toLowerCase()
      ? String(BigInt(state.hookData) / DAY_SECONDS)
      : "0";

  // Re-seeded when the dialog OPENS, not once on mount. The chain moves
  // underneath this — a proposal lands, somebody takes the name — and a form
  // that opened showing a stale rate would consider it dirty and send it back.
  useEffect(() => {
    if (!open) return;
    setTax(currentTax);
    setDays(currentDays);
    clearError();
    // Deliberately only on `open`: re-seeding while it is open would fight the
    // person typing in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!isOwner || !state) return null;

  const pendingTax = state.pendingHasTax;
  const pendingHook = state.pendingHasHook;
  const queued = pendingTax || pendingHook;

  const taxBps = BigInt(Math.round(Number(tax || "0") * 100));
  const tenureSeconds =
    BigInt(Math.max(0, Math.round(Number(days || "0")))) * DAY_SECONDS;

  const changeTax = tax.trim() !== currentTax;
  const changeHook = days.trim() !== currentDays;
  const taxValid = !changeTax || (taxBps > 0n && taxBps <= 10_000n);
  const nothing = !changeTax && !changeHook;

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
    if (!ok) return;
    setOpen(false);
    // Re-read now. The banner this queues is drawn from `getSlotInfo`, which is
    // polled — without this the dialog closed on success and nothing on the
    // page changed, which reads as the transaction having done nothing.
    await queryClient.invalidateQueries({ queryKey: ["readContracts"] });
  }

  async function cancel() {
    const ok = await send("terms", {
      address: namespace.address,
      abi: namespaceAbi,
      functionName: "cancelLabelTerms",
      args: [subname.label, pendingTax, pendingHook],
    });
    if (!ok) return;
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["readContracts"] });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={queued ? "Terms — a change is queued" : "Change the terms"}
        aria-label="Change the terms"
        className="relative shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
      >
        <Settings2 className="size-4" />
        {/* A queued change is worth seeing without opening anything. */}
        {queued && (
          <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warn" />
        )}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${subname.label}.${namespace.parentName}`}
        description="Queued, not applied. A change ripens and lands the next time this name changes hands — whoever holds it now keeps what they agreed to."
        className="max-w-sm"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="terms-tax">Tax rate, per 30 days</Label>
            <div className="flex items-center gap-2">
              <Input
                id="terms-tax"
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

          <div className="space-y-1.5">
            <Label htmlFor="terms-tenure">Guaranteed run, in days</Label>
            <Input
              id="terms-tenure"
              value={days}
              inputMode="numeric"
              onChange={(e) => setDays(e.target.value)}
              className="h-9"
            />
            <p className="text-[11px] text-ink-faint">
              How long a holder cannot be outbid. Zero removes the guarantee.
            </p>
          </div>

          {queued && (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn">
              A change is already queued. Sending another replaces it.
            </p>
          )}

          {error && <p className="text-[11px] text-hot">{error}</p>}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={nothing || !taxValid || !!pending}
              onClick={propose}
            >
              {pending === "terms" ? <Loader2 className="animate-spin" /> : null}
              {nothing ? "Nothing changed" : "Queue it"}
            </Button>
            {queued && (
              <Button
                size="sm"
                variant="ghost"
                disabled={!!pending}
                onClick={cancel}
              >
                Drop the queued one
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
