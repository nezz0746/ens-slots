import { defineChain } from "viem";
import { anvil, sepolia } from "viem/chains";

import deployments from "./deployments.json";

/**
 * The chains this build can talk to — both of them, at once.
 *
 * ── Why both, rather than one chosen at build time ──────────────────────────
 *
 * A deploy is the thing most worth checking against a real chain, and the app
 * IS the check: whether names resolve, whether a buy goes through, whether the
 * records a client reads are the ones that were written. Picking the chain at
 * build time meant the local build could never see Sepolia, so the only way to
 * look at a deploy was to rebuild pointing at it — at which point the fork you
 * were developing against was gone.
 *
 * So both are live and the connected wallet decides. Addresses come from
 * {addressesFor}, keyed by the same chain id, which is why moving between them
 * is a switch rather than a rebuild.
 *
 * ── The Universal Resolver override, on both ────────────────────────────────
 *
 * viem ships the standard ENSv2 Beta resolver for Sepolia — a different
 * deployment living on the same chain. Left alone, a client asks a namespace
 * this app has never written to and is told, correctly as far as it knows, that
 * the name does not resolve.
 *
 * The fork inherits the same trap: spreading `sepolia` carries viem's built-in
 * address along, and forking means that address HAS code, so the call succeeds
 * and answers about the wrong deployment. A silent wrong answer, not an error.
 */
const ensContracts = {
  ...sepolia.contracts,
  ensUniversalResolver: {
    address: deployments.shared.ensUniversalResolver as `0x${string}`,
  },
} as const;

export const LOCAL_CHAIN_ID = 31337;
export const SEPOLIA_CHAIN_ID = 11155111;

/**
 * Sepolia, forked, with local time and money.
 *
 * Half of what this app touches is somebody else's deployed code — ENSv2's
 * verifiable factory and registry implementation, the 0xSlots factory. A local
 * chain with mocks in their place would let the app be developed against
 * interfaces that are merely what we believed, and the ENS docs already
 * disagreed with the deployment once.
 *
 * ── Built on viem's `anvil`, NOT on `sepolia` ───────────────────────────────
 *
 * It used to spread `sepolia` and override the id, which quietly described
 * chain 31337 as having Sepolia's Etherscan for a block explorer and "Sepolia
 * Ether" for a currency. That is only cosmetic until a real wallet is asked to
 * ADD the chain: wagmi hands MetaMask `chainName`, `rpcUrls`, `nativeCurrency`
 * and `blockExplorerUrls` together, and a mainnet-shaped explorer URL attached
 * to a localhost RPC is a combination it does not expect. The failure surfaced
 * inside the extension's own network prompt rather than as a rejected request.
 *
 * `anvil` carries what is true of a local node — id 31337, plain Ether, no
 * explorer at all — which is the same base 0xSlots builds its local chain from.
 * Only the ENS contracts are added, and those never leave this app.
 */
export const anvilFork = defineChain({
  ...anvil,
  contracts: ensContracts,
  testnet: true,
});

/** Sepolia proper, with the same override. */
export const hackathonSepolia = defineChain({
  ...sepolia,
  name: "Sepolia",
  contracts: ensContracts,
});

/**
 * Anvil exists in development and nowhere else.
 *
 * A deployed build offering it would be offering `http://127.0.0.1:8545` to
 * people whose machines are not running one — every read failing, for a reason
 * the page cannot explain.
 *
 * `NODE_ENV` is substituted at build time, so in production {CHAINS} holds only
 * Sepolia, the wagmi config is created with only Sepolia, {DEPLOYED_CHAIN_IDS}
 * filters the fork out of the switcher, and the demo accounts are never
 * registered as connectors. The definitions themselves still ship — they are
 * ordinary exports and nothing here is a dynamic import — so this makes the
 * fork unreachable rather than absent. Nothing secret is in them: anvil's
 * accounts appear as addresses, never keys.
 */
export const IS_DEV = process.env.NODE_ENV === "development";

export const CHAINS = IS_DEV
  ? ([anvilFork, hackathonSepolia] as const)
  : ([hackathonSepolia] as const);

/** Whether this build can talk to a chain at all. */
export const isAvailable = (chainId?: number) =>
  CHAINS.some((chain) => chain.id === chainId);

export const isLocal = (chainId?: number) => chainId === LOCAL_CHAIN_ID;

/** What to call a chain in the UI, without repeating viem's longer names. */
export const chainLabel = (chainId?: number) =>
  chainId === LOCAL_CHAIN_ID
    ? "Anvil"
    : chainId === SEPOLIA_CHAIN_ID
      ? "Sepolia"
      : "Unknown";
