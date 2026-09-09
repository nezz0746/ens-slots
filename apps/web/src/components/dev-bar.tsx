"use client";

import { Clock, FlaskConical, X } from "lucide-react";
import { useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";

import { useIsLocal } from "@/hooks/use-addresses";
import { formatAmount, shortAddress } from "@/lib/format";
import { IS_DEV } from "@/lib/chains";
import { DEV_ACCOUNTS } from "@/lib/wagmi";
import { cn } from "@/lib/utils";

/**
 * Act as somebody, and move time.
 *
 * Both controls exist because this protocol's interesting moments are between
 * two people and across time: a buyout needs someone to buy from, and a
 * liquidation needs a deposit to run out. Without these, demonstrating either
 * means two browser profiles and a long wait.
 *
 * ── Why it floats instead of sitting in the navbar ──────────────────────────
 *
 * It is scaffolding, not product. In the navbar it took more room than
 * everything real put together and was the first thing in any screenshot, and —
 * worse — it sat where the wallet button belongs and crowded it out entirely.
 * Down here it is one icon until asked for, and the header is the app again.
 *
 * ── Only where it can work ──────────────────────────────────────────────────
 *
 * `IS_DEV` is substituted at build time, so a deployed build carries no toggle.
 * `isLocal` is the connected chain, so switching to Sepolia hides it in the
 * same render: these accounts hold no keys there and no real node answers
 * `evm_increaseTime`.
 */
export function DevTools() {
  const [open, setOpen] = useState(false);
  const isLocal = useIsLocal();

  if (!IS_DEV || !isLocal) return null;

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="w-[17rem] space-y-3 rounded-[--radius-card] border border-line bg-surface p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold tracking-wide text-ink-faint uppercase">
              Local chain
            </p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="text-ink-faint transition-colors hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <TimeWarp />
          <Accounts />
        </div>
      )}

      <button
        type="button"
        aria-label={open ? "Hide local chain tools" : "Local chain tools"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "grid size-9 place-items-center rounded-full border border-line shadow-sm transition-colors",
          open
            ? "bg-brand text-white"
            : "bg-surface text-ink-faint hover:text-brand",
        )}
      >
        <FlaskConical className="size-4" />
      </button>
    </div>
  );
}

function Accounts() {

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-canvas p-0.5">
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
        <p className="flex items-center justify-between text-[11px] text-ink-faint">
          <span className="font-mono">{shortAddress(address)}</span>
          {balance && (
            <span className="tabular-nums">
              {formatAmount(balance.value, 18, "ETH")}
            </span>
          )}
        </p>
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
    <div className="flex items-center gap-1 rounded-xl border border-line bg-canvas px-2 py-1">
      <Clock className="size-3 shrink-0 text-ink-faint" />
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
          className="flex-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
        >
          +{t.label}
        </button>
      ))}
    </div>
  );
}
