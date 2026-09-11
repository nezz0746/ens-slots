"use client";

import { Coins } from "lucide-react";
import { formatUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { useTx } from "@/hooks/use-tx";
import { mockUsdcAbi } from "@/lib/abis";
import { useAddresses, useIsDeployed } from "@/hooks/use-addresses";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";

const HUNDRED = 100_000_000n; // 100 USDC, six decimals

/**
 * What you hold, and a tap to hold more.
 *
 * ENS names on this deployment are paid for in MockUSDC, not ether — which is
 * the single most surprising thing about the register flow, so the balance
 * lives in the header rather than inside the form. Someone who has never seen
 * the token before finds out they have none of it before they start, not four
 * steps in.
 *
 * ── The faucet is not local-only ────────────────────────────────────────────
 *
 * `mint` is open to anyone on this token — no owner, no minter role — and that
 * is as true of the live Sepolia deployment as of the fork, because the fork
 * inherits the same contract at the same address. Simulated from an unrelated
 * account against live Sepolia to check, rather than assumed from the fork's
 * behaviour.
 *
 * Gating it on the local chain was therefore a mistake with a real cost: on
 * Sepolia a person needs MockUSDC to register a name and to hold a space, the
 * token is not one any public faucet hands out, and the button that mints it
 * was hidden on exactly the chain where it is hard to come by.
 *
 * What it IS gated on is having a deployment: on an unknown chain the address
 * is zero and the button would send a transaction to nowhere.
 */
export function UsdcWidget() {
  const { address, isConnected } = useAccount();
  const mounted = useMounted();
  const addresses = useAddresses();
  const deployed = useIsDeployed();
  const { send, pending, error } = useTx();

  const { data: balance, refetch } = useReadContract({
    address: addresses.mockUsdc,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  // `mounted` and not just `isConnected`: the server has no wallet and renders
  // nothing here, so a client that already knows it is connected on its very
  // first render would hydrate a subtree the server never sent. See {useMounted}.
  if (!mounted || !isConnected) return null;

  const shown = balance
    ? Number(formatUnits(balance, 6)).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
    : "0";

  return (
    <div className="relative flex items-center rounded-xl border border-line bg-surface">
      {/* Under the control, because a faucet that quietly fails is
          indistinguishable from one that is not wired up. */}
      {error && (
        <p className="absolute top-[calc(100%+0.375rem)] right-0 z-30 w-64 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] leading-snug text-hot shadow-lg">
          {error}
        </p>
      )}
      <span className="px-2.5 py-1 text-[11px] tabular-nums text-ink-soft">
        {shown} <span className="text-ink-faint">USDC</span>
      </span>
      {deployed && (
        <button
          type="button"
          disabled={!!pending}
          title="Mint 100 test USDC — anyone can, on either chain"
          onClick={async () => {
            if (!address) return;
            await send("mint", {
              address: addresses.mockUsdc,
              abi: mockUsdcAbi,
              functionName: "mint",
              args: [address, HUNDRED],
            });
            refetch();
          }}
          className={cn(
            "flex h-full items-center gap-1 rounded-r-xl border-l border-line px-2 py-1 text-[11px] font-medium text-brand transition-colors hover:bg-brand-soft disabled:opacity-40",
          )}
        >
          <Coins className="size-3" />
          {pending === "mint" ? "…" : "+100"}
        </button>
      )}
    </div>
  );
}
