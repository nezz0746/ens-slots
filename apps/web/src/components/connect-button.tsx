"use client";

import { Check, Copy, LogOut, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Connector } from "wagmi";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The wallet: a picker when disconnected, an account menu when not.
 *
 * ── Why a dialog rather than one overloaded button ──────────────────────────
 *
 * The button used to be the whole feature — it decided which wallet, connected
 * it, reported the failure and offered an install link, all in one place two
 * lines wide. Every one of those is a different thing to say, and the header
 * had room for none of them, so the failure ended up rendered nowhere: clicking
 * did nothing and said nothing. A dialog has room to list what is actually
 * installed and to put the reason next to the thing that failed.
 *
 * ── Which connectors are offered ────────────────────────────────────────────
 *
 * Whatever announced itself. MetaMask is declared in the config, and EIP-6963
 * discovery adds every other injected wallet the browser knows about at
 * runtime, so this list is the honest set rather than one we hardcoded. Each is
 * asked for a provider before being shown: a DECLARED connector exists because
 * the config asked for it, not because a wallet is installed, and trusting that
 * is what previously produced a Connect button in a browser with no wallet.
 */
function useAvailableConnectors() {
  const { connectors } = useConnect();
  const [available, setAvailable] = useState<Connector[] | undefined>();

  /**
   * Keyed on the connectors' ids, not on the array.
   *
   * ── The loop this replaces ──────────────────────────────────────────────
   *
   * The effect used to depend on `connectors` itself and always finish by
   * setting a NEW array. EIP-6963 discovery hands back a fresh array on
   * renders that found nothing new, so: set state → re-render → new array
   * identity → effect again → set state. An infinite render loop, and one that
   * only runs when a wallet is actually installed — with no extension present
   * discovery never fires, the array stays referentially stable, and it settles
   * after one pass. That is why it locked the tab for everyone with MetaMask
   * and for nobody testing without one.
   *
   * A string of ids is stable across those renders, and the result is compared
   * before being stored so an unchanged answer cannot start another round.
   */
  const key = connectors.map((c) => c.uid).join(",");
  const latest = useRef(connectors);
  latest.current = connectors;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found: Connector[] = [];
      const seen = new Set<string>();
      for (const c of latest.current) {
        // The fork's demo accounts are bound automatically by {useChainSigner}
        // and switched in the dev panel. They are not wallets to pick from.
        if (c.type === "mock") continue;
        const provider = await c.getProvider().catch(() => null);
        if (!provider) continue;
        // Discovery and the declared connector can both describe one wallet.
        const name = c.name.toLowerCase();
        if (seen.has(name)) continue;
        seen.add(name);
        found.push(c);
      }
      if (cancelled) return;
      setAvailable((previous) => {
        const same =
          previous !== undefined &&
          previous.length === found.length &&
          previous.every((c, i) => c.uid === found[i].uid);
        return same ? previous : found;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return available;
}

export function ConnectButton() {
  const { address, isConnected, connector: active } = useAccount();
  const { connect, isPending, error, reset, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const available = useAvailableConnectors();
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);

  // Close the picker once a connection lands, so the dialog does not sit open
  // over a header that already says the account.
  useEffect(() => {
    if (isConnected) setPicking(false);
  }, [isConnected]);

  if (isConnected)
    return (
      <Dropdown
        trigger={({ toggle }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={toggle}
            title={active?.name ? `Connected with ${active.name}` : undefined}
          >
            <Wallet />
            {shortAddress(address)}
          </Button>
        )}
      >
        {({ close }) => (
          <>
            <MenuItem
              onClick={() => {
                if (address) navigator.clipboard?.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
                close();
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy address"}
            </MenuItem>
            <MenuItem
              tone="danger"
              onClick={() => {
                disconnect();
                close();
              }}
            >
              <LogOut />
              Disconnect
            </MenuItem>
          </>
        )}
      </Dropdown>
    );

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          reset();
          setPicking(true);
        }}
      >
        <Wallet />
        Connect
      </Button>

      <Dialog
        open={picking}
        onClose={() => setPicking(false)}
        title="Connect a wallet"
        description="Everything here is a testnet. Nothing costs real money."
      >
        {available === undefined ? (
          <p className="py-6 text-center text-xs text-ink-faint">
            Looking for wallets…
          </p>
        ) : available.length === 0 ? (
          <div className="space-y-3 py-2 text-center">
            <p className="text-xs text-ink-soft">
              No wallet found in this browser.
            </p>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-block text-[11px] text-brand underline underline-offset-2"
            >
              Install MetaMask
            </a>
          </div>
        ) : (
          <div className="space-y-1.5">
            {available.map((c) => {
              const busy = isPending && variables?.connector === c;
              return (
                <button
                  key={c.uid}
                  type="button"
                  disabled={isPending}
                  onClick={() => connect({ connector: c })}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors",
                    "hover:border-brand/50 hover:bg-canvas disabled:opacity-50",
                  )}
                >
                  <WalletIcon connector={c} />
                  <span className="flex-1 text-sm font-medium">{c.name}</span>
                  {busy && (
                    <span className="text-[11px] text-ink-faint">
                      Check your wallet…
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* The reason, beside the thing that failed. `useConnect` reports a
            refusal or a missing provider here and nowhere else. */}
        {error && (
          <p className="mt-3 text-[11px] text-hot">
            {/user rejected|denied/i.test(error.message)
              ? "You dismissed it in your wallet."
              : error.message.split("\n")[0]}
          </p>
        )}
      </Dialog>
    </>
  );
}

/** The wallet's own icon where discovery supplied one, a glyph where it did not. */
function WalletIcon({ connector }: { connector: Connector }) {
  const box = "size-7 shrink-0 rounded-lg";
  if (!connector.icon)
    return (
      <span className={cn(box, "grid place-items-center bg-canvas text-ink-faint")}>
        <Wallet className="size-3.5" />
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={connector.icon} alt="" className={cn(box, "object-contain")} />
  );
}
