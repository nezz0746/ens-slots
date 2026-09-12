"use client";

import { useEffect, useRef } from "react";
import { useAccount, useChainId, useConnect, useDisconnect } from "wagmi";

import { IS_DEV, isLocal } from "@/lib/chains";

/**
 * Binds the signer to the chain, so the two stop disagreeing.
 *
 * ── The problem this exists to remove ───────────────────────────────────────
 *
 * The chain and the wallet were independent controls, and nothing reconciled
 * them. Connect a real wallet once and its id is remembered, so wagmi
 * reconnects it on EVERY later visit regardless of chain — including the local
 * fork, where MetaMask cannot reach `127.0.0.1:8545` unless somebody added that
 * network by hand. Every local action then went out for a signature to a wallet
 * that had no business signing it, and prompted to add a localhost network
 * along the way. anvil's own accounts, which are the ones that work there, sat
 * unused behind an icon.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * On the fork, a demo account signs — picked for you on arrival, and swapped in
 * the dev panel. Off the fork, a demo account is disconnected the moment you
 * leave, because nobody holds those keys on a real chain and a transaction
 * signed by one would simply fail.
 *
 * A real wallet is never connected on your behalf; that stays a deliberate act.
 * This only ever attaches keys that are public by design, and only to the chain
 * that was started with them.
 *
 * ── One connection at a time, which is not a detail ─────────────────────────
 *
 * On the fork a demo account REPLACES whatever was signing; it never joins it.
 * That invariant is the whole reason this is safe, and it was arrived at by
 * breaking it twice.
 *
 * Binding a demo account OVER a connected wallet leaves wagmi holding two
 * connections, and `disconnect()` drops the current one and falls back to
 * whatever is left. So leaving the fork dropped the demo account, landed back
 * on the wallet still sitting on 31337, and `syncConnectedChain` dragged the
 * chain along with it: that looks local again, so a demo account is bound
 * again, and round it goes. With the mock connector also remembering the chain
 * it was last switched to, the cycle never closed and the tab locked — and
 * only for people with a wallet installed, which is why it survived every test
 * run without one. Naming the chain on connect stopped the hang, but the two
 * connections were still there, and the same fallback then made picking
 * Sepolia bounce silently back to Anvil.
 *
 * Refusing to bind over a wallet at all fixed both, and broke local
 * development instead: with a wallet connected, nothing ever bound a demo
 * account, so picking Anvil asked MetaMask to switch to `127.0.0.1:8545`.
 *
 * Replacing is what satisfies all three. There is no second connection to fall
 * back to, and after the connect the signer is "mock", so the fork branch is
 * inert and cannot be the other half of a cycle.
 *
 * ── Why the dependencies are primitives, and why it latches ─────────────────
 *
 * Both are load-bearing, and getting them wrong hung the page.
 *
 * `connect`, `disconnect` and `connectors` are given fresh identities on
 * renders that changed nothing of substance — discovery alone rebuilds the
 * connector array. An effect listing them re-ran constantly, and since it calls
 * `connect`, each run caused the render that caused the next: a loop with a
 * wallet connection inside it, which is what made switching chains lock the
 * tab. So the effect depends on two primitives and reads the rest from a ref.
 *
 * The latch is the second half. Keyed on "which chain, which kind of signer",
 * it acts once per distinct state, so a `connect` that fails cannot be retried
 * forever — it simply leaves the signer unbound, which the header shows plainly
 * and one click fixes.
 */
export function useChainSigner() {
  const chainId = useChainId();
  const { connector } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();

  const local = isLocal(chainId);
  const signer = connector?.type ?? "none";

  const api = useRef({ connectAsync, connectors, disconnectAsync });
  api.current = { connectAsync, connectors, disconnectAsync };

  const acted = useRef<string | null>(null);

  useEffect(() => {
    if (!IS_DEV) return;

    const state = `${local}:${signer}`;
    if (acted.current === state) return;
    acted.current = state;

    const wagmi = api.current;

    void (async () => {
      if (local) {
        // Already a demo account: leave the choice alone, so picking Bob and
        // coming back does not snap to Deployer.
        if (signer === "mock") return;
        const demo = wagmi.connectors.find((c) => c.type === "mock");
        if (!demo) return;

        /**
         * A demo account REPLACES a wallet here; it never joins one.
         *
         * Awaited and in this order, both load-bearing. Binding a demo over a
         * connected wallet leaves wagmi holding two connections, and
         * `disconnect()` drops the current one and falls back to whatever is
         * left — so later, leaving the fork dropped the demo account, landed
         * back on the wallet still sitting on 31337, and dragged the chain
         * with it. Picking Sepolia silently returned you to Anvil.
         *
         * One connection at a time has no fallback to be dragged by, which is
         * also what keeps this from oscillating: after the connect below the
         * signer is "mock" and this branch is inert.
         */
        if (signer !== "none") await wagmi.disconnectAsync();

        // `chainId` explicitly: the mock connector remembers whichever chain it
        // was last switched to, so a demo account that has been to Sepolia
        // comes back on Sepolia — which had picking Anvil land you on Sepolia,
        // signed out. Naming the chain makes the connection agree with the menu
        // that asked for it.
        await wagmi.connectAsync({ connector: demo, chainId }).catch(() => {});
        return;
      }

      // Off the fork a demo account cannot sign for anybody: nobody holds
      // anvil's keys on a real chain.
      if (signer === "mock") await wagmi.disconnectAsync().catch(() => {});
    })();
  }, [chainId, local, signer]);
}
