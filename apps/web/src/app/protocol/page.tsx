import type { Metadata } from "next";

import { ResolutionChain } from "@/components/resolution-chain";
import { SlotNameAnatomy } from "@/components/slot-name-anatomy";

/**
 * How it works — two pictures and as few words as they need.
 *
 * ── Why this stopped rendering `docs/protocol.md` ───────────────────────────
 *
 * It used to render that document: five Mermaid diagrams of contracts calling
 * each other, sliced at a marker. The intent was one source of truth, and the
 * intent was right for the repository — that is still where those five live,
 * and GitHub draws them without help.
 *
 * It was wrong for a visitor. A call-ordering graph answers "how is this
 * built", and nobody arrives at a page called How it works asking that. They
 * ask what a slot name is and who gets the money. Those are two hand-drawn
 * pictures, and an auto-laid-out graph could not have been either of them.
 *
 * Dropping it also took `mermaid` — over a megabyte, for one route — and the
 * small Markdown reader that existed only to feed it, out of the app.
 */
export const metadata: Metadata = {
  title: "How it works — Nameslots",
  description: "What a slot name is, and where the money goes.",
};

export default function ProtocolPage() {
  return (
    <article className="mx-auto w-full max-w-5xl px-5 py-10 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        How it works
      </h1>

      <h2 className="mt-8 text-xl font-semibold tracking-tight text-ink">
        What is it?
      </h2>
      <p className="mt-2 max-w-2xl leading-relaxed text-ink-soft">
        Nameslots lets you turn precious or specialized subnames into fairly
        priced productive assets for your users, and revenue for you through an
        ownership tax.
      </p>
      <SlotNameAnatomy />

      <h2 className="mt-12 mb-1 text-xl font-semibold tracking-tight text-ink">
        What answers, and what gets paid
      </h2>
      <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
        Four contracts, in the order a name touches them. Read left to right for
        the answer; the money travels the same chain the other way.
      </p>
      <ResolutionChain />

      <p className="mt-10 max-w-2xl text-sm leading-relaxed text-ink-soft">
        The contracts, the call ordering and the terms lifecycle live in{" "}
        <a
          href="https://github.com/nezz0746/ens-slots/blob/main/docs/protocol.md"
          target="_blank"
          rel="noreferrer"
          className="text-brand underline underline-offset-2 hover:text-brand-ink"
        >
          docs/protocol.md
        </a>
        , which is the right place for them.
      </p>
    </article>
  );
}
