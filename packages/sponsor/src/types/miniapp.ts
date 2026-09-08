import { z } from "zod";

import { httpUrl } from "../base";
import { defineSponsor, extendBase } from "../define";
import { readFarcasterManifest, readOpenGraph } from "../fetch-meta";

/** A mini app, identified by its own manifest where it publishes one. */
export const miniappSponsor = defineSponsor({
  type: "miniapp",
  label: "Mini app",
  hint: "A Farcaster mini app URL",

  data: z.object({ url: httpUrl }),

  metadata: extendBase({
    host: z.string().default(""),
    verified: z.boolean().default(false),
  }),

  // The manifest is optional but the page is not: a mini app URL that does not
  // load is a broken pointer, and catching it here costs a fetch instead of a
  // second transaction.
  async verify({ url }) {
    await readOpenGraph(url);
  },

  async enrich({ url }) {
    const host = new URL(url).hostname;
    const manifest = await readFarcasterManifest(url);
    if (manifest) {
      return {
        name: manifest.name,
        image: manifest.icon,
        tagline: manifest.description.slice(0, 140),
        host,
        // The app declared itself at its own origin. Not a trust statement —
        // it says the manifest and the URL agree, nothing more.
        verified: true,
      };
    }

    const og = await readOpenGraph(url);
    return {
      name: og.title || host,
      image: og.image,
      tagline: og.description.slice(0, 140),
      host,
      verified: false,
    };
  },
});
