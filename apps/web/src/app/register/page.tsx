"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { encodeFunctionData } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";

import { AcquireName } from "@/components/acquire-name";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useTx } from "@/hooks/use-tx";
import {
  ethRegistrarAbi,
  namespaceFactoryAbi,
  userRegistryAbi,
  verifiableFactoryAbi,
} from "@/lib/abis";
import { ALL_ROLES } from "@/lib/addresses";
import { useAddresses, useCurrency } from "@/hooks/use-addresses";
import { ethNode } from "@/lib/names";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * How long a guaranteed run can be expressed as.
 *
 * A month is 30 days, which is the same approximation the tax rate already
 * makes ("per 30 days") — the hook counts seconds and has no calendar, so a
 * longer unit is only ever a multiplier and it should be the same one the rest
 * of the form uses.
 */
const TENURE_UNITS = {
  seconds: 1n,
  minutes: 60n,
  hours: 3_600n,
  days: 86_400n,
  weeks: 604_800n,
  months: 2_592_000n,
} as const;

type TenureUnit = keyof typeof TENURE_UNITS;

/** "1 hours" reads like a bug even when the number is right. */
const plural = (unit: TenureUnit, count: number) =>
  count === 1 ? unit.slice(0, -1) : unit;

/**
 * Open a namespace under a name you control.
 *
 * ── One button, where there were four ───────────────────────────────────────
 *
 * This used to be a checklist: deploy a subname registry, open the namespace,
 * grant it the roles it needs, point it at a resolver. They were shown as four
 * steps rather than hidden behind one button because they were not atomic — if
 * the third failed you had a namespace that could not register anything, and
 * the only way to recover was to see where you stopped.
 *
 * `SlotNamespaceFactory.open` does all four in one transaction now. The roles
 * are the reason it can: they go in the registry's own initializer rather than
 * a call afterwards, which works because the namespace's address is known
 * before the registry exists. So there is nothing to half-finish, and the
 * checklist that existed to make a partial failure legible has nothing left to
 * describe.
 *
 * ── The one call that is still not ours ─────────────────────────────────────
 *
 * `setSubregistry` on the `.eth` registry belongs to whoever owns the parent
 * name. For a name being bought here it is free — {AcquireName} passes the
 * registry address to the registrar's own `register`, so the name arrives
 * already pointing at it. For a name you already own it is one call you make
 * yourself, and the card at the bottom says so.
 */
export default function RegisterPage() {
  const router = useRouter();
  const { address } = useAccount();
  const addresses = useAddresses();
  const currency = useCurrency();
  const client = usePublicClient();
  const { send, pending, error } = useTx();

  const [label, setLabel] = useState("");
  const [tax, setTax] = useState("5");
  /**
   * The tenure every holder is guaranteed.
   *
   * A term of the market rather than a per-label option: without it a holder
   * can be outbid ten minutes after paying, and the name they bought was never
   * really theirs. It reaches every slot through the namespace's terms, as the minimum
   * tenure hook's window.
   *
   * Hours by default, and every unit from seconds up. A guarantee measured in
   * days cannot be demonstrated in a sitting — the whole point of the window is
   * watching somebody fail to outbid inside it, and then succeed once it
   * lapses. Seconds and minutes are there for exactly that, and months for a
   * namespace that means it.
   */
  const [tenure, setTenure] = useState("24");
  const [unit, setUnit] = useState<TenureUnit>("hours");

  const clean = label.trim().toLowerCase().replace(/\.eth$/, "");

  /**
   * Whether the parent name is still unregistered.
   *
   * The page is two jobs — buy the name, then open the namespace — and only the
   * second is what anybody came for. Without knowing which of them is still
   * outstanding the screen showed both at once, with a live button on each, and
   * no way to tell that one is a prerequisite for the other.
   */
  const { data: available } = useReadContract({
    address: addresses.ensEthRegistrar,
    abi: ethRegistrarAbi,
    functionName: "isAvailable",
    args: [clean],
    query: { enabled: clean.length > 0, refetchInterval: 8_000 },
  });
  const needsBuying = available === true;
  const node = clean ? ethNode(clean) : null;
  const taxBps = BigInt(Math.round(Number(tax || "0") * 100));
  const tenureCount = Math.max(0, Math.round(Number(tenure || "0")));
  const tenureSeconds = BigInt(tenureCount) * TENURE_UNITS[unit];

  /**
   * Where the factory will put the registry, before it exists.
   *
   * ENS derives it by CREATE2 from `(verifiable factory, caller, salt)`, and
   * the caller is our factory rather than this user — so this is simulated with
   * `account` set to the factory address. Asking ENS's own code rather than
   * reimplementing the derivation means it cannot drift from what actually gets
   * deployed.
   *
   * It is needed BEFORE the namespace is opened, because the parent name is
   * registered with its subregistry already set.
   */
  async function predictRegistry(): Promise<`0x${string}` | null> {
    if (!node || !client || !address) return null;
    const init = encodeFunctionData({
      abi: userRegistryAbi,
      functionName: "initialize",
      args: [[{ account: address, roleBitmap: ALL_ROLES }]],
    });
    return client.readContract({
      address: addresses.ensVerifiableFactory,
      abi: verifiableFactoryAbi,
      functionName: "deployProxy",
      args: [addresses.ensUserRegistryImpl, BigInt(node), init],
      account: addresses.namespaceFactory,
    });
  }

  async function open() {
    if (!address || !node || !client) return;

    const receipt = await send("open", {
      address: addresses.namespaceFactory,
      abi: namespaceFactoryAbi,
      functionName: "open",
      args: [
        {
          // Zero: let the factory deploy the registry, which is the only way
          // the namespace gets its roles in the same transaction.
          registry: ZERO,
          parentNode: node,
          parentName: `${clean}.eth`,
          terms: {
            recipient: address,
            // MockUSDC, like everything else this app prices. Opened with the
            // zero address instead, the slots would be denominated in native
            // ETH while every figure on screen was formatted as 6-decimal
            // USDC — and the ERC-20 paths the hold form takes would revert.
            currency,
            manager: ZERO,
            // Zero days means no hook at all — and the slot rejects a hook
            // paired with empty data, or data with no hook, so the two move
            // together.
            hook: tenureSeconds > 0n ? addresses.minimumTenureHook : ZERO,
            hookData: `0x${tenureSeconds.toString(16).padStart(64, "0")}`,
            taxBps,
            minDepositSeconds: 604_800n,
            mutableTax: false,
            mutableHook: false,
          },
          owner: address,
          // None yet. Labels are opened from the namespace's own page, where
          // there is something to look at while choosing them.
          labels: [],
        },
      ],
    });
    if (!receipt) return;

    // Read it back rather than parsing the receipt: the factory records it.
    const namespace = await client.readContract({
      address: addresses.namespaceFactory,
      abi: namespaceFactoryAbi,
      functionName: "namespaceOf",
      args: [node],
    });
    router.push(`/n/${namespace}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Open a namespace
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Two steps: get the <b className="font-medium text-ink">.eth</b> name
          if you do not already have it, then open it up. Which subnames go on
          the market is chosen afterwards, on the name&rsquo;s own page.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="label">Your name</Label>
          <div className="flex items-center gap-2">
            <Input
              id="label"
              value={label}
              placeholder="community"
              onChange={(e) => setLabel(e.target.value)}
            />
            <span className="shrink-0 text-sm text-ink-faint">.eth</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tax">Tax rate, per 30 days</Label>
          <div className="flex items-center gap-2">
            <Input
              id="tax"
              value={tax}
              inputMode="decimal"
              className="w-24"
              onChange={(e) => setTax(e.target.value)}
            />
            <span className="text-sm text-ink-faint">%</span>
            <p className="ml-2 text-[11px] leading-tight text-ink-faint">
              What a holder pays you, continuously, on the price they set. Same
              rate for every subname — a more valuable one is priced higher by
              its own holder and pays more at the same rate.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tenure">Guaranteed run</Label>
          <div className="flex items-center gap-2">
            <Input
              id="tenure"
              value={tenure}
              inputMode="numeric"
              className="w-24"
              onChange={(e) => setTenure(e.target.value)}
            />
            <select
              aria-label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as TenureUnit)}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink-soft transition-colors hover:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              {(Object.keys(TENURE_UNITS) as TenureUnit[]).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <p className="ml-2 text-[11px] leading-tight text-ink-faint">
              {tenureCount > 0
                ? `Nobody can be outbid for ${tenureCount} ${plural(unit, tenureCount)} after taking a space, so what a holder pays for is actually theirs.`
                : "Anyone can be outbid the moment after they pay. A holder has no guarantee of keeping the name at all."}
            </p>
          </div>
        </div>
      </Card>

      {/* Shown only while the name is actually unregistered. Once it is yours
          this whole card is answered, and leaving it up put a second live
          sequence next to the one thing left to do. */}
      {clean && needsBuying && (
        <AcquireName label={clean} predictRegistry={predictRegistry} />
      )}

      <Card className="space-y-3 p-5">
        <div>
          <p className="text-sm font-medium">
            {needsBuying ? "Then open the namespace" : "Open the namespace"}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-ink-faint">
            One transaction: it deploys your subname registry, gives the
            namespace the two roles it needs, and points it at the resolver.
          </p>
        </div>
        <Button
          className="w-full"
          // Gated on the name existing. Opening a namespace under a name
          // nobody has registered deploys a registry the `.eth` entry cannot be
          // pointed at, so it succeeds and resolves to nothing — the most
          // expensive way this page could mislead somebody.
          disabled={!address || !clean || needsBuying || !!pending}
          onClick={open}
        >
          {pending === "open" ? (
            <>
              <Loader2 className="animate-spin" />
              Confirming…
            </>
          ) : (
            "Open"
          )}
        </Button>
        {clean && needsBuying && (
          <p className="text-center text-[11px] text-ink-faint">
            Buy {clean}.eth above first — a namespace needs a name to sit under.
          </p>
        )}
      </Card>

      {error && (
        <p className="rounded-xl bg-hot-soft px-4 py-3 text-xs text-hot">
          {error}
        </p>
      )}

      <Card className="space-y-2 bg-canvas p-5 text-xs leading-relaxed text-ink-soft">
        <p className="font-medium text-ink">
          If you already own <b>{clean || "your name"}.eth</b>
        </p>
        <p>
          Buying it above points it at the registry for you. A name you already
          hold needs one call of your own, on ENS&rsquo;s registry, from
          whichever address owns it:
        </p>
        <code className="block rounded-lg bg-surface px-3 py-2 text-[11px] break-all">
          setSubregistry(labelhash(&quot;{clean || "…"}&quot;), &lt;your
          registry&gt;)
        </code>
        <p>
          Until then names register and mint, and resolve to nothing — the
          Universal Resolver walks down from the root and never reaches them.
        </p>
      </Card>
    </div>
  );
}
