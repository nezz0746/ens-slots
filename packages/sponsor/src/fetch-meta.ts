/**
 * The two outside sources enrichment draws on, and nothing else.
 *
 * Both are keyless on purpose. A publish path that needed an API key would
 * mean this package could only ever run inside our own deployment, and the
 * whole argument for putting the record on ENS is that nobody has to come
 * through us.
 */

const UA = "ens-slots/0.1 (+https://github.com/nezz0746/ens-slots)";

/** Give up rather than hang a publish transaction behind a dead host. */
async function fetchWithTimeout(url: string, ms = 6_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": UA, accept: "*/*" },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Unescape the handful of entities that actually show up in meta tags. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export type OpenGraph = {
  title: string;
  description: string;
  image: string;
  /** The site's own icon, which is usually the better thumbnail. */
  favicon: string;
  siteName: string;
};

/**
 * Open Graph tags, by regex.
 *
 * Not a parser, and the choice is deliberate rather than lazy: a real DOM
 * parser is a dependency that runs untrusted third-party markup, at publish
 * time, on our server. Four attributes off four meta tags does not justify
 * that. What this misses — exotic attribute ordering, tags built by script —
 * degrades to an empty string, which the caller already has to handle because
 * plenty of pages ship no OG tags at all.
 *
 * The body is capped because some of these pages are megabytes and none of the
 * interesting tags are ever below the fold of the `<head>`.
 */
export async function readOpenGraph(url: string): Promise<OpenGraph> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);

  const html = (await res.text()).slice(0, 200_000);

  const pick = (...names: string[]): string => {
    for (const name of names) {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`,
        "i",
      );
      const tag = html.match(re)?.[0];
      const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
      if (content) return decodeEntities(content).trim();
    }
    return "";
  };

  const title =
    pick("og:title", "twitter:title") ||
    decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();

  return {
    title,
    description: pick("og:description", "twitter:description", "description"),
    image: absolutise(pick("og:image", "twitter:image", "og:image:url"), url),
    favicon: await readFavicon(html, url),
    siteName: pick("og:site_name") || new URL(url).hostname,
  };
}

/**
 * The site's icon, preferred over its Open Graph image for a small square.
 *
 * An `og:image` is a SHARE card — 1200×630, usually a wide banner with type on
 * it. Cropped square at 48px it reads as an illegible smear, which is what
 * splits.org's looked like. A favicon is already a square logo at the size this
 * is drawn, so for a plain website it is simply the right asset.
 *
 * Preference order is by size: `apple-touch-icon` is conventionally 180×180 and
 * the highest quality thing most sites publish, then a declared `icon`, then
 * `/favicon.ico` — which every site has by convention and many do not actually
 * serve, so it is confirmed before being returned rather than assumed.
 */
async function readFavicon(html: string, url: string): Promise<string> {
  const links = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi) ?? [];

  const hrefOf = (tag: string) => tag.match(/href=["']([^"']+)["']/i)?.[1] ?? "";
  const apple = links.find((l) => /apple-touch-icon/i.test(l));
  const declared = links.find((l) => !/apple-touch-icon/i.test(l));

  // A declared icon is taken at its word — SVG included, which every current
  // browser draws in an `<img>` and which is usually the crispest thing a site
  // publishes. Only the guessed `/favicon.ico` below has to be confirmed,
  // because that one nobody declared.
  for (const candidate of [apple, declared]) {
    if (!candidate) continue;
    const href = absolutise(decodeEntities(hrefOf(candidate)), url);
    if (href) return href;
  }

  const fallback = absolutise("/favicon.ico", url);
  return (await isImage(fallback)) ? fallback : "";
}

/** Does this URL actually serve an image? One request, at publish time only. */
async function isImage(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, 4_000);
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

/** OG images are allowed to be relative; a card rendered elsewhere is not. */
function absolutise(candidate: string, base: string): string {
  if (!candidate) return "";
  try {
    return new URL(candidate, base).toString();
  } catch {
    return "";
  }
}

/**
 * GeckoTerminal's slug for a chain id. Undefined where it has no coverage.
 *
 * ── Why GeckoTerminal and not DexScreener ─────────────────────────────────
 *
 * It is CoinGecko's DEX index, and it is keyless in the way that matters: no
 * account, no header, no demo key — unlike CoinGecko's own `/api/v3`, which now
 * wants one even on the free tier. Three things settled it over DexScreener:
 *
 *   * It has a resource per token and per pool. DexScreener answers a token
 *     query with every PAIR that trades it, leaving the caller to work out
 *     which side of which pair is the token being asked about — and getting it
 *     wrong for anything that trades as the quote half, which is most
 *     stablecoins.
 *   * Logos come from CoinGecko's own image store rather than being an optional
 *     per-pair field. Both of the tokens seeded here have one there and neither
 *     had one on DexScreener.
 *   * `?include=` returns the pool, its dex and both tokens in a single request,
 *     which matters against a rate limit.
 *
 * That limit is 30 requests a minute for anonymous callers. Enrichment spends
 * one and never runs again; the live figures route caches for 30 seconds.
 */
export const GECKO_CHAIN: Record<number, string> = {
  1: "eth",
  8453: "base",
  42161: "arbitrum",
  10: "optimism",
};

const GECKO = "https://api.geckoterminal.com/api/v2";

/**
 * A read, with "never heard of it" kept apart from "ask me later".
 *
 * ── Why this distinction is the important one here ────────────────────────
 *
 * Both used to return null, and a null means "publish it anyway with what we
 * have" — which is right for a token no index has seen, and badly wrong for a
 * rate limit. The record is written ONCE and paid for in gas, so a 429
 * swallowed at publish time freezes a truncated address into a name that
 * somebody has to spend another transaction to correct. It surfaced while
 * seeding: three requests in quick succession, and two real tokens with real
 * logos published as `0x22aF…6F3b`.
 *
 * The limit is 30 requests a minute for anonymous callers, which one person
 * filling in a form never approaches and a script generating fixtures hits
 * immediately. So a 429 is retried once, and then thrown — the sponsor is told
 * to try again, which is recoverable, instead of being handed a bad record,
 * which is not.
 */
async function gecko(path: string): Promise<any | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchWithTimeout(`${GECKO}${path}`);

    if (res.ok) return await res.json();

    // The index genuinely does not know this address. A legitimate thing to
    // sponsor, and the caller fills in what it can.
    if (res.status === 404) return null;

    if (res.status === 429 && attempt === 0) {
      const after = Number(res.headers.get("retry-after"));
      await new Promise((r) =>
        setTimeout(r, Number.isFinite(after) && after > 0 ? after * 1000 : 2_000),
      );
      continue;
    }

    throw new Error(
      res.status === 429
        ? "The price index is rate limiting us — try again in a moment."
        : `The price index returned ${res.status}`,
    );
  }
  return null;
}

export type TokenIdentity = {
  symbol: string;
  name: string;
  image: string;
};

/**
 * A token's identity, asked of the token rather than inferred from its pairs.
 *
 * `null` where the index has never seen it, which is a legitimate thing to
 * sponsor rather than an error — refusing to publish one would make this
 * package an opinion about which assets are real.
 */
export async function readToken(
  chainId: number,
  address: string,
): Promise<TokenIdentity | null> {
  const net = GECKO_CHAIN[chainId];
  if (!net) return null;

  const json = await gecko(`/networks/${net}/tokens/${address.toLowerCase()}`);
  const a = json?.data?.attributes;
  if (!a) return null;

  return {
    symbol: a.symbol ?? "",
    name: a.name ?? "",
    image: a.image_url && a.image_url !== "missing.png" ? a.image_url : "",
  };
}

export type PoolIdentity = {
  /** As the index names it, e.g. "CLANKER / WETH 1%". */
  pair: string;
  dex: string;
  image: string;
};

/** A pool's identity, its venue, and its base token's logo — one request. */
export async function readPool(
  chainId: number,
  address: string,
): Promise<PoolIdentity | null> {
  const net = GECKO_CHAIN[chainId];
  if (!net) return null;

  const json = await gecko(
    `/networks/${net}/pools/${address.toLowerCase()}?include=base_token,dex`,
  );
  const a = json?.data?.attributes;
  if (!a) return null;

  const included: any[] = json.included ?? [];
  const dex = included.find((i) => i.type === "dex");
  // The BASE token's logo, specifically. A pool has two, and the one that
  // identifies it is the thing being priced.
  const baseId = json.data?.relationships?.base_token?.data?.id;
  const base = included.find((i) => i.type === "token" && i.id === baseId);
  const image = base?.attributes?.image_url;

  return {
    pair: a.name ?? "",
    dex: dex?.attributes?.name ?? "",
    image: image && image !== "missing.png" ? image : "",
  };
}

/**
 * The numbers that move. Never stored — see the note on `SponsorDefinition`.
 *
 * Unlike enrichment, a failure here is not worth surfacing: the card simply
 * shows its metadata and no figures, and tries again on the next refetch.
 */
export type Figures = {
  price: number | null;
  change24h: number | null;
  liquidity: number | null;
  volume24h: number | null;
};

/**
 * Live figures for a token or a pool.
 *
 * Shared by the render-time route so there is one place that knows how this
 * index shapes a price, rather than a second copy in the app that can disagree
 * with the one enrichment uses.
 */
export async function readFigures(
  chainId: number,
  address: string,
  kind: "token" | "pool",
): Promise<Figures | null> {
  const net = GECKO_CHAIN[chainId];
  if (!net) return null;

  const path =
    kind === "token"
      ? `/networks/${net}/tokens/${address.toLowerCase()}`
      : `/networks/${net}/pools/${address.toLowerCase()}`;

  const a = (await gecko(path).catch(() => null))?.data?.attributes;
  if (!a) return null;

  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

  return {
    price: num(a.price_usd ?? a.base_token_price_usd),
    change24h: num(a.price_change_percentage?.h24),
    liquidity: num(a.total_reserve_in_usd ?? a.reserve_in_usd),
    volume24h: num(a.volume_usd?.h24),
  };
}

/** A Farcaster mini app's own manifest, or null when there isn't one. */
export async function readFarcasterManifest(url: string): Promise<{
  name: string;
  icon: string;
  description: string;
} | null> {
  try {
    const origin = new URL(url).origin;
    const res = await fetchWithTimeout(`${origin}/.well-known/farcaster.json`);
    if (!res.ok) return null;
    const json = (await res.json()) as { frame?: unknown; miniapp?: unknown };
    const frame = (json.miniapp ?? json.frame) as
      | { name?: string; iconUrl?: string; description?: string; subtitle?: string }
      | undefined;
    if (!frame?.name) return null;
    return {
      name: frame.name,
      icon: frame.iconUrl ?? "",
      description: frame.description ?? frame.subtitle ?? "",
    };
  } catch {
    return null;
  }
}
