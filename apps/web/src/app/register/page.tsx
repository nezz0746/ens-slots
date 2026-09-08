"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { encodeFunctionData, parseUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { AcquireName } from "@/components/acquire-name";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useTx } from "@/hooks/use-tx";
import {
  ensRegistryAbi,
  namespaceAbi,
  namespaceFactoryAbi,
  userRegistryAbi,
  verifiableFactoryAbi,
} from "@/lib/abis";
import {
  addresses,
  ALL_ROLES,
  ROLE_REGISTRAR,
  ROLE_UNREGISTER,
} from "@/lib/addresses";
import { ethNode } from "@/lib/names";
import { cn } from "@/lib/utils";

/**
 * Open a namespace under a name you control.
 *
 * Four transactions, shown as four steps rather than hidden behind one button,
 * because they are not atomic and the failure modes differ. If the third one
 * fails you have a namespace that cannot register anything — which is
 * recoverable, but only if you can see where you stopped.
 *
 * The page has two phases. {AcquireName} buys the parent name from ENS's own
 * registrar — commit-reveal, paid in an ERC20 — and the steps below turn that
 * name into a namespace. They are separate because they answer to different
 * contracts and either can be skipped: a name you already own needs only the
 * second half.
 *
 * Nothing below checks that you own the parent. A namespace can be opened
 * under any name; it simply never resolves until the parent points at its
 * registry, which only the parent's owner can do.
 */
const STEPS = [
  { key: "registry", title: "Deploy a subname registry" },
  { key: "namespace", title: "Open the namespace" },
  { key: "roles", title: "Let it register names" },
  { key: "resolver", title: "Point it at its resolver" },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const { address } = useAccount();
  const client = usePublicClient();
  const { send, pending, error } = useTx();

  const [label, setLabel] = useState("");
  const [tax, setTax] = useState("5");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [registry, setRegistry] = useState<`0x${string}` | null>(null);
  const [namespace, setNamespace] = useState<`0x${string}` | null>(null);

  const clean = label.trim().toLowerCase().replace(/\.eth$/, "");
  const node = clean ? ethNode(clean) : null;
  const taxBps = BigInt(Math.round(Number(tax || "0") * 100));

  const mark = (k: string) => setDone((d) => new Set(d).add(k));

  async function deployRegistry() {
    if (!address || !node || !client) return;
    const init = encodeFunctionData({
      abi: userRegistryAbi,
      functionName: "initialize",
      args: [[{ account: address, roleBitmap: ALL_ROLES }]],
    });

    // Read the address it WILL take before sending, because `deployProxy`
    // returns it and a transaction receipt does not carry a return value.
    const predicted = await client.readContract({
      address: addresses.ensVerifiableFactory,
      abi: verifiableFactoryAbi,
      functionName: "deployProxy",
      args: [addresses.ensUserRegistryImpl, BigInt(node), init],
      account: address,
    });

    const r = await send("registry", {
      address: addresses.ensVerifiableFactory,
      abi: verifiableFactoryAbi,
      functionName: "deployProxy",
      args: [addresses.ensUserRegistryImpl, BigInt(node), init],
    });
    if (r) {
      setRegistry(predicted);
      mark("registry");
    }
  }

  async function openNamespace() {
    if (!address || !node || !registry || !client) return;
    const r = await send("namespace", {
      address: addresses.namespaceFactory,
      abi: namespaceFactoryAbi,
      functionName: "open",
      args: [
        registry,
        node,
        `${clean}.eth`,
        {
          recipient: address,
          currency: "0x0000000000000000000000000000000000000000",
          manager: "0x0000000000000000000000000000000000000000",
          hook: "0x0000000000000000000000000000000000000000",
          hookData:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          taxBps,
          minDepositSeconds: 604_800n,
          mutableTax: false,
          mutableHook: false,
        },
        address,
      ],
    });
    if (!r) return;
    // Read it back rather than parsing the receipt: the factory records it.
    const ns = await client.readContract({
      address: addresses.namespaceFactory,
      abi: namespaceFactoryAbi,
      functionName: "namespaceOf",
      args: [node],
    });
    setNamespace(ns);
    mark("namespace");
  }

  async function grantRoles() {
    if (!registry || !namespace) return;
    const r = await send("roles", {
      address: registry,
      abi: ensRegistryAbi,
      functionName: "grantRootRoles",
      args: [ROLE_REGISTRAR | ROLE_UNREGISTER, namespace],
    });
    if (r) mark("roles");
  }

  async function setResolver() {
    if (!namespace || !node || !client) return;
    const resolver = await client.readContract({
      address: addresses.namespaceFactory,
      abi: namespaceFactoryAbi,
      functionName: "resolverOf",
      args: [node],
    });
    const r = await send("resolver", {
      address: namespace,
      abi: namespaceAbi,
      functionName: "setResolver",
      args: [resolver],
    });
    if (r) {
      mark("resolver");
      router.push(`/n/${namespace}`);
    }
  }

  const run = [deployRegistry, openNamespace, grantRoles, setResolver];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Open a namespace
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Put some of your name&rsquo;s subnames on the market. You choose which
          labels, one at a time, afterwards — nothing is opened by this.
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
      </Card>

      {clean && <AcquireName label={clean} onOwned={() => undefined} />}

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
          Then, the namespace
        </p>
      </div>

      <Card className="divide-y divide-line-soft">
        {STEPS.map((step, i) => {
          const complete = done.has(step.key);
          const ready =
            !!address &&
            !!clean &&
            (i === 0 || done.has(STEPS[i - 1].key)) &&
            !complete;
          return (
            <div
              key={step.key}
              className="flex items-center gap-3 px-5 py-3.5"
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                  complete
                    ? "bg-good-soft text-good"
                    : ready
                      ? "bg-brand text-white"
                      : "bg-canvas text-ink-faint",
                )}
              >
                {complete ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "flex-1 text-sm",
                  complete ? "text-ink-faint line-through" : "text-ink",
                )}
              >
                {step.title}
              </span>
              <Button
                size="sm"
                variant={ready ? "primary" : "outline"}
                disabled={!ready || !!pending}
                onClick={run[i]}
              >
                {pending === step.key ? (
                  <Loader2 className="animate-spin" />
                ) : complete ? (
                  "Done"
                ) : (
                  "Run"
                )}
              </Button>
            </div>
          );
        })}
      </Card>

      {error && (
        <p className="rounded-xl bg-hot-soft px-4 py-3 text-xs text-hot">
          {error}
        </p>
      )}

      <Card className="space-y-2 bg-canvas p-5 text-xs leading-relaxed text-ink-soft">
        <p className="font-medium text-ink">One thing this cannot do for you</p>
        <p>
          Subnames here only resolve once <b>{clean || "your name"}.eth</b>{" "}
          points at the registry from step one. That call belongs to whoever
          owns the parent, on ENS&rsquo;s own registry:
        </p>
        <code className="block rounded-lg bg-surface px-3 py-2 text-[11px] break-all">
          setSubregistry(labelhash(&quot;{clean || "…"}&quot;),{" "}
          {registry ?? "<registry>"})
        </code>
        <p>
          Until then names register and mint, and resolve to nothing — the
          Universal Resolver walks down from the root and never reaches them.
        </p>
      </Card>
    </div>
  );
}
