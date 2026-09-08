import { z } from "zod";

import { httpUrl } from "../base";
import { defineSponsor, extendBase } from "../define";
import { readOpenGraph } from "../fetch-meta";

/** Anything with a page. The fallback type, and deliberately the plainest. */
export const urlSponsor = defineSponsor({
  type: "url",
  label: "Link",
  hint: "Any page on the web",

  data: z.object({ url: httpUrl }),

  metadata: extendBase({ host: z.string().default("") }),

  async verify({ url }) {
    await readOpenGraph(url);
  },

  async enrich({ url }) {
    const og = await readOpenGraph(url);
    const host = new URL(url).hostname.replace(/^www\./, "");
    return {
      name: og.title || host,
      // The favicon first: this card draws a 48px square, and a site's icon is
      // already one. Its `og:image` is a 1200×630 share banner, which crops to
      // an unreadable strip of somebody else's headline.
      image: og.favicon || og.image,
      tagline: og.description.slice(0, 140),
      host,
    };
  },
});
