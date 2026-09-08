import { z } from "zod";

import { baseMetadata } from "./base";

export type FieldChoice<T> = { label: string; value: T };

/**
 * Annotate a schema with the choices a form should offer.
 *
 * The schema and its validation are untouched — this only tells a form builder
 * to render a `<select>` instead of a text field, so the editor can be driven
 * by the schema rather than by a parallel list of field descriptions that goes
 * stale the first time a type changes.
 */
export function withChoices<T extends z.ZodTypeAny>(
  schema: T,
  choices: ReadonlyArray<FieldChoice<z.infer<T>>>,
): T & { choices: ReadonlyArray<FieldChoice<z.infer<T>>> } {
  return Object.assign(schema, { choices });
}

/**
 * One sponsor type: a data contract, plus how to enrich it.
 *
 * ── Why `data` and `metadata` are separate ─────────────────────────────────
 *
 * `data` is what the sponsor actually typed — a chain and an address, or a
 * URL. It is sovereign: nobody else gets to change it.
 *
 * `metadata` is DERIVED from `data`, at publish time, by {enrich}. Names,
 * symbols, decimals, logos, titles, authors. Because it is reproducible, a
 * rotted logo URL or a renamed token can be re-derived without asking the
 * sponsor to retype anything — and flattening the two into one object would
 * destroy exactly that distinction, leaving no way to tell which half is
 * recoverable.
 *
 * ── What does NOT go in metadata ───────────────────────────────────────────
 *
 * Anything that moves. Price, TVL, 24h volume, floor, odds. The boundary is
 * volatility, not source: metadata is what stays true regardless of when you
 * look, so it can be frozen into a record that nobody rewrites for months.
 * Live figures are fetched by whoever renders, at the moment they render, and
 * never enter the record at all.
 *
 * That is what makes a record self-sufficient — resolve it and you can draw it,
 * with no call back to us. A record that needed our API to be readable would
 * quietly make us the infrastructure this whole design exists to avoid being.
 */
export type SponsorDefinition<
  TData extends z.ZodTypeAny,
  TMetadata extends z.ZodTypeAny,
> = {
  /** The literal discriminant stored in the record. */
  type: string;

  /** What to call this type in a picker. */
  label: string;

  /** One line explaining what the sponsor is pointing at. */
  hint: string;

  /** The sponsor's own input. */
  data: TData;

  /** Derived at publish time. Must extend {baseMetadata}. */
  metadata: TMetadata;

  /**
   * Checked once, before anything is written on chain.
   *
   * It does not make a record honest — a sponsor can put anything in their own
   * tagline — it stops a broken POINTER from landing on chain, where fixing it
   * costs another transaction. Throw to reject.
   */
  verify?: (data: z.infer<TData>) => Promise<void>;

  /** Derive the metadata. Runs server-side, at publish time only. */
  enrich: (data: z.infer<TData>) => Promise<z.infer<TMetadata>>;
};

/**
 * Lock the inference and hand back the definition with a `build` step.
 *
 * `build` is the whole publish pipeline — parse, verify, enrich — so the route
 * handler that writes a record cannot accidentally skip one of the three or
 * run them out of order.
 */
export function defineSponsor<
  const TData extends z.ZodTypeAny,
  const TMetadata extends z.ZodTypeAny,
>(def: SponsorDefinition<TData, TMetadata>) {
  return {
    ...def,
    async build(input: unknown) {
      const data = def.data.parse(input) as z.infer<TData>;
      await def.verify?.(data);
      const metadata = def.metadata.parse(
        await def.enrich(data),
      ) as z.infer<TMetadata>;
      return { data, metadata };
    },
  };
}

/** Every type's metadata extends the shared triple. */
export const extendBase = <T extends z.ZodRawShape>(shape: T) =>
  baseMetadata.extend(shape);
