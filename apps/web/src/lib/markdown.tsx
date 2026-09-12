import type { ReactNode } from "react";

/**
 * Just enough Markdown to render `docs/protocol.md`.
 *
 * ── Why not a library ───────────────────────────────────────────────────────
 *
 * One document is rendered here, it lives in this repo, and it uses six
 * constructs. `react-markdown` plus `remark-gfm` is around 200KB to gain
 * footnotes, nested lists, autolinks and HTML passthrough that nothing on the
 * page uses — and HTML passthrough is a liability rather than a feature when
 * the whole point is that the source is ours.
 *
 * ── What it handles, and what it does on anything else ──────────────────────
 *
 * Headings, paragraphs, rules, tables, fenced code, and inline `code`,
 * **strong**, *emphasis* and [links](…). Anything it does not recognise comes
 * out as literal text rather than being dropped, so an unsupported construct
 * looks wrong on the page and gets noticed, instead of silently disappearing
 * from a document about how the protocol works.
 */

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "rule" }
  | { kind: "code"; lang: string; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  /** An HTML comment. Invisible in Markdown, and a place to leave a marker. */
  | { kind: "comment"; text: string };

/** Split a Markdown document into blocks, fenced code first so nothing inside
 *  a fence is ever interpreted. */
export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      blocks.push({ kind: "code", lang, text: body.join("\n") });
      continue;
    }

    if (/^-{3,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      continue;
    }

    // A single-line HTML comment. Kept as a block rather than dropped, because
    // the page slices on one — see PAGE_ENDS_AT in the protocol route.
    const comment = /^<!--\s*(.*?)\s*-->$/.exec(line.trim());
    if (comment) {
      blocks.push({ kind: "comment", text: comment[1] });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      continue;
    }

    // A table is a header row, a delimiter row, then body rows. The delimiter
    // is what tells it apart from a paragraph that happens to contain pipes.
    if (line.startsWith("|") && lines[i + 1] && /^\|[\s:|-]+\|$/.test(lines[i + 1])) {
      const cells = (row: string) =>
        row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    if (line.trim() === "") continue;

    // Everything else is a paragraph, running until a blank line. Soft-wrapped
    // source lines join with a space, the way Markdown means them.
    const para: string[] = [line];
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() !== "" &&
      !lines[i + 1].startsWith("```") &&
      !lines[i + 1].startsWith("#") &&
      !lines[i + 1].startsWith("|") &&
      !/^-{3,}\s*$/.test(lines[i + 1])
    ) {
      para.push(lines[++i]);
    }
    blocks.push({ kind: "paragraph", text: para.join(" ").trim() });
  }

  return blocks;
}

/**
 * Inline spans: `code`, **strong**, *em*, [text](href).
 *
 * One regex with alternation, so the scan is left to right and a construct
 * cannot be nested inside another by accident — the first match at a position
 * wins and the cursor moves past it.
 */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));

    const token = m[0];
    if (token.startsWith("`")) {
      out.push(
        <code
          key={key++}
          className="rounded bg-canvas px-1 py-0.5 font-mono text-[0.9em] text-brand-ink"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={key++} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      out.push(
        link ? (
          <a
            key={key++}
            href={link[2]}
            target={link[2].startsWith("http") ? "_blank" : undefined}
            rel={link[2].startsWith("http") ? "noreferrer" : undefined}
            className="text-brand underline underline-offset-2 hover:text-brand-ink"
          >
            {link[1]}
          </a>
        ) : (
          token
        ),
      );
    } else {
      out.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = at + token.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}
