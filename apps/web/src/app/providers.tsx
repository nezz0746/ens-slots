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
  const [queryClient] = useState(() => new QueryClient());
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
