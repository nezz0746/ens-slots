import { z } from "zod";

import { address, chainId, SUPPORTED_CHAINS } from "../base";
import { defineSponsor, extendBase, withChoices } from "../define";
import { readToken } from "../fetch-meta";

/** A token, named by where it lives rather than by what it is called. */
export const tokenSponsor = defineSponsor({
  type: "token",
  label: "Token",
  hint: "A token contract, by chain and address",

  data: z.object({
    chainId: withChoices(
      chainId,
      SUPPORTED_CHAINS.map((c) => ({ label: c.label, value: c.id })),
    ),
    address,
  }),

  metadata: extendBase({
    symbol: z.string().default(""),
    chainLabel: z.string().default(""),
  }),

  async enrich({ chainId: id, address: addr }) {
    const found = await readToken(id, addr);
    const chainLabel = SUPPORTED_CHAINS.find((c) => c.id === id)?.label ?? "";

    // A token no DEX has indexed still gets a record. The address IS the
    // identity; a name is a convenience, and refusing to publish without one
    // would make this package an opinion about which assets count.
    return {
      name: found?.name || found?.symbol || `${addr.slice(0, 6)}…${addr.slice(-4)}`,
      image: found?.image ?? "",
      tagline: found?.symbol ? `${found.symbol} on ${chainLabel}` : chainLabel,
      symbol: found?.symbol ?? "",
      chainLabel,
    };
  },
});
