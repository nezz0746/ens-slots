import {
  baseMetadata,
  RECORD_KEY,
  RECORD_VERSION,
  sponsorEnvelope,
  type BaseMetadata,
  type SponsorEnvelope,
} from "./base";
import { GECKO_CHAIN } from "./fetch-meta";
import { miniappSponsor } from "./types/miniapp";
import { poolSponsor } from "./types/pool";
import { postSponsor } from "./types/post";
import { tokenSponsor } from "./types/token";
import { urlSponsor } from "./types/url";

export * from "./base";
export * from "./define";
export * from "./fetch-meta";

/**
 * Every type this build knows how to write.
 *
 * A consumer does not need this map to READ a record — see {parseSponsorRecord}
 * — which is the point. This is the publisher's list; the reader's list is
 * open.
 */
export const SPONSOR_TYPES = {
  token: tokenSponsor,
  pool: poolSponsor,
  miniapp: miniappSponsor,
  post: postSponsor,
  url: urlSponsor,
} as const;

export type SponsorType = keyof typeof SPONSOR_TYPES;

export const SPONSOR_TYPE_LIST = Object.values(SPONSOR_TYPES);

export function isKnownType(type: string): type is SponsorType {
  return type in SPONSOR_TYPES;
}

/** A record as it comes back off the chain, understood or not. */
export type SponsorRecord = SponsorEnvelope & {
  /** False when the payload names a type this build has no renderer for. */
  known: boolean;
};

/**
 * Read a record, WITHOUT requiring that we understand its type.
 *
 * The envelope is validated on its own and the type-specific half is left as
 * `unknown` unless we recognise it. That ordering is the whole open-standard
 * property: a consumer pinned months ago must be able to draw a payload
 * written by a publisher that knows types it has never heard of, and it can,
 * because {baseMetadata} guarantees a name, an image and a line of text no
 * matter what `type` says.
 *
 * `null` for anything unparseable. Whoever holds a name can write any string
 * they like into their own record, so malformed input is an expected state
 * rather than an exception — it renders as an empty space, which is the honest
 * drawing of a record nobody can read.
 */
export function parseSponsorRecord(raw: string): SponsorRecord | null {
  if (!raw) return null;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const envelope = sponsorEnvelope.safeParse(json);
  if (!envelope.success) return null;

  // A record from a FUTURE version is not readable by guessing. Refusing it is
  // the safe answer: the envelope may have been redefined, and rendering a
  // half-understood payload is worse than rendering nothing.
  if (envelope.data.v > RECORD_VERSION) return null;

  const type = envelope.data.type;
  if (!isKnownType(type)) return { ...envelope.data, known: false };

  // Known type, but the sponsor's own half still has to hold up. A record whose
  // `data` has drifted falls back to the generic card rather than vanishing —
  // the metadata is still perfectly good.
  const parsed = SPONSOR_TYPES[type].data.safeParse(envelope.data.data);
  return { ...envelope.data, known: parsed.success };
}

/**
 * Serialise a record for {RECORD_KEY}.
 *
 * `data` is optional, and that is not an oversight. The envelope only ever
 * guarantees a type and the display triple; a payload whose type-specific half
 * is absent is still perfectly renderable, and `JSON.stringify` drops the key
 * rather than writing `null` — so a record with nothing to say says nothing.
 */
export function encodeSponsorRecord(record: {
  type: string;
  data?: unknown;
  metadata: BaseMetadata & Record<string, unknown>;
}): string {
  return JSON.stringify({
    v: RECORD_VERSION,
    type: record.type,
    data: record.data,
    metadata: record.metadata,
  });
}

/**
 * The three fields a card can always count on.
 *
 * Separate from the record so a renderer never reaches into `metadata`
 * directly for them — every type is guaranteed to carry these and only these.
 */
export function displayOf(record: SponsorRecord): BaseMetadata {
  return baseMetadata.parse(record.metadata);
}

/**
 * Where a click on the card goes, or null when it has nowhere.
 *
 * Data rather than presentation, and it lives here for the reason adland's
 * equivalent does: two things that never import each other — a card in the
 * browser and a link composed on a server — need the same answer, and a second
 * copy of "where does a pool go" is a second copy that can disagree.
 */
export function destinationOf(record: SponsorRecord): string | null {
  const data = record.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return null;

  switch (record.type) {
    case "url":
    case "post":
    case "miniapp":
      return typeof data.url === "string" ? data.url : null;

    case "token":
    case "pool": {
      const net = GECKO_CHAIN[Number(data.chainId)];
      const address = typeof data.address === "string" ? data.address : null;
      if (!net || !address) return null;
      return `https://www.geckoterminal.com/${net}/${record.type === "pool" ? "pools" : "tokens"}/${address}`;
    }

    default:
      // An unknown type may still carry a URL — the envelope does not forbid
      // it — and following one is better than a dead card.
      return typeof data.url === "string" ? data.url : null;
  }
}

export { RECORD_KEY, RECORD_VERSION };
