import { defineChain } from "viem";
import { sepolia } from "viem/chains";

import deployment from "./deployment.json";

/**
 * The chain this build talks to.
 *
 * ── Why the fork is the default ─────────────────────────────────────────────
 *
 * Half of what this app touches is somebody else's deployed code — ENSv2's
 * verifiable factory and registry implementation, the 0xSlots factory. A local
 * chain with mocks in their place would let the app be developed against
 * interfaces that are merely what we believed, and the ENS docs already
 * disagreed with the deployment once. Forking Sepolia keeps the real contracts
 * and makes only time, accounts and money local.
 *
 * The addresses are identical either way, which is the point: moving to
 * Sepolia proper is a chain id, not a rewrite.
 */
/**
 * The hackathon Universal Resolver, as a chain override.
 *
 * Applied to BOTH chains below, and that is the whole point of hoisting it.
 * viem ships the standard ENSv2 Beta resolver for Sepolia, which is a
 * different deployment living on the same chain — so a client left alone asks
 * a namespace this app has never written to and is told, correctly as far as
 * it knows, that the name does not resolve.
 *
 * The fork inherits the same trap: spreading `sepolia` carries viem's built-in
 * address along with it, and forking means that address HAS code, so the call
 * succeeds and answers about the wrong deployment. A silent wrong answer, not
 * an error.
 */
const ensContracts = {
  ...sepolia.contracts,
  ensUniversalResolver: {
    address: deployment.ensUniversalResolver as `0x${string}`,
  },
} as const;

export const anvilFork = defineChain({
  ...sepolia,
  id: 31337,
  name: "Sepolia fork",
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  contracts: ensContracts,
  testnet: true,
});

export const IS_LOCAL = deployment.chainId === 31337;

/** Sepolia proper, with the same override. */
export const hackathonSepolia = defineChain({
  ...sepolia,
  contracts: ensContracts,
});

export const activeChain = IS_LOCAL ? anvilFork : hackathonSepolia;
