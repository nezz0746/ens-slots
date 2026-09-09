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
 * ── And a connected wallet is left alone, which is not a nicety ─────────────
 *
 * The demo account is bound only when NOTHING is signing. Binding it over a
 * wallet somebody had deliberately connected is what froze the tab on picking
 * Sepolia, and only for people with a wallet installed — which is why it
 * survived every test run without one.
 *
 * The two connections were the whole mechanism. wagmi keeps them in a list and
 * `disconnect()` drops the CURRENT one and falls back to whatever is left, so
 * dropping the demo account handed the app back to the wallet — still on the
 * fork — and wagmi's `syncConnectedChain` pulled the chain back to 31337 with
 * it. That looks local again, so a demo account is bound again; the mock
 * connector remembers the chain it was last switched to, so it comes back on
 * Sepolia; which is not local, so it is dropped again. Connect, disconnect,
 * connect, for as long as the tab has a main thread.
 *
 * The latch below cannot catch that. It remembers one state, and this
 * oscillates between two. What ends it is that the fork branch now acts only
 * when `signer` is "none": every connect makes it inert, so it cannot be the
 * other half of a cycle.
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
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const local = isLocal(chainId);
  const signer = connector?.type ?? "none";

  const api = useRef({ connect, connectors, disconnect });
  api.current = { connect, connectors, disconnect };

  const acted = useRef<string | null>(null);

  useEffect(() => {
    if (!IS_DEV) return;

    const state = `${local}:${signer}`;
    if (acted.current === state) return;
    acted.current = state;

    const wagmi = api.current;

    if (local) {
      // Anything already signing is left as it is — a demo account, so picking
      // Bob and coming back does not snap to Deployer, and a real wallet,
      // because binding a second signer over it is what hung the tab.
      if (signer !== "none") return;
      const demo = wagmi.connectors.find((c) => c.type === "mock");
      // `chainId` explicitly: the mock connector remembers whichever chain it
      // was last switched to, so a demo account that has been to Sepolia comes
      // back on Sepolia — which had picking Anvil land you on Sepolia, signed
      // out. Naming the chain here is what makes the connection agree with the
      // menu that asked for it.
      if (demo) wagmi.connect({ connector: demo, chainId });
      return;
    }

    if (signer === "mock") wagmi.disconnect();
  }, [chainId, local, signer]);
}
