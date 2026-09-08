"use client";

import { useState } from "react";
import { useConfig, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

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
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send<T extends Parameters<typeof writeContractAsync>[0]>(
    label: string,
    request: T,
  ) {
    setError(null);
    setPending(label);
    try {
      const hash = await writeContractAsync(request);
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      return receipt;
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
  return m.split("\n")[0];
}
