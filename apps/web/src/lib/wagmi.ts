import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { injected, mock } from "wagmi/connectors";

import { anvilFork, hackathonSepolia, IS_DEV } from "./chains";

/**
 * anvil's default accounts, as click-to-connect identities.
 *
 * Carried over from 0xSlots, where the same names made every multi-party flow
 * demonstrable without three browser profiles and three seed phrases. Buying a
 * space from someone needs a someone.
 *
 * Development only, like the fork they belong to — these are published private
 * keys, and a deployed build must not offer them as a way to sign anything.
 */
export const DEV_ACCOUNTS = [
  { name: "Deployer", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
  { name: "Alice", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
  { name: "Bob", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
  { name: "Carol", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
] as const;

/**
 * Both chains, in one config.
 *
 * ── The fork stays first ────────────────────────────────────────────────────
 *
 * The mock connectors answer with `config.chains[0]`, so the fork has to lead
 * the list — otherwise the demo accounts prepare every write for Sepolia and it
 * fails on send with a chain mismatch nobody can read. A real wallet is
 * unaffected: `injected` reports whichever chain it is actually on.
 *
 * The demo accounts are offered on both chains rather than filtered here, and
 * that is deliberate — `wagmi` decides connectors once, at config time, while
 * the chain changes at runtime. {DevBar} hides them when the connected chain is
 * not the fork, which is the check that can actually see the current answer.
 */
/**
 * MetaMask, and in development the demo accounts alongside it.
 *
 * `injected({ target })` rather than wagmi's `metaMask()` connector: the latter
 * pulls in the MetaMask SDK and its own modal for a case this app does not have
 * — mobile deep-linking — while the target form talks to the extension that is
 * already in the page and adds no dependency.
 *
 * The mock connectors lead the list because they answer with `chains[0]`, so
 * the fork has to be first for their writes to be prepared for the right chain.
 * That ordering is also why {ConnectButton} never takes `connectors[0]`: index
 * zero is a demo account, and connecting it on Sepolia would sign as somebody
 * whose key is published in anvil's startup banner.
 *
 * This declares MetaMask; it does not prove one is installed. Discovery
 * (EIP-6963, on by default) may also add MetaMask under `io.metamask` at
 * runtime. {ConnectButton} asks each candidate for a provider rather than
 * trusting either to exist.
 */
export const metaMask = injected({ target: "metaMask" });

/**
 * Anything else that put itself in the page.
 *
 * ── What this adds, given discovery is already on ───────────────────────────
 *
 * `multiInjectedProviderDiscovery` defaults to true and is not overridden, so
 * every wallet that announces itself over EIP-6963 — Rabby, Coinbase, Brave,
 * Frame, Zerion — is already added at runtime and already listed. This is not
 * for those.
 *
 * It is for the wallet that only sets `window.ethereum` and announces nothing:
 * older extensions, and the in-app browsers that wrap one. Discovery never
 * sees them, and `target: "metaMask"` rejects them, so before this they were
 * installed, working, and offered no way in.
 *
 * LAST in the list on purpose. A wallet that announces AND occupies
 * `window.ethereum` is found twice, and {ConnectButton} keeps the first of any
 * duplicate — which should be the one that told us its name and icon, not the
 * anonymous one.
 */
export const anyInjected = injected({ shimDisconnect: true });

export const config = createConfig({
  chains: IS_DEV ? [anvilFork, hackathonSepolia] : [hackathonSepolia],
  connectors: IS_DEV
    ? [
        ...DEV_ACCOUNTS.map((a) =>
          mock({ accounts: [a.address as `0x${string}`] }),
        ),
        metaMask,
        anyInjected,
      ]
    : [metaMask, anyInjected],
  /**
   * Reads issued in the same tick go out as one `aggregate3`.
   *
   * It matters here more than it usually would. The subname list asks
   * `getEnsText` for every name it shows, and each of those is a call through
   * the Universal Resolver — so a namespace with eight labels is eight round
   * trips without this, in series behind React Query, and one with it.
   */
  transports: {
    // The fork is reached directly: it is on this machine, there is no key to
    // protect, and a proxy would only add a hop.
    [anvilFork.id]: http(undefined, { batch: true }),
    /**
     * Sepolia goes through our own route.
     *
     * `http(undefined)` means viem's built-in default — a shared public
     * endpoint, rate limited per IP and shared with everyone else who also
     * never set one. `/api/rpc` forwards to Alchemy using a key that stays on
     * the server, because Alchemy puts the key in the URL path and a
     * browser-side URL would publish it. See the route for the rest.
     */
    [hackathonSepolia.id]: http("/api/rpc", { batch: true }),
  },
  batch: { multicall: true },

  /**
   * viem's own cache, below React Query, turned off.
   *
   * `cacheTime` defaults to `pollingInterval` (4s) and covers the answers viem
   * considers safe to reuse — `eth_blockNumber` and `eth_chainId` among them.
   * Harmless in an app that tolerates being a block behind; not in one being
   * driven live while somebody warps anvil forward thirty days between two
   * clicks, where a four-second-old block number is a wrong answer to "has
   * this slot run out yet".
   *
   * Batching STAYS. It is not a cache — it coalesces reads issued in the same
   * tick into one `aggregate3`, all of them fresh — and without it a namespace
   * with eight labels is eight serial round trips.
   */
  cacheTime: 0,

  /**
   * State that survives a reload, and is readable on the server.
   *
   * ── Why cookies and not localStorage ────────────────────────────────────
   *
   * `ssr: true` tells wagmi the first render happens somewhere with no wallet
   * and no storage, so it must not assume a connection. That alone still gives
   * a visible flash: the server renders "not connected", the client rehydrates
   * from localStorage a moment later, and the header changes under the reader.
   *
   * A cookie is the one store both sides can read. {RootLayout} passes what the
   * browser sent as `initialState`, so the FIRST html already knows which
   * account and which chain — no flash, and no layout shift in the header.
   *
   * ── What it persists ────────────────────────────────────────────────────
   *
   * wagmi keeps `chainId` in the same state it keeps connections in, so
   * choosing Sepolia survives a refresh for free. That was the alternative to
   * a second, bespoke store for one number that wagmi already owns.
   */
  storage: createStorage({
    storage: cookieStorage,
    // Namespaced: two apps on localhost would otherwise share one key and read
    // each other's connection back as their own.
    key: "ens-slots.wagmi",
  }),
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
