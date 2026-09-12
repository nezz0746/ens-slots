import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress } from "viem";
import { mainnet } from "viem/chains";

/**
 * Who an address is, according to MAINNET ENS.
 *
 * ── Why mainnet, when the app is not on it ────────────────────────────────
 *
 * Primary names and avatars are a mainnet fact. Almost nobody has set a
 * reverse record on Sepolia, and nobody at all has one on a fork of it, so
 * resolving identity on whichever chain the page happens to be showing would
 * answer "no name" for every visitor who has one. The chain a slot lives on
 * and the chain a person is named on are simply different questions.
 *
 * ── Why viem's own `mainnet`, and not this app's chain definitions ────────
 *
 * {chains.ts} overrides `ensUniversalResolver` on both of its chains to point
 * at OUR deployment, which is the whole reason subname lookups work. A client
 * built from those would ask that resolver about `vitalik.eth` and be told,
 * correctly as far as it knows, that it does not resolve. viem's stock
 * `mainnet` carries the real one.
 *
 * ── Why a route and not a call from the page ──────────────────────────────
 *
 * The same reason as {api/price}: Alchemy puts the key in the URL path, so a
 * browser-side client would publish it to every visitor. It also keeps the
 * awkward half of avatars on the server — `getEnsAvatar` follows `ipfs://` and
 * reads ERC-721/1155 metadata to find an image, which is several more mainnet
 * calls, and the browser only needs the URL they resolve to.
 *
 * ── A missing key is not an error ─────────────────────────────────────────
 *
 * Nulls, not a 500. A name is an ornament over an address that is already
 * shown; an app cloned without a key should render truncated addresses
 * everywhere rather than an error where a name would be.
 */
export const runtime = "nodejs";

const EMPTY = { name: null, avatar: null };

/**
 * Cached at the edge rather than by `export const revalidate`.
 *
 * That option caches Next's own `fetch` results, and viem talks to an RPC over
 * POST, which is not cached. A response header is the thing that actually
 * works here — and identity is the right shape for it: a primary name changes
 * a few times in its life, so an hour of staleness costs nothing and saves a
 * mainnet round trip on every page view.
 */
const CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !isAddress(address))
    return NextResponse.json(EMPTY, { headers: { "cache-control": CACHE } });

  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return NextResponse.json({ ...EMPTY, reason: "no key" });

  const client = createPublicClient({
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`),
  });

  try {
    // Reverse first: without a primary name there is nothing to hang an
    // avatar off, and the avatar record is read from the NAME, not the address.
    const name = await client.getEnsName({ address });
    if (!name)
      return NextResponse.json(EMPTY, { headers: { "cache-control": CACHE } });

    const avatar = await avatarFor(client, name);

    return NextResponse.json(
      { name, avatar },
      { headers: { "cache-control": CACHE } },
    );
  } catch {
    // Not cached: an RPC that was merely unreachable should be asked again,
    // not remembered as "this address has no name" for the next hour.
    return NextResponse.json({ ...EMPTY, reason: "unreachable" });
  }
}

/**
 * The avatar, without sending a working URL through a broken gateway.
 *
 * ── The bug this exists to avoid ──────────────────────────────────────────
 *
 * `getEnsAvatar` looked like the whole answer and quietly returned null for a
 * record that was perfectly good. It classifies any URL CONTAINING `/ipfs/`
 * as an IPFS reference, rewrites the host to its own public gateway, and
 * HEAD-checks that rewritten URL before handing anything back. So
 *
 *     https://rainbow.mypinata.cloud/ipfs/QmXg…      → 200 image/jpeg
 *
 * was replaced by
 *
 *     https://ipfs.io/ipfs/QmXg…                     → 429 Too Many Requests
 *
 * and a rate limit on a gateway nobody asked for became "this person has no
 * avatar". Measured, not guessed: `ipfs.io` and `dweb.link` both answer 429,
 * `cloudflare-ipfs.com` no longer resolves at all, and the host named in the
 * record answers immediately.
 *
 * ── So the record is trusted when the browser can act on it ───────────────
 *
 * An `https:` or `data:` record needs no resolution — it is already a URL an
 * `<img>` can load, and verifying it here helps nobody: the browser is about
 * to make that exact request, and {Identity} hides the image if it fails. That
 * path is also one RPC call rather than two plus a HEAD.
 *
 * Everything else — `ipfs://`, `ar://`, an `eip155:` NFT that needs its token
 * URI read and its metadata parsed — is real work, and `getEnsAvatar` is
 * where that work is correctly implemented, so those still go through it.
 */
async function avatarFor(
  client: ReturnType<typeof createPublicClient>,
  name: string,
): Promise<string | null> {
  const record = await client
    .getEnsText({ name, key: "avatar" })
    .catch(() => null);
  if (!record) return null;

  if (/^(https?:|data:)/i.test(record)) return record;

  // A failed avatar must not cost the name: these records point wherever their
  // owner liked, and a dead CID or a moved NFT throws rather than returning.
  return client.getEnsAvatar({ name }).catch(() => null);
}
