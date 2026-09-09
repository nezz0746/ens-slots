import { addressesFor } from "./addresses";

/**
 * The one token this protocol prices everything in.
 *
 * ── Why one, and why this one ─────────────────────────────────────────────
 *
 * Registration is charged in MockUSDC by ENS's own `.eth` registrar, so a
 * protocol that priced slots in native ETH would put two currencies and two
 * balances on one screen for what a person experiences as a single decision:
 * get the name, then hold it. MockUSDC is also the one anybody can mint, which
 * is what lets a demo hand out funds.
 *
 * ── What this being an ERC-20 changes ─────────────────────────────────────
 *
 * Everything that moves money needs an allowance first, and must send NO
 * `msg.value` — the slot rejects a non-zero one on the ERC-20 path. In exchange,
 * `topUp` stops needing to ride on the transaction's value and can finally sit
 * inside `multicall` alongside `selfAssess` and `withdraw`, which is what turns
 * the hold form's fund-then-reprice into one signature after the approval.
 *
 * ── The limitation, stated ────────────────────────────────────────────────
 *
 * `DECIMALS` and `SYMBOL` are constants because every namespace this app opens
 * is created with these terms, on either chain — the same MockUSDC is deployed
 * at the same address on Sepolia and inherited by the fork. Only the address
 * varies, and only in principle, which is why {currencyFor} takes a chain id
 * while the other two do not. A namespace opened elsewhere with a different
 * token would need these read per-slot from `getSlotInfo().currency`, which is
 * already carried on `SlotState` for exactly that day.
 */
export const currencyFor = (chainId?: number) => addressesFor(chainId).mockUsdc;

/** MockUSDC is 6, not 18. Getting this wrong is a factor of a trillion. */
export const DECIMALS = 6;
export const SYMBOL = "USDC";

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

export const isNative = (address?: string) =>
  !address || address === ZERO_ADDRESS;

/**
 * Whether a dollar figure would just restate the amount.
 *
 * A balance in a dollar stablecoin does not need "$3,270" printed under
 * "3,270 USDC". The row is dropped rather than shown twice.
 */
export const isDollarPegged = (symbol = SYMBOL) =>
  /^(USDC|USDT|DAI|USDS|PYUSD)$/i.test(symbol);
