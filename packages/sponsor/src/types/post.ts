import { z } from "zod";

import { httpUrl } from "../base";
import { defineSponsor, extendBase } from "../define";
import { readOpenGraph } from "../fetch-meta";

/** A post on a social network, by its permalink. */
export const postSponsor = defineSponsor({
  type: "post",
  label: "Post",
  hint: "A link to a post on X, Farcaster, or anywhere else",

  data: z.object({ url: httpUrl }),

  metadata: extendBase({
    network: z.string().default(""),
    excerpt: z.string().default(""),
  }),

  async verify({ url }) {
    await readOpenGraph(url);
  },

  async enrich({ url }) {
    const og = await readOpenGraph(url);
    const host = new URL(url).hostname.replace(/^www\./, "");

    // Networks that gate their own OG tags behind a logged-in fetch give us a
    // title and nothing else. The host is then the most honest label available,
    // and it is better than an empty card.
    const network =
      /(^|\.)x\.com$|(^|\.)twitter\.com$/.test(host)
        ? "X"
        : /(^|\.)farcaster\.xyz$|(^|\.)warpcast\.com$/.test(host)
          ? "Farcaster"
          : og.siteName || host;

    return {
      name: og.title || `Post on ${network}`,
      image: og.image,
      tagline: og.description.slice(0, 140),
      network,
      excerpt: og.description.slice(0, 280),
    };
  },
});
