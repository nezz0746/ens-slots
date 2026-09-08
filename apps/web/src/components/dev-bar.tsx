"use client";

import { Clock } from "lucide-react";
import { useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";
import { IS_LOCAL } from "@/lib/chains";
import { formatAmount, shortAddress } from "@/lib/format";
import { DEV_ACCOUNTS } from "@/lib/wagmi";
import { cn } from "@/lib/utils";

/**
 * Act as somebody, and move time.
 *
 * Carried over from 0xSlots. Both controls exist because this protocol's
 * interesting moments are between two people and across time: a buyout needs
 * someone to buy from, and a liquidation needs a deposit to run out. Without
 * these, demonstrating either means two browser profiles and a long wait.
 *
 * Local only. `IS_LOCAL` is decided by the deployment file, so a build
 * pointed at Sepolia drops the whole thing rather than shipping a time
 * traveller that silently does nothing.
 */
export function DevBar() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  if (!IS_LOCAL) return <RealConnect />;

  return (
    <div className="flex items-center gap-2">
      <TimeWarp />

      <div className="flex items-center rounded-xl border border-line bg-surface p-0.5">
        {DEV_ACCOUNTS.map((account, i) => {
          const active =
            isConnected &&
            address?.toLowerCase() === account.address.toLowerCase();
          return (
            <button
              key={account.address}
              type="button"
              onClick={() => {
                disconnect();
                connect({ connector: connectors[i] });
              }}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-brand text-white"
                  : "text-ink-soft hover:bg-canvas",
              )}
            >
              {account.name}
            </button>
          );
        })}
      </div>

      {isConnected && (
        <span className="hidden text-[11px] tabular-nums text-ink-faint sm:inline">
          {balance ? formatAmount(balance.value) : shortAddress(address)}
        </span>
      )}
    </div>
  );
}

/**
 * Push the chain forward.
 *
 * Straight to anvil rather than through wagmi: `evm_increaseTime` is not an
 * RPC any wallet exposes, and there is nothing to sign.
 */
function TimeWarp() {
  const [busy, setBusy] = useState(false);

  async function warp(seconds: number) {
    setBusy(true);
    try {
      await fetch("http://127.0.0.1:8545", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "evm_increaseTime",
          params: [seconds],
        }),
      });
      await fetch("http://127.0.0.1:8545", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "evm_mine",
          params: [],
        }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hidden items-center gap-1 rounded-xl border border-line bg-surface px-2 py-1 md:flex">
      <Clock className="size-3 text-ink-faint" />
      {[
        { label: "1d", s: 86_400 },
        { label: "7d", s: 604_800 },
        { label: "30d", s: 2_592_000 },
      ].map((t) => (
        <button
          key={t.label}
          type="button"
          disabled={busy}
          onClick={() => warp(t.s)}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink disabled:opacity-40"
        >
          +{t.label}
        </button>
      ))}
    </div>
  );
}

function RealConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected)
    return (
      <Button variant="outline" size="sm" onClick={() => disconnect()}>
        {shortAddress(address)}
      </Button>
    );

  return (
    <Button
      size="sm"
      disabled={!connectors[0]}
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
    >
      Connect
    </Button>
  );
}
