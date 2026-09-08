"use client";

import { Check, Clock, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { useTx } from "@/hooks/use-tx";
import { ethRegistrarAbi, mockUsdcAbi } from "@/lib/abis";
import { addresses } from "@/lib/addresses";
import { IS_LOCAL } from "@/lib/chains";
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
 */
export function AcquireName({
  label,
  onOwned,
}: {
  label: string;
  onOwned: () => void;
}) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { send, pending, error } = useTx();

  const [secret, setSecret] = useState<`0x${string}` | null>(null);
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
  const wait = Number(minAge ?? 60n);
  const elapsed = committedAt ? now - committedAt : 0;
  const ready = committedAt !== null && elapsed >= wait;

  async function commit() {
    if (!address || !secret || !client) return;
    const hash = await client.readContract({
      address: addresses.ensEthRegistrar,
      abi: ethRegistrarAbi,
      functionName: "makeCommitment",
      args: [label, address, secret, ZERO, ZERO, YEAR, ZERO32],
    });
    const r = await send("commit", {
      address: addresses.ensEthRegistrar,
      abi: ethRegistrarAbi,
      functionName: "commit",
      args: [hash],
    });
    if (r) setCommittedAt(Math.floor(Date.now() / 1000));
  }

  async function register() {
    if (!address || !secret) return;
    const r = await send("register", {
      address: addresses.ensEthRegistrar,
      abi: ethRegistrarAbi,
      functionName: "register",
      args: [
        label,
        address,
        secret,
        ZERO,
        ZERO,
        YEAR,
        addresses.mockUsdc,
        ZERO32,
      ],
    });
    if (r) {
      setRegistered(true);
      recheck();
      onOwned();
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

      <Step
        n={1}
        title="Approve the registrar"
        note={
          funded
            ? "It pulls the fee from you when you register."
            : "You do not hold enough — mint some from the header."
        }
        done={approved}
        ready={!!address && funded && !approved}
        busy={pending === "approve"}
        onRun={async () => {
          await send("approve", {
            address: addresses.mockUsdc,
            abi: mockUsdcAbi,
            functionName: "approve",
            args: [addresses.ensEthRegistrar, total],
          });
          recheckAllowance();
        }}
      />

      <Step
        n={2}
        title="Commit"
        note="A hash of what you intend, so nobody can front-run the reveal."
        done={committedAt !== null}
        ready={approved && committedAt === null}
        busy={pending === "commit"}
        onRun={commit}
      />

      <div className="flex items-center gap-3 px-5 py-3.5">
        <Bullet n={3} done={ready} active={committedAt !== null && !ready} />
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
        {IS_LOCAL && committedAt !== null && !ready && (
          <Button size="sm" variant="outline" onClick={skipAhead}>
            <Clock />
            Skip
          </Button>
        )}
      </div>

      <Step
        n={4}
        title="Register"
        note="Reveals the commitment and mints the name to you."
        done={registered}
        ready={ready && !registered}
        busy={pending === "register"}
        onRun={register}
      />

      {error && (
        <p className="px-5 py-3 text-xs text-hot">{error}</p>
      )}
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
}: {
  n: number;
  title: string;
  note: string;
  done: boolean;
  ready: boolean;
  busy: boolean;
  onRun: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <Bullet n={n} done={done} active={ready} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", done && "text-ink-faint line-through")}>
          {title}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{note}</p>
      </div>
      <Button
        size="sm"
        variant={ready ? "primary" : "outline"}
        disabled={!ready || busy}
        onClick={onRun}
      >
        {busy ? <Loader2 className="animate-spin" /> : done ? "Done" : "Run"}
      </Button>
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
