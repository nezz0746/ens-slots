import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";

import { Mermaid } from "@/components/mermaid";
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
    "The protocol in five diagrams: what exists, opening a namespace, resolution, where the value goes, and how terms change.",
};

const DOC = join(process.cwd(), "..", "..", "docs", "protocol.md");

export default function ProtocolPage() {
  const blocks = parseMarkdown(readFileSync(DOC, "utf8"));

  return (
    <article className="mx-auto max-w-3xl px-5 py-10 lg:px-0">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading":
            if (block.level === 1) {
              return (
                <h1
                  key={i}
                  className="text-3xl font-semibold tracking-tight text-ink"
                >
                  {renderInline(block.text)}
                </h1>
              );
            }
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
