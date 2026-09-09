/**
 * Reproduces the tab freeze: pick Sepolia while a real wallet is connected.
 *
 * Stands a minimal EIP-1193 connector (type "injected") in for MetaMask, and
 * drives the exact decision logic of useChainSigner in a loop, the way React
 * would re-run the effect after each state change.
 */
import { createConfig, http, connect, disconnect, switchChain, getAccount } from "@wagmi/core";
import { mock } from "@wagmi/core/connectors";
import { createConnector } from "@wagmi/core";
import { anvil, sepolia } from "viem/chains";
import { defineChain } from "viem";

const anvilFork = defineChain({ ...anvil, testnet: true });

const MM = "0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";

/** A stand-in for MetaMask: type "injected", pinned to the local fork. */
function fakeInjected() {
  let chainId = 31337;
  return createConnector(() => ({
    id: "fakeInjected",
    name: "Fake MetaMask",
    type: "injected",
    async connect() { return { accounts: [MM], chainId }; },
    async disconnect() {},
    async getAccounts() { return [MM]; },
    async getChainId() { return chainId; },
    async isAuthorized() { return true; },
    async switchChain({ chainId: id }) { chainId = id; return config.chains.find((c) => c.id === id); },
    onAccountsChanged() {}, onChainChanged() {}, onDisconnect() {},
    async getProvider() { return { request: async () => { throw new Error("noop"); } }; },
  }));
}

const demo = mock({ accounts: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"] });

const config = createConfig({
  chains: [anvilFork, sepolia],
  connectors: [demo, fakeInjected()],
  transports: { [anvilFork.id]: http(), [sepolia.id]: http() },
});

const isLocal = (id) => id === 31337;

// ── Arrive on the fork with a real wallet connected ────────────────────────
await connect(config, { connector: config.connectors[1] });   // "MetaMask"
console.log("after wallet connect:  chainId", config.state.chainId, "signer", getAccount(config).connector?.type);

// useChainSigner then binds a demo account, because we are on the fork.
await connect(config, { connector: config.connectors[0] });   // demo account
console.log("after demo bind:       chainId", config.state.chainId, "signer", getAccount(config).connector?.type);
console.log("connections:", config.state.connections.size);

// ── The click: pick Sepolia ────────────────────────────────────────────────
await switchChain(config, { chainId: sepolia.id });
console.log("\n-- picked Sepolia --");

// ── Now replay the effect, exactly as useChainSigner writes it ─────────────
let acted = null;
const seen = [];
for (let i = 0; i < 40; i++) {
  const chainId = config.state.chainId;
  const local = isLocal(chainId);
  const signer = getAccount(config).connector?.type ?? "none";
  const state = `${local}:${signer}`;
  seen.push(`${chainId} ${state}`);
  if (acted === state) { console.log(`\nSETTLED after ${i} effect runs.`); break; }
  acted = state;

  if (local) {
    if (signer === "mock") continue;
    const d = config.connectors.find((c) => c.type === "mock");
    if (d) await connect(config, { connector: d });
    continue;
  }
  if (signer === "mock") await disconnect(config);
}

console.log("\neffect runs (chainId  local:signer):");
for (const [i, s] of seen.entries()) console.log(`  ${String(i).padStart(2)}  ${s}`);
if (seen.length >= 40) console.log("\nNEVER SETTLED — the effect re-runs forever. This is the freeze.");
