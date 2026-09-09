import { z } from "zod";

/**
 * The text record key everything here lives under.
 *
 * Reverse-DNS on `ethglobal.com`, which is ENSIP-5's convention for keys
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
export const RECORD_KEY = "com.ethglobal.sponsor";

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
/** A scheme, as URLs spell one: a letter then letters, digits, `+`, `-`, `.`. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * What somebody typed, as a URL.
 *
 * ── Why the scheme is optional ────────────────────────────────────────────
 *
 * Nobody types `https://`. They type `splits.org`, or they paste something
 * that already has one. Demanding the scheme rejected the most natural input a
 * form can receive, with an error about a prefix rather than about the address
 * — so a missing one is filled in rather than complained about.
 *
 * ── Why only http and https ───────────────────────────────────────────────
 *
 * The value is written into a public record and handed to whatever renders it,
 * which will put it in an `href`. `javascript:` and `data:` are URLs by every
 * definition and neither belongs in one, so anything carrying a scheme has to
 * carry one of two. A bare host gets `https://`, never `http://`: guessing the
 * insecure one on somebody's behalf is not a guess worth making.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const httpUrl = z
  .string()
  .trim()
  .min(1, "An address is required")
  .transform(normalizeUrl)
  .refine(
    (u) => /^https?:\/\//i.test(u),
    "Only http and https addresses can be published",
  )
  .refine((u) => {
    try {
      // A hostname with a dot and no spaces. `new URL` alone accepts
      // `https://nonsense`, which is a valid URL and not an address anybody
      // can reach.
      const { hostname } = new URL(u);
      return hostname.includes(".") && !/\s/.test(hostname);
    } catch {
      return false;
    }
  }, "That does not look like a web address");
