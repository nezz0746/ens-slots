"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useConnect,
  useSwitchChain,
} from "wagmi";

import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { DEPLOYED_CHAIN_IDS, isDeployedOn } from "@/lib/addresses";
import { chainLabel, IS_DEV, isLocal } from "@/lib/chains";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";

/**
 * Which chain the app is talking to.
 *
 * ── Why it is a control and not a label ─────────────────────────────────────
 *
 * The fork and Sepolia run the same code against the same ENS deployment, so
 * the question a deploy raises — does this actually work on a real chain — is
 * answered by looking at both. Making that a rebuild meant it was never
 * checked; making it a click means it always is.
 *
 * ── Only chains with something on them ──────────────────────────────────────
 *
 * The list is {DEPLOYED_CHAIN_IDS}, so a chain the protocol has never been
 * deployed to is not offered at all. Offering it would produce a page that
 * looks broken — every read returning nothing — for a reason the reader has no
 * way to guess.
 *
 * Nothing is shown when only one chain qualifies. Before the first Sepolia
 * deploy that is the honest state: there is no choice to make.
 *
 * ── The choice survives a reload ────────────────────────────────────────────
 *
 * wagmi keeps `chainId` in the state it persists, and the config stores that in
 * a cookie — so this is not switching a variable the next refresh forgets, and
 * the server renders the right chain on the first paint. See {config}.
 */
export function ChainSwitch() {
  const live = useChainId();
  const config = useConfig();
  const mounted = useMounted();
  /**
   * The connected chain, but not before the client has had a render.
   *
   * wagmi reports a restored connection on its very FIRST client render, so
   * reading `live` straight into the label put "Sepolia" in the server's HTML
   * and "Anvil" in the same slot on the client — a text mismatch, which fails
   * hydration for the whole tree rather than just this word.
   *
   * The pre-mount value is `config.chains[0].id` rather than a chain named
   * here, because that is precisely what `useChainId` returns with no
   * connection — which is the situation the server is always in. Anything else
   * would be a second guess at the server's answer, and would mismatch the day
   * the config's order changed.
   */
  const chainId = mounted ? live : config.chains[0].id;
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChainAsync, isPending } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);

  /**
   * Awaited, so a refusal is catchable.
   *
   * `switchChain` is fire-and-forget and drops its rejection on the floor,
   * which is how a wallet declining to add the local chain looked like the menu
   * simply not working. The async form is the one 0xSlots uses for the same
   * reason.
   *
   * ── Disconnected is its own case ────────────────────────────────────────
   *
   * `switchChainAsync` asks the CONNECTOR to move, so with nothing connected
   * there is nothing to ask and it rejects — which left the selector dead
   * exactly when it was most needed: after leaving the fork, the demo account
   * is dropped, and getting back required a connection that only the fork
   * could give you. So with no wallet attached the read chain is set directly,
   * and the fork additionally binds a demo account, which is what makes it
   * usable on arrival.
   */
  async function choose(id: (typeof DEPLOYED_CHAIN_IDS)[number]) {
    setError(null);
    try {
      if (!isConnected) {
        config.setState((state) => ({ ...state, chainId: id }));
        if (IS_DEV && isLocal(id)) {
          const demo = connectors.find((c) => c.type === "mock");
          if (demo) connect({ connector: demo, chainId: id });
        }
        return;
      }
      await switchChainAsync({ chainId: id });
    } catch (cause) {
      setError(reason(cause, id));
    }
  }

  if (DEPLOYED_CHAIN_IDS.length < 2) return null;

  return (
    <div className="relative">
      {/* Outside the menu, deliberately. Choosing closes the dropdown
          immediately while the switch is still in flight, so an error rendered
          inside it was unmounted before it could ever be read — which is what
          made a failed switch look like a menu that does nothing. */}
      {error && (
        <p className="absolute top-[calc(100%+0.375rem)] right-0 z-30 w-72 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] leading-snug text-hot shadow-lg">
          {error}
        </p>
      )}
    <Dropdown
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-brand/50 disabled:opacity-50"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isLocal(chainId) ? "bg-warn" : "bg-good",
            )}
          />
          {chainLabel(chainId)}
          <ChevronDown
            className={cn(
              "size-3 text-ink-faint transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      )}
    >
      {({ close }) => (
        <>
          {DEPLOYED_CHAIN_IDS.map((id) => (
            <MenuItem
              key={id}
              active={id === chainId}
              onClick={() => {
                void choose(id);
                close();
              }}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isLocal(id) ? "bg-warn" : "bg-good",
                )}
              />
              <span className="flex-1">{chainLabel(id)}</span>
              {id === chainId && <Check />}
            </MenuItem>
          ))}
        </>
      )}
      </Dropdown>
    </div>
  );
}

/**
 * A banner for a chain the app cannot serve.
 *
 * A wallet can be on any network it likes, including one this protocol has
 * never been deployed to. Without saying so the app draws an empty list, which
 * reads as "nobody has opened a namespace" rather than "you are on Optimism".
 */
export function WrongChainNotice() {
  const mounted = useMounted();
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  if (!mounted || !isConnected || isDeployedOn(chainId)) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-[--radius-card] border border-warn/30 bg-warn-soft px-4 py-2.5">
      <p className="text-[11px] text-warn">
        Nothing is deployed on the network your wallet is using.
      </p>
      <button
        type="button"
        onClick={() => switchChain({ chainId: DEPLOYED_CHAIN_IDS[0] })}
        className="shrink-0 text-[11px] font-medium text-warn underline underline-offset-2"
      >
        Switch to {chainLabel(DEPLOYED_CHAIN_IDS[0])}
      </button>
    </div>
  );
}

/**
 * Why a wallet would not switch, said usefully.
 *
 * The local fork is the case worth naming. A wallet has to ADD chain 31337
 * before it can select it, most decline to add an `http://127.0.0.1` endpoint
 * without the person doing it themselves, and some fail inside their own
 * network prompt rather than returning a clean rejection — which reads as the
 * app being broken unless it says otherwise.
 */
function reason(cause: unknown, id: number): string {
  const message =
    cause instanceof Error ? cause.message.split("\n")[0].trim() : "";

  if (/user rejected|denied/i.test(message)) return "You dismissed it in your wallet.";
  if (isLocal(id))
    return "Your wallet would not switch to the local chain. Add a network with RPC http://127.0.0.1:8545 and chain id 31337, or use a demo account instead.";
  return message || "Your wallet would not switch networks.";
}
