"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useCapabilities,
  useChainId,
  useConfig,
  useSendCalls,
  useWriteContract,
} from "wagmi";
import { getBalance, waitForTransactionReceipt } from "wagmi/actions";
import { encodeFunctionData } from "viem";

/**
 * One writer at a time, across the whole app.
 *
 * ── Why this is module-level and not a hook ─────────────────────────────────
 *
 * There are nine `useTx()` instances and six of them are mounted at once on a
 * namespace page — the buy form, the records editor, the label form, collect
 * all, the profile editor, and the `+100` USDC button that lives in the site
 * header and is therefore clickable on every screen. Each had its own `pending`
 * and no knowledge of the others.
 *
 * Nothing in this app passes a nonce, so viem fetches one per request. Two
 * writes started before either mines are handed the SAME nonce, the first
 * mines, and the second arrives stale:
 *
 *     Nonce provided for the transaction (31134) is lower than the current
 *     nonce of the account.
 *
 * Minting USDC and then buying a second later is exactly that, and it is the
 * most natural thing a visitor does.
 *
 * A promise chain rather than a boolean: a second write QUEUES behind the first
 * instead of being dropped, so a user who presses two buttons gets two
 * transactions in order rather than one and an error. Per tab, which is all
 * this can know about — a second tab or a wallet with its own queue can still
 * collide, which is why `readReason` also translates the message.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  // `catch` on the CHAIN, not on the work: one failed transaction must not
  // poison the queue for every write after it.
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

/**
 * Send, wait, and actually check.
 *
 * Carried over from 0xSlots, where this was written after a bug:
 * `waitForTransactionReceipt` RESOLVES for a reverted transaction. It only
 * throws when the wait itself fails. So a revert arrived as a fulfilled
 * promise, the UI said the action had succeeded, and the chain disagreed.
 * Reading `receipt.status` is the whole fix and it must not be skipped.
 */
export function useTx() {
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  /**
   * The chain the app is reading from, named on every write.
   *
   * A wallet sits on whatever network it likes, and switching the app's chain
   * does not move it. A write prepared for one and sent on the other reverts
   * against contracts that are not there, or worse succeeds against different
   * ones. Naming it makes wagmi ask the wallet to switch, and fail loudly if it
   * will not — which is strictly better than the guard that used to sit here
   * and threw before wagmi ever got the chance to offer the switch.
   */
  const appChainId = useChainId();
  const { address } = useAccount();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send<T extends Parameters<typeof writeContractAsync>[0]>(
    label: string,
    request: T,
  ) {
    setError(null);
    setPending(label);
    try {
      /**
       * Can this account pay for gas at all?
       *
       * Asked BEFORE the wallet is, because everything downstream of an empty
       * account lies about why it failed. A zero-balance account estimates
       * gas fine — estimating costs nothing — so MetaMask draws a full
       * confirmation screen, "You receive +100", a fee in SepoliaETH, and the
       * failure arrives afterwards as
       *
       *     The contract function "mint" reverted with the following reason:
       *
       * with nothing after the colon. That sentence is false in every part:
       * the function did not revert, nothing was mined, and the account's
       * nonce is still zero. It cost an afternoon to find, twice, because it
       * reads like a contract problem and is not one.
       *
       * One `eth_getBalance` per write is nothing next to that.
       */
      if (address) {
        const balance = await getBalance(config, {
          address,
          chainId: appChainId,
        });
        if (balance.value === 0n) {
          setError(
            `This account has no ${balance.symbol} — it cannot pay for gas. Send it some, or switch to an account that has a balance.`,
          );
          return null;
        }
      }

      return await enqueue(async () => {
        const hash = await writeContractAsync({
          chainId: appChainId,
          ...request,
        });
        const receipt = await waitForTransactionReceipt(config, { hash });
        if (receipt.status !== "success")
          throw new Error("Transaction reverted");
        return receipt;
      });
    } catch (e) {
      setError(readReason(e));
      return null;
    } finally {
      setPending(null);
    }
  }

  return { send, pending, error, clearError: () => setError(null) };
}

/**
 * Several contract calls as one signature, where the wallet can do it.
 *
 * ── Why this is separate from `useTx` ───────────────────────────────────────
 *
 * The contracts do most of the batching themselves — `open` stands a whole
 * namespace up, `slotLabels` opens several labels, `multicall` mixes them with
 * a profile. All of that works in every wallet, because it is one call to one
 * contract.
 *
 * What no contract can batch is calls to DIFFERENT contracts: approving the
 * ERC20 and then registering with it, or a name's owner pointing their `.eth`
 * entry at a registry and then opening a namespace against it. Those cross a
 * contract boundary, so only the wallet can put them in one transaction.
 *
 * ── It degrades rather than hides ───────────────────────────────────────────
 *
 * EIP-5792 is answered by smart accounts — Coinbase Smart Wallet, Safe, an EOA
 * upgraded through EIP-7702 — and by nothing else. `useCapabilities` says which
 * one is connected, and a wallet that cannot batch gets the same calls sent one
 * at a time, in order. The local dev connector is in that second group, so this
 * path is the one exercised by default.
 *
 * The fallback stops at the first failure, deliberately. These are ordered
 * steps where each depends on the last, so carrying on after one reverts would
 * send a transaction whose precondition is known to be missing.
 */
export function useBatch() {
  const { send, pending, error } = useTx();
  const { sendCallsAsync } = useSendCalls();
  const { data: capabilities } = useCapabilities();
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Whether the connected wallet will actually run these atomically.
   *
   * `atomic` is `"supported"` or `"ready"` when the wallet guarantees all or
   * nothing. Anything else — including a wallet that accepts `wallet_sendCalls`
   * and then sends them separately — is not a batch worth promising to a user,
   * so it is reported as false and the caller says "4 signatures" honestly.
   */
  /**
   * Held in state, and only ever updated from a SETTLED answer.
   *
   * `useCapabilities` refetches, and `data` is undefined while it does — so
   * computing this inline flipped it false → true → false on every refetch.
   * Everything downstream is shaped by it: {AcquireName} folds two steps into
   * one when it is true, so the card renumbered itself, grew and lost a row,
   * and the live button moved out from under the cursor. That is the flicker.
   */
  const [atomic, setAtomic] = useState(false);
  useEffect(() => {
    if (capabilities === undefined) return;
    setAtomic(
      Object.values(capabilities).some((c) => {
        const status = (c as { atomic?: { status?: string } })?.atomic?.status;
        return status === "supported" || status === "ready";
      }),
    );
  }, [capabilities]);

  async function sendBatch(
    label: string,
    // biome-ignore lint/suspicious/noExplicitAny: each call is typed at its own site
    calls: readonly {
      address: `0x${string}`;
      abi: any;
      functionName: string;
      args: readonly any[];
    }[],
  ) {
    if (!calls.length) return true;

    if (atomic) {
      setBusy(label);
      try {
        await sendCallsAsync({
          calls: calls.map((c) => ({
            to: c.address,
            data: encodeFunctionData({
              abi: c.abi,
              functionName: c.functionName,
              args: c.args,
            }),
          })),
        });
        return true;
      } catch {
        return false;
      } finally {
        setBusy(null);
      }
    }

    for (const call of calls) {
      // biome-ignore lint/suspicious/noExplicitAny: viem's request type is built per-ABI
      if (!(await send(label, call as any))) return false;
    }
    return true;
  }

  return {
    sendBatch,
    /** True when this is one signature. Worth saying on the button. */
    atomic,
    pending: busy ?? pending,
    error,
  };
}

/**
 * The revert, said the way a person would.
 *
 * viem puts a custom error's name on the simulation failure, which is far more
 * useful than the stack it comes wrapped in — the contracts here revert with
 * named errors precisely so a UI can say what went wrong.
 */
function readReason(e: unknown): string {
  const err = e as {
    cause?: { data?: { errorName?: string; args?: readonly unknown[] } };
    shortMessage?: string;
    message?: string;
  };
  const name = err.cause?.data?.errorName;
  if (name) {
    const friendly: Record<string, string> = {
      SlotOccupied: "Someone holds it — it cannot be unslotted.",
      PermanentlySlotted: "This label was slotted permanently.",
      NotOccupant: "Only the current holder can do that.",
      LabelUnavailable: "That label is already taken.",
      AlreadySlotted: "That label is already slotted.",
      InsufficientDeposit: "Fund it for longer — that is below the minimum.",
      PriceTooLow: "Your price has to be at least what they declared.",
    };
    return friendly[name] ?? name;
  }
  const m = err.shortMessage ?? err.message ?? "Transaction failed";
  const first = m.split("\n")[0];

  /**
   * wagmi's own wording, in a person's words.
   *
   * "Connector not connected." is what every action says when no wallet is
   * attached, and it is the single most likely thing a first-time visitor
   * sees — small, grey, below the button they just pressed, and reading like
   * an internal assertion. It says nothing about what to do next.
   */
  if (/connector not connected/i.test(first)) return "Connect a wallet first.";
  if (
    /chain.*mismatch|does not match the target chain|chain of the connection/i.test(
      first,
    )
  )
    return "Your wallet is on a different network. Switch it, or pick the matching one in the header.";
  if (/user rejected|denied transaction/i.test(first))
    return "You declined it in your wallet.";
  // Two writes raced for one nonce. The queue above prevents this within a
  // tab; a second tab, or a wallet running its own queue, still can.
  if (/nonce/i.test(first))
    return "Another transaction is still going through — give it a second and try again.";
  // The preflight above catches an EMPTY account. This catches one with a
  // balance too small for this particular transaction, which only the wallet
  // can know.
  if (/insufficient funds|exceeds the balance/i.test(first))
    return "Not enough ETH to pay for gas on this one.";
  return first;
}
