import { z } from "zod";

import { address, chainId, SUPPORTED_CHAINS } from "../base";
import { defineSponsor, extendBase, withChoices } from "../define";
import { GECKO_CHAIN, readPool } from "../fetch-meta";

/**
 * A liquidity pool.
 *
 * The pair, the venue and the logos are metadata — they do not change. Price,
 * liquidity and 24h volume are NOT here and never will be: they move by the
 * block, and a figure frozen into a record at publish time would be a lie
 * within the hour. A renderer fetches those live, from the same public index
 * this enrichment uses.
 */
export const poolSponsor = defineSponsor({
  type: "pool",
  label: "Pool",
  hint: "A liquidity pool, by chain and pair address",

  data: z.object({
    chainId: withChoices(
      chainId,
      SUPPORTED_CHAINS.filter((c) => GECKO_CHAIN[c.id]).map((c) => ({
        label: c.label,
        value: c.id,
      })),
    ),
    address,
  }),

  metadata: extendBase({
    pair: z.string().default(""),
    dex: z.string().default(""),
    chainLabel: z.string().default(""),
  }),

  async enrich({ chainId: id, address: addr }) {
    const found = await readPool(id, addr);
    const chainLabel = SUPPORTED_CHAINS.find((c) => c.id === id)?.label ?? "";

    return {
      name: found?.pair || `${addr.slice(0, 6)}…${addr.slice(-4)}`,
      image: found?.image ?? "",
      tagline: [found?.dex, chainLabel].filter(Boolean).join(" · "),
      pair: found?.pair ?? "",
      dex: found?.dex ?? "",
      chainLabel,
    };
  },
});
