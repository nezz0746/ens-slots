"use client";

import { createConfig, http } from "wagmi";
import { mock } from "wagmi/connectors";
import { injected } from "wagmi/connectors";

import { activeChain, IS_LOCAL } from "./chains";

/**
 * anvil's default accounts, as click-to-connect identities.
 *
 * Carried over from 0xSlots, where the same three names made every
 * multi-party flow demonstrable without three browser profiles and three
 * seed phrases. Buying a slot from someone needs a someone.
 *
 * The mock connector answers with `config.chains[0]`, so the fork has to be
 * first in the list — otherwise every write is prepared for the wrong chain
 * and fails on send with a chain-mismatch nobody can read.
 */
export const DEV_ACCOUNTS = [
  { name: "Deployer", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
  { name: "Alice", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
  { name: "Bob", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
  { name: "Carol", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
] as const;

export const config = createConfig({
  chains: [activeChain] as const,
  connectors: IS_LOCAL
    ? DEV_ACCOUNTS.map((a) =>
        mock({ accounts: [a.address as `0x${string}`] }),
      )
    : [injected()],
  transports: { [activeChain.id]: http() } as Record<number, ReturnType<typeof http>>,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
