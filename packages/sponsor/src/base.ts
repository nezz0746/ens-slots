import { z } from "zod";

/**
 * The text record key everything here lives under.
 *
 * Reverse-DNS on a domain we control, which is ENSIP-5's convention for keys
 * outside the standard set. The prefix is not about collisions — the namespace
 * owns its own record mapping and nothing else writes to it — it is about a
 * consumer being able to tell what it just parsed. A bare `sponsor` key that
 * two projects both used with different shapes would resolve to a string
 * nobody can safely interpret.
 *
 * ONE key, not several. The type discriminant lives inside the payload, so a
 * type field and a type key cannot disagree, and publishing is one transaction
 * rather than one per field.
 */
export const RECORD_KEY = "org.0xslots.sponsor";

/**
 * The payload version, carried IN the record rather than in the key.
 *
 * A version in the key (`…sponsor.v2`) means consumers have to discover that a
 * new key exists before they can read anything. A version in the payload means
 * the key is stable forever and a consumer gates on a field it is already
 * parsing.
 */
export const RECORD_VERSION = 1;

/**
 * The three fields every type's metadata must carry.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Per-type metadata field names diverge — a token has `logoURI`, a miniapp has
 * `icon`, a post has an author avatar — so a consumer that has never seen
 * `type: "pool"` has nothing it can reliably draw. Requiring a normalised
 * triple means an unknown type still renders a sane card, which is the
 * difference between an open standard and a closed union of the types we
 * happened to ship a renderer for.
 *
 * It is the same reason every media container format carries a title.
 */
export const baseMetadata = z.object({
  /** What to call this, in the reader's words. */
  name: z.string().min(1).max(80),
  /** A square-ish image URL. Empty is legal; the card falls back to a glyph. */
  image: z.string().max(2048).default(""),
  /** One line under the name. */
  tagline: z.string().max(140).default(""),
});

export type BaseMetadata = z.infer<typeof baseMetadata>;

/**
 * What a record looks like BEFORE we know whether we understand its type.
 *
 * Parsed first, always. A consumer must be able to render a payload written by
 * a newer publisher than itself, and that is only possible if the envelope is
 * validated separately from the type-specific half.
 */
export const sponsorEnvelope = z.object({
  v: z.number().int().positive(),
  type: z.string().min(1).max(40),
  data: z.unknown(),
  metadata: baseMetadata.passthrough(),
});

export type SponsorEnvelope = z.infer<typeof sponsorEnvelope>;

/** Chains a pointer may name. Kept small and explicit rather than any number. */
export const SUPPORTED_CHAINS = [
  { id: 1, label: "Ethereum" },
  { id: 8453, label: "Base" },
  { id: 42161, label: "Arbitrum" },
  { id: 10, label: "Optimism" },
  { id: 11155111, label: "Sepolia" },
] as const;

export const chainId = z
  .number()
  .int()
  .refine(
    (n) => SUPPORTED_CHAINS.some((c) => c.id === n),
    "Unsupported chain",
  );

/** An 0x-prefixed 20-byte address, checked for shape only. */
export const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Not an address");

/** A full http(s) URL. */
export const httpUrl = z
  .string()
  .url("A full https:// URL is required")
  .refine((u) => /^https?:\/\//i.test(u), "Must be http or https");
