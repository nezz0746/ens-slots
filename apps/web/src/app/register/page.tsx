"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { encodeFunctionData, keccak256, toHex } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";

import { AcquireName } from "@/components/acquire-name";
import { FlowStep, type StepState } from "@/components/flow-step";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTx } from "@/hooks/use-tx";
import {
  ensRegistryAbi,
  ethRegistrarAbi,
  namespaceAbi,
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

  const clean = label
    .trim()
    .toLowerCase()
    .replace(/\.eth$/, "");

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

  /**
   * Whose name it is, when somebody already has it.
   *
   * A namespace answers to whoever holds its parent, so `open` reverts for
   * anybody else — and used to do so at the wallet, after the gas estimate,
   * with a bare `ZeroAddress`. The page can ask the same question the factory
   * asks and answer it before anything is signed.
   *
   * Two calls, because `ownerOf` takes a TOKEN ID and a labelhash is not one.
   * Asking it about `keccak(label)` returns zero for a registered name with no
   * error at all, which would read here as "nobody owns this".
   */
  const labelhash = clean
    ? (keccak256(toHex(clean)) as `0x${string}`)
    : undefined;
  const { data: tokenId } = useReadContract({
    address: addresses.ensEthRegistry,
    abi: ensRegistryAbi,
    functionName: "getTokenId",
    args: labelhash ? [BigInt(labelhash)] : undefined,
    query: { enabled: !!labelhash && available === false },
  });
  const { data: parentOwner } = useReadContract({
    address: addresses.ensEthRegistry,
    abi: ensRegistryAbi,
    functionName: "ownerOf",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: tokenId !== undefined },
  });

  const owned =
    !!address &&
    !!parentOwner &&
    (parentOwner as string).toLowerCase() === address.toLowerCase();
  const somebodyElses = available === false && !!parentOwner && !owned;
  const node = clean ? ethNode(clean) : null;

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
          parentName: `${clean}.eth`,
          // MockUSDC, like everything else this app prices. Opened with the
          // zero address instead, the slots would be denominated in native ETH
          // while every figure on screen was formatted as 6-decimal USDC — and
          // the ERC-20 paths the hold form takes would revert.
          currency,
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

    /**
     * Point the parent at the registry the namespace just got.
     *
     * ── Why this is a second transaction and not part of `open` ─────────────
     *
     * `setSubregistry` belongs to whoever owns the `.eth` name, and the factory
     * is not that — it cannot do this on anybody's behalf, ever. A name bought
     * through the flow above dodges it because the registrar takes the
     * subregistry as an argument and registers the name already pointing at it.
     * A name you ALREADY hold has no such moment.
     *
     * ── Why the app makes it instead of printing it ────────────────────────
     *
     * This used to be a paragraph telling you to go and call it yourself, with
     * the labelhash spelled out. That existed because the page could not know
     * you were the owner — anybody could open a namespace for any name. Now the
     * form checks, and refuses when the name is not yours, so by the time this
     * runs the connected wallet is provably the one account that can do it.
     *
     * Skipped when the name was just bought: it is already pointed there, and
     * setting it again is a transaction that changes nothing.
     */
    if (!needsBuying && tokenId !== undefined) {
      const registry = await client.readContract({
        address: namespace as `0x${string}`,
        abi: namespaceAbi,
        functionName: "registry",
      });
      const pointed = await send("point", {
        address: addresses.ensEthRegistry,
        abi: ensRegistryAbi,
        functionName: "setSubregistry",
        args: [tokenId, registry],
      });
      // Not fatal. The namespace exists and its page says whether the name
      // resolves, which is a better place to retry from than this form.
      if (!pointed) {
        router.push(`/n/${namespace}`);
        return;
      }

      /**
       * And the name's own resolver, which is a separate entry.
       *
       * `setSubregistry` says where the names BELOW this one live. It says
       * nothing about how this name itself resolves, and without a resolver on
       * the `.eth` entry the namespace profile written by `setParentText` is
       * stored somewhere no ENS client can reach — the Universal Resolver walks
       * down looking for a resolver, finds none, and answers nothing. "Edit
       * profile" appeared to work because the app reads `parentTextOf` from the
       * contract directly; everybody else on ENS saw an empty name.
       *
       * A name bought through the flow above never had this gap: the registrar
       * takes a resolver argument and `acquire-name` passes ours. Only a name
       * you already held arrives here without one.
       *
       * Read first, so the common case of it already being right costs nothing.
       */
      const current = await client.readContract({
        address: addresses.ensEthRegistry,
        abi: ensRegistryAbi,
        functionName: "getResolver",
        args: [clean],
      });
      if (
        (current as string).toLowerCase() !==
        addresses.namespaceResolver.toLowerCase()
      ) {
        // Also not fatal: subnames already resolve at this point. Only the
        // parent's own profile is waiting on it.
        await send("resolver", {
          address: addresses.ensEthRegistry,
          abi: ensRegistryAbi,
          functionName: "setResolver",
          args: [tokenId, addresses.namespaceResolver],
        });
      }
    }

    router.push(`/n/${namespace}`);
  }

  /**
   * Which step the visitor is actually on.
   *
   * Derived, never stored: every input is a live chain read, so the flow cannot
   * disagree with the chain the way a `useState` step counter would after a
   * refresh, an account switch, or a name bought in another tab.
   */
  const nameStep: StepState = !clean
    ? "active"
    : available === undefined
      ? "active"
      : "done";
  const buyStep: StepState = !clean
    ? "todo"
    : needsBuying
      ? "active"
      : available === false
        ? "done"
        : "todo";
  const openStep: StepState =
    owned && !needsBuying ? "active" : somebodyElses ? "todo" : "todo";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Open a namespace
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Three steps across two protocols. ENS owns the name; Nameslots opens
          its subnames to a market. Each step below says which is which.
        </p>
      </div>

      <div>
        <FlowStep
          index={1}
          total={3}
          protocol="ens"
          title="Choose your .eth name"
          state={nameStep}
          summary="The name whose subnames go on the market. You keep it throughout — the namespace answers to whoever holds it."
        >
          <div className="flex items-center gap-2">
            <Input
              id="label"
              value={label}
              placeholder="community"
              onChange={(e) => setLabel(e.target.value)}
            />
            <span className="shrink-0 text-sm text-ink-faint">.eth</span>
          </div>

          {clean && (
            <p
              className={cn(
                "mt-2 text-[11px] leading-relaxed",
                somebodyElses ? "text-hot" : "text-ink-faint",
              )}
            >
              {somebodyElses
                ? `${clean}.eth belongs to somebody else. A namespace answers to whoever holds its parent, so this one would not be yours to run.`
                : owned
                  ? `You hold ${clean}.eth. Skip to step 3.`
                  : needsBuying
                    ? `${clean}.eth is free. Step 2 registers it to you.`
                    : "Checking…"}
            </p>
          )}
        </FlowStep>

        <FlowStep
          index={2}
          total={3}
          protocol="ens"
          title="Register it"
          state={buyStep}
          summary={
            owned && !needsBuying
              ? "Already done — this name is yours."
              : "Four transactions on ENS: mint the test USDC that pays the fee, approve it, commit, then register. The commitment has to sit for a minute before the registration will take."
          }
        >
          {clean && needsBuying && (
            <AcquireName label={clean} predictRegistry={predictRegistry} />
          )}
        </FlowStep>

        <FlowStep
          index={3}
          total={3}
          protocol="nameslots"
          title="Open the namespace"
          state={openStep}
          summary={
            needsBuying
              ? "One transaction, once the name is yours: it deploys your subname registry and gives the namespace the roles it needs. The name you just registered already points at it."
              : "Up to three transactions. The first deploys your subname registry and gives the namespace its roles — that one is ours. The second records that registry on your .eth name and the third sets the name's own resolver; both are ENS, and only the name's owner can send them."
          }
        >
          <Button
            className="w-full"
            // Gated on the name existing. Opening a namespace under a name
            // nobody has registered deploys a registry that no `.eth` entry can
            // be made to point to, so it succeeds and resolves to nothing — the
            // most expensive way this page could mislead somebody.
            // `somebodyElses` matters as much as the rest: `open` derives the
            // owner from the name, so this reverts for anybody who is not it —
            // and a live button whose only outcome is a revert is worse than
            // the message above it is good.
            disabled={
              !address || !clean || needsBuying || somebodyElses || !!pending
            }
            onClick={open}
          >
            {pending === "open" ? (
              <>
                <Loader2 className="animate-spin" />
                Confirming…
              </>
            ) : pending === "point" ? (
              <>
                <Loader2 className="animate-spin" />
                Recording the registry on your name…
              </>
            ) : pending === "resolver" ? (
              <>
                <Loader2 className="animate-spin" />
                Setting the resolver on your name…
              </>
            ) : (
              "Open the namespace"
            )}
          </Button>
          {clean && needsBuying && (
            <p className="mt-2 text-center text-[11px] text-ink-faint">
              Finish step 2 first — a namespace needs a name to sit under.
            </p>
          )}
        </FlowStep>
      </div>

      {error && (
        <p className="rounded-xl bg-hot-soft px-4 py-3 text-xs text-hot">
          {error}
        </p>
      )}
    </div>
  );
}
