"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider, type State } from "wagmi";

import { useChainSigner } from "@/hooks/use-chain-signer";
import { config } from "@/lib/wagmi";

/**
 * @param initialState What the server read out of the request's cookie. Handing
 *        it to {WagmiProvider} is what lets the first paint already show the
 *        connected account and the chosen chain, instead of rendering the
 *        disconnected state and correcting itself once the client hydrates.
 */
export function Providers({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: State;
}) {
  /**
   * Nothing is ever served from cache. Every read goes to the chain.
   *
   * ── Why ─────────────────────────────────────────────────────────────────
   *
   * This app is demonstrated live, in front of people, with a chain being
   * changed from another window while the page is open — a second account
   * buying a slot, an anvil time-warp, a wallet being funded. React Query's
   * defaults are tuned for a server whose data is expensive and slow-moving,
   * and every one of them is wrong here: a stale figure on screen during a
   * demo is not a saved request, it is the app appearing broken.
   *
   * `staleTime: 0` is already the default; it is written down because the
   * others only make sense beside it.
   *
   * `refetchIntervalInBackground` is the one that actually bit. Every polling
   * query in this app silently STOPS while the tab is hidden, which is most of
   * a demo — you fund an account in MetaMask, come back, and the header still
   * says the account has no gas. Measured before changing it: balance altered
   * on chain, tab hidden, twenty-six seconds, zero refetches.
   *
   * `"always"` rather than `true` on the three refetch triggers: `true` honours
   * `staleTime` and would do nothing if a `staleTime` were ever reintroduced
   * on a single query. `"always"` cannot be opted out of by accident.
   */
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0,
            refetchOnMount: "always",
            refetchOnWindowFocus: "always",
            refetchOnReconnect: "always",
            refetchIntervalInBackground: true,
          },
        },
      }),
  );
  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <ChainSigner />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/** Renders nothing; keeps the signer and the chain in agreement. */
function ChainSigner() {
  useChainSigner();
  return null;
}
