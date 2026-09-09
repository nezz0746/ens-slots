"use client";

import { useChainId } from "wagmi";

import { addressesFor, isDeployedOn, type Addresses } from "@/lib/addresses";
import { isLocal } from "@/lib/chains";
import { currencyFor } from "@/lib/currency";

/**
 * The address book for whichever chain is connected.
 *
 * A hook rather than a module constant, because the answer changes while the
 * app is running: switching from the fork to Sepolia has to repoint every
 * contract read in the same render, and a value captured at import time cannot.
 */
export function useAddresses(): Addresses {
  return addressesFor(useChainId());
}

/** Whether the connected chain has a deployment at all. */
export function useIsDeployed(): boolean {
  return isDeployedOn(useChainId());
}

/** Whether the connected chain is the local fork — where the demo accounts live. */
export function useIsLocal(): boolean {
  return isLocal(useChainId());
}

/** The token every price on the connected chain is denominated in. */
export function useCurrency(): `0x${string}` {
  return currencyFor(useChainId());
}
