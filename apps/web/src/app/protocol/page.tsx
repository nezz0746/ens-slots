import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";

import { Mermaid } from "@/components/mermaid";
import { SlotNameAnatomy } from "@/components/slot-name-anatomy";
import { parseMarkdown, renderInline } from "@/lib/markdown";

/**
 * How it works — the protocol document, drawn.
 *
 * ── One source, not two ─────────────────────────────────────────────────────
 *
 * The page does not restate `docs/protocol.md`, it RENDERS it. A second copy of
 * these diagrams living in TSX would be a copy that goes stale, and the way it
 * would go stale is precisely the failure this project already had once: the
 * contracts changed, a description of them did not, and nothing connected the
 * two well enough to notice.
 *
 * ── Read at build time, deliberately ────────────────────────────────────────
 *
 * `force-static` makes this the only moment the file is opened. During a build
 * the whole repository is present and the working directory is this app, so the
 * path below resolves; in the container that later serves the page, neither is
 * guaranteed. Baking the markdown into the output means the page cannot fail in
 * production for a reason that has nothing to do with production.
 *
 * If the file moves, the build fails loudly here rather than shipping a page
 * that renders nothing.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "How it works — Nameslots",
  description:
    "What a slot name is, and the three contracts behind it.",
};

const DOC = join(process.cwd(), "..", "..", "docs", "protocol.md");

/**
 * The page renders the document up to this marker and stops.
 *
 * ── Why a marker and not two documents ──────────────────────────────────────
 *
 * `docs/protocol.md` has five diagrams: what exists, opening a namespace,
 * resolution, value, and the terms lifecycle. All five belong in the repository
 * — somebody reading the code needs the call ordering. None of the last four
 * belong on a page whose reader has not yet been told what the thing IS.
 *
 * Splitting them into two files would be two files to keep true, which is the
 * failure this page was built to avoid. One document, and the page knows where
 * a visitor stops caring.
 */
const PAGE_ENDS_AT = "page-ends-here";

export default function ProtocolPage() {
  const all = parseMarkdown(readFileSync(DOC, "utf8"));

  // From the first section heading, not from the top: the document opens with
  // its own title and a line listing all five diagrams, which is an accurate
  // description of the FILE and a wrong one for this page. The page says what
  // it is itself, just below.
  const start = all.findIndex((b) => b.kind === "heading" && b.level === 2);
  const stop = all.findIndex(
    (b) => b.kind === "comment" && b.text === PAGE_ENDS_AT,
  );
  // Missing markers show more rather than less: losing the cut is a long page,
  // losing the document is a blank one.
  const blocks = all.slice(
    start === -1 ? 0 : start,
    stop === -1 ? undefined : stop,
  );

  return (
    <article className="mx-auto w-full max-w-5xl px-5 py-10 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        How it works
      </h1>
      <p className="mt-2 max-w-2xl leading-relaxed text-ink-soft">
        A subname of a name you own, opened to a market. Here is what that
        means, and what it is built on.
      </p>

      {/* Before anything else: a reader who leaves after four seconds should
          still have learnt what a slot name is. The contract graph below is for
          the ones who stay. */}
      <SlotNameAnatomy />

      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading":
            return (
              <h2
                key={i}
                className="mt-12 mb-3 text-xl font-semibold tracking-tight text-ink"
              >
                {renderInline(block.text)}
              </h2>
            );

          case "paragraph":
            return (
              <p key={i} className="my-3 leading-relaxed text-ink-soft">
                {renderInline(block.text)}
              </p>
            );

          case "comment":
            return null;

          case "rule":
            // The document uses rules to separate sections, and the headings
            // already do that here with space. Drawing both is a ladder.
            return null;

          case "code":
            if (block.lang === "mermaid") {
              return <Mermaid key={i} chart={block.text} />;
            }
            return (
              <pre
                key={i}
                className="my-4 overflow-x-auto rounded-card border border-line bg-canvas px-4 py-3 font-mono text-xs leading-relaxed text-ink"
              >
                {block.text}
              </pre>
            );

          case "table":
            return (
              <div
                key={i}
                className="my-5 overflow-x-auto rounded-card border border-line"
              >
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-canvas">
                    <tr>
                      {block.head.map((cell, c) => (
                        <th
                          key={c}
                          className="px-4 py-2.5 font-semibold whitespace-nowrap text-ink"
                        >
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-t border-line">
                        {row.map((cell, c) => (
                          <td
                            key={c}
                            className="px-4 py-2.5 align-top leading-relaxed text-ink-soft"
                          >
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </article>
  );
}
