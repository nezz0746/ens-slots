"use client";

import { Check, Clock, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useReadContract } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { useBatch, useTx } from "@/hooks/use-tx";
import { ethRegistrarAbi, mockUsdcAbi } from "@/lib/abis";
import { formatAmount } from "@/lib/format";
import { useAddresses, useIsLocal } from "@/hooks/use-addresses";
import { cn } from "@/lib/utils";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const ZERO32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const YEAR = 31_536_000n;

/**
 * Buy the parent name itself, through ENS's own registrar.
 *
 * Commit-reveal, which is why this is four steps and not one. You publish a
 * hash of what you intend, wait out `MIN_COMMITMENT_AGE`, then reveal it. The
 * wait is the whole mechanism: it stops somebody reading your registration out
 * of the mempool and front-running it, so it cannot be skipped or shortened.
 *
 * Two things surprise people, so both are on screen rather than in a doc:
 *
 *   * It is paid in an ERC20, not in ether. On this deployment that is
 *     MockUSDC, which anyone can mint — the faucet is in the header.
 *   * The secret must survive between the two transactions. It is generated
 *     once and held here; reloading the page mid-flow means committing again.
 *
 * ── The name arrives already wired ──────────────────────────────────────────
 *
 * `register` takes a `subregistry` and a `resolver`, and both are otherwise two
 * more calls the parent's owner has to make afterwards — the two the README
 * used to list as "still to do", and the two people forget, because a name that
 * skips them registers and mints and then silently resolves to nothing.
 *
 * The registry does not exist yet at this point, which is exactly why this
 * works: ENS derives its address by CREATE2, so `predictRegistry` can answer
 * before anything is deployed. Both values go into the commitment as well as
 * the registration, because the commitment is a hash of the whole intent and a
 * mismatch in either one makes the reveal fail.
 */
export function AcquireName({
  label,
  predictRegistry,
}: {
  label: string;
  predictRegistry: () => Promise<`0x${string}` | null>;
}) {
  const { address } = useAccount();
  const client = usePublicClient();
  const addresses = useAddresses();
  const isLocal = useIsLocal();
  const { send, pending, error } = useTx();
  const queryClient = useQueryClient();
  /**
   * Approving and committing touch two different contracts, so no contract can
   * put them in one transaction — only the wallet can. Batched where the wallet
   * supports EIP-5792, sent one after the other where it does not.
   */
  const batch = useBatch();
  /** Whether approve and commit arrive as one signature, and so as one step. */
  const folded = batch.atomic;

  const [secret, setSecret] = useState<`0x${string}` | null>(null);
  /**
   * Held from commit to reveal for the same reason `secret` is: the commitment
   * covers it, so the registration has to repeat it exactly.
   */
  const [subregistry, setSubregistry] = useState<`0x${string}` | null>(null);
  const [committedAt, setCommittedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [registered, setRegistered] = useState(false);

  // Generated in an effect, not during render: `crypto` is not there on the
  // server, and a value that differs between the two renders is a hydration
  // mismatch on top of being wrong.
  useEffect(() => {
    if (secret) return;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    setSecret(
      `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`,
    );
  }, [secret]);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: available, refetch: recheck } = useReadContract({
    address: addresses.ensEthRegistrar,
    abi: ethRegistrarAbi,
    functionName: "isAvailable",
    args: [label],
    query: { enabled: label.length > 0 },
  });

  const { data: price } = useReadContract({
    address: addresses.ensEthRegistrar,
    abi: ethRegistrarAbi,
    functionName: "getRegisterPrice",
    args: [label, YEAR, addresses.mockUsdc],
    query: { enabled: label.length > 0 && available === true },
  });

  const { data: minAge } = useReadContract({
    address: addresses.ensEthRegistrar,
    abi: ethRegistrarAbi,
    functionName: "MIN_COMMITMENT_AGE",
  });

  const { data: balance } = useReadContract({
    address: addresses.mockUsdc,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [address ?? ZERO],
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const { data: allowance, refetch: recheckAllowance } = useReadContract({
    address: addresses.mockUsdc,
    abi: mockUsdcAbi,
    functionName: "allowance",
    args: [address ?? ZERO, addresses.ensEthRegistrar],
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const total = price ? price[0] + price[1] : 0n;
  const approved = (allowance ?? 0n) >= total && total > 0n;
  const funded = (balance ?? 0n) >= total && total > 0n;

  /**
   * Mint exactly what is missing, from the step that is short.
   *
   * `mint` is open to anyone on this token — no owner, no minter role — which
   * is what makes this honest rather than a local-only shortcut; see the note
   * on {UsdcWidget}. The shortfall rather than a round 100, so the button can
   * say what it will do.
   */
  const shortfall = total > (balance ?? 0n) ? total - (balance ?? 0n) : 0n;
  const mintShortfall = async () => {
    if (!address || shortfall === 0n) return;
    const ok = await send("mint", {
      address: addresses.mockUsdc,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [address, shortfall],
    });
    if (!ok) return;
    // Read the balance back rather than waiting for its interval. The step
    // this unblocks is the one directly above the button, and React Query
    // pauses interval refetching while the tab is unfocused — so "poll in five
    // seconds" can mean "never", and the money arrives with nothing on screen
    // acknowledging it.
    await queryClient.invalidateQueries({ queryKey: ["readContracts"] });
  };
  const wait = Number(minAge ?? 60n);
  const elapsed = committedAt ? now - committedAt : 0;
  const ready = committedAt !== null && elapsed >= wait;

  async function commit() {
    if (!address || !secret || !client) return;

    const registry = (await predictRegistry()) ?? ZERO;
    const hash = await client.readContract({
      address: addresses.ensEthRegistrar,
      abi: ethRegistrarAbi,
      functionName: "makeCommitment",
      args: [
        label,
        address,
        secret,
        registry,
        addresses.namespaceResolver,
        YEAR,
        ZERO32,
      ],
    });
    const r = await send("commit", {
      address: addresses.ensEthRegistrar,
      abi: ethRegistrarAbi,
      functionName: "commit",
      args: [hash],
    });
    if (r) {
      setSubregistry(registry);
      setCommittedAt(Math.floor(Date.now() / 1000));
    }
  }

  async function register() {
    if (!address || !secret || !subregistry) return;
    const r = await send("register", {
      address: addresses.ensEthRegistrar,
      abi: ethRegistrarAbi,
      functionName: "register",
      args: [
        label,
        address,
        secret,
        subregistry,
        addresses.namespaceResolver,
        YEAR,
        addresses.mockUsdc,
        ZERO32,
      ],
    });
    if (r) {
      setRegistered(true);
      recheck();
    }
  }

  /**
   * The allowance and the commitment in one signature.
   *
   * Only reachable when the wallet reports atomic support. It cannot swallow
   * the commit half: the two are all-or-nothing, so an approval that lands
   * without its commitment is not a state this can leave behind.
   */
  async function approveAndCommit() {
    if (!address || !secret || !client) return;

    const registry = (await predictRegistry()) ?? ZERO;
    const hash = await client.readContract({
      address: addresses.ensEthRegistrar,
      abi: ethRegistrarAbi,
      functionName: "makeCommitment",
      args: [
        label,
        address,
        secret,
        registry,
        addresses.namespaceResolver,
        YEAR,
        ZERO32,
      ],
    });

    const ok = await batch.sendBatch("acquire", [
      {
        address: addresses.mockUsdc,
        abi: mockUsdcAbi,
        functionName: "approve",
        args: [addresses.ensEthRegistrar, total],
      },
      {
        address: addresses.ensEthRegistrar,
        abi: ethRegistrarAbi,
        functionName: "commit",
        args: [hash],
      },
    ]);

    if (ok) {
      setSubregistry(registry);
      setCommittedAt(Math.floor(Date.now() / 1000));
      recheckAllowance();
    }
  }

  /** Push anvil past the commitment wait rather than sitting through it. */
  async function skipAhead() {
    for (const [method, params] of [
      ["evm_increaseTime", [wait + 5]],
      ["evm_mine", []],
    ] as const) {
      await fetch("http://127.0.0.1:8545", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    }
    setCommittedAt((c) => (c === null ? c : c - wait - 5));
  }

  if (!label) return null;

  if (available === false && !registered) {
    return (
      <Card className="space-y-1 p-5">
        <p className="text-sm font-medium">{label}.eth is already taken</p>
        <p className="text-xs text-ink-soft">
          If it is yours, skip ahead — nothing below checks who owns the parent,
          and opening a namespace under a name you do not control simply never
          resolves.
        </p>
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-line-soft">
      <div className="flex items-baseline justify-between gap-3 p-5 pb-3">
        <div>
          <p className="text-sm font-medium">{label}.eth</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            Available · one year
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">
            {price ? Number(formatUnits(total, 6)).toFixed(2) : "—"}
            <span className="ml-1 text-xs font-normal text-ink-faint">
              USDC
            </span>
          </p>
          {price && price[1] > 0n && (
            <p className="text-[11px] text-warn">
              includes {Number(formatUnits(price[1], 6)).toFixed(2)} premium
            </p>
          )}
        </div>
      </div>

      {/*
       * One step or two, depending on the wallet.
       *
       * Approving and committing touch different contracts, so only the wallet
       * can put them in one transaction. Where it can, this IS the commit and
       * showing a second "Commit" step underneath contradicted it — the screen
       * said one signature and then listed two things to run.
       */}
      <Step
        n={1}
        title={folded ? "Approve and commit" : "Approve the registrar"}
        note={
          !funded
            ? "You do not hold enough to pay the fee."
            : folded
              ? "One signature: the fee allowance and the commitment together."
              : "It pulls the fee from you when you register."
        }
        done={folded ? committedAt !== null : approved}
        ready={!!address && funded && (folded ? committedAt === null : !approved)}
        blocked={
          !!address && !funded && shortfall > 0n
            ? {
                label:
                  pending === "mint"
                    ? "Minting…"
                    : `Mint ${formatAmount(shortfall)}`,
                onRun: mintShortfall,
              }
            : null
        }
        busy={pending === "approve" || batch.pending === "acquire"}
        error={
          pending === null && !approved ? (error ?? batch.error) : null
        }
        onRun={async () => {
          if (batch.atomic) {
            await approveAndCommit();
            return;
          }
          await send("approve", {
            address: addresses.mockUsdc,
            abi: mockUsdcAbi,
            functionName: "approve",
            args: [addresses.ensEthRegistrar, total],
          });
          recheckAllowance();
        }}
      />

      {!folded && (
        <Step
          n={2}
          title="Commit"
          note="A hash of what you intend, so nobody can front-run the reveal."
          done={committedAt !== null}
          ready={approved && committedAt === null}
          busy={pending === "commit"}
          error={pending === null && approved && committedAt === null ? error : null}
          onRun={commit}
        />
      )}

      <div className="flex items-center gap-3 px-5 py-3.5">
        <Bullet n={folded ? 2 : 3} done={ready} active={committedAt !== null && !ready} />
        <div className="flex-1">
          <p className={cn("text-sm", ready && "text-ink-faint line-through")}>
            Wait {wait} seconds
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            {committedAt === null
              ? "Starts once you commit."
              : ready
                ? "Done."
                : `${wait - elapsed}s to go.`}
          </p>
        </div>
        {isLocal && committedAt !== null && !ready && (
          <Button size="sm" variant="outline" onClick={skipAhead}>
            <Clock />
            Skip
          </Button>
        )}
      </div>

      <Step
        n={folded ? 3 : 4}
        title="Register"
        note="Mints the name to you, pointing at your registry and resolver."
        done={registered}
        ready={ready && !registered}
        busy={pending === "register"}
        error={pending === null && ready && !registered ? error : null}
        onRun={register}
      />


    </Card>
  );
}

function Step({
  n,
  title,
  note,
  done,
  ready,
  busy,
  onRun,
  blocked,
  error,
}: {
  n: number;
  title: string;
  note: string;
  done: boolean;
  ready: boolean;
  busy: boolean;
  onRun: () => void;
  /**
   * What to press when the step is blocked by something it can fix itself.
   *
   * A step waiting on an EARLIER step shows nothing, which is right — there is
   * nothing to do there yet. Being short of the fee is not that: there is a
   * remedy, it is one call, and the note used to point at a button in the site
   * header several hundred pixels away. Pointing somewhere else is what a
   * screen does when it has run out of ideas.
   */
  blocked?: { label: string; onRun: () => void } | null;
  /**
   * Shown here rather than at the foot of the card.
   *
   * It used to render after step 4, so a refusal on step 1 put its reason
   * several hundred pixels below the button that caused it — off screen on the
   * step people actually start from. A failure nobody sees is indistinguishable
   * from a button that does nothing.
   */
  error?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <Bullet n={n} done={done} active={ready} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", done && "text-ink-faint line-through")}>
          {title}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{note}</p>
        {error && (
          <p className="mt-1 text-[11px] leading-snug text-hot">{error}</p>
        )}
      </div>
      {/*
        * A button only where there is something to press.
        *
        * Every step used to carry a disabled "Run", so four buttons were on
        * screen and exactly one of them did anything — which is a puzzle, not a
        * sequence. A step that is finished says so, a step that is waiting on an
        * earlier one says nothing at all, and the single live button is the
        * answer to "what do I do now".
        */}
      {done ? (
        <span className="text-[11px] font-medium text-good">Done</span>
      ) : ready || busy ? (
        <Button size="sm" disabled={busy} onClick={onRun}>
          {busy ? <Loader2 className="animate-spin" /> : "Run"}
        </Button>
      ) : blocked ? (
        <Button size="sm" variant="outline" onClick={blocked.onRun}>
          {blocked.label}
        </Button>
      ) : null}
    </div>
  );
}

function Bullet({
  n,
  done,
  active,
}: {
  n: number;
  done: boolean;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
        done
          ? "bg-good-soft text-good"
          : active
            ? "bg-brand text-white"
            : "bg-canvas text-ink-faint",
      )}
    >
      {done ? <Check className="size-3.5" /> : n}
    </span>
  );
}
