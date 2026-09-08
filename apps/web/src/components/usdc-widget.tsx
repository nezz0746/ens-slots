"use client";

import { Coins } from "lucide-react";
import { formatUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { useTx } from "@/hooks/use-tx";
import { mockUsdcAbi } from "@/lib/abis";
import { addresses } from "@/lib/addresses";
import { IS_LOCAL } from "@/lib/chains";
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
 * `mint` on the mock is open to anyone, verified against the deployed
 * bytecode. That is what makes this a faucet rather than an admin panel.
 */
export function UsdcWidget() {
  const { address, isConnected } = useAccount();
  const { send, pending } = useTx();

  const { data: balance, refetch } = useReadContract({
    address: addresses.mockUsdc,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  if (!isConnected) return null;

  const shown = balance
    ? Number(formatUnits(balance, 6)).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
    : "0";

  return (
    <div className="flex items-center rounded-xl border border-line bg-surface">
      <span className="px-2.5 py-1 text-[11px] tabular-nums text-ink-soft">
        {shown} <span className="text-ink-faint">USDC</span>
      </span>
      {IS_LOCAL && (
        <button
          type="button"
          disabled={!!pending}
          title="Mint 100 test USDC"
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
