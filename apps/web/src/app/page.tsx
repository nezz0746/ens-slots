"use client";

import Link from "next/link";

import { NamespaceRow } from "@/components/namespace-row";
import { useNamespaces } from "@/hooks/use-namespaces";
import { useProfiles } from "@/hooks/use-profile";
import { useIsDeployed } from "@/hooks/use-addresses";

/**
 * Every parent name with at least one slotted subname.
 *
 * The list comes from the factory rather than from an indexer, which is the
 * only reason the factory exists — resolution in ENS only ever walks DOWN from
 * the root, so there is no way to ask "which names have subnames like this"
 * without something recording it.
 */
export default function Home() {
  const isDeployed = useIsDeployed();
  const { namespaces, isLoading } = useNamespaces();

  // Every parent's own ENS records, so the list can say who these people are
  // rather than only what they have opened.
  const { profiles, isLoading: loadingProfiles } = useProfiles(namespaces);

  return (
    <div className="space-y-8">
      {/*
       * The pitch and the proof, side by side.
       *
       * The snippet is the whole argument for doing this on ENS rather than in
       * a database: asking who holds a name is `getEnsAddress`, with no SDK, no
       * API key and no contract address in sight. Saying that in prose asks to
       * be taken on trust; three lines of viem can be pasted into a console.
       */}
      <section className="grid items-center gap-8 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-4">
          {/* Steps up rather than jumping: 3rem is a headline on a laptop and
              a wall of text on a phone, so the small screen keeps the old size. */}
          <h1 className="max-w-2xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
            <span className="text-brand">Taxable</span> subnames
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
            Open subnames of a name you own. Whoever holds one sets what it is
            worth and pays tax on that number for as long as they keep it —
            which is also the price anyone can take it from them at. Nothing can
            be squatted, and the name resolves through plain ENS.
          </p>
        </div>

        <Snippet />
      </section>

      {!isDeployed ? (
        <Empty>
          No deployment found. Run{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 text-[13px]">
            pnpm dev:local
          </code>{" "}
          from the repo root.
        </Empty>
      ) : /*
         * The skeleton also covers the PROFILE reads, not just the chain ones.
         *
         * They are two queries and the second cannot start until the first has
         * returned — it is keyed by the namespaces it describes. Showing cards
         * the moment the chain answered therefore guaranteed a frame of plain
         * cards followed by every one of them growing by a banner, a
         * description and a link as the ENS reads landed: roughly 180px of
         * reflow under whatever the reader had just moved their cursor to.
         */
      (isLoading && namespaces.length === 0) || loadingProfiles ? (
        <div className="divide-y divide-line-soft overflow-hidden rounded-[--radius-card] border border-line bg-surface">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <div className="size-10 shrink-0 animate-pulse rounded-lg bg-line-soft" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-40 animate-pulse rounded bg-line-soft" />
                <div className="h-2.5 w-64 animate-pulse rounded bg-line-soft" />
              </div>
            </div>
          ))}
        </div>
      ) : namespaces.length === 0 ? (
        <Empty>
          Nobody has opened a namespace yet.{" "}
          <Link href="/register" className="text-brand hover:underline">
            Open the first one
          </Link>
          .
        </Empty>
      ) : (
        <div className="divide-y divide-line-soft overflow-hidden rounded-[--radius-card] border border-line bg-surface">
          {namespaces.map((ns) => (
            <NamespaceRow
              key={ns.address}
              namespace={ns}
              profile={profiles[ns.address]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * How another app asks who holds one of these names.
 *
 * Deliberately not a call to anything in this repo. Occupancy is answered by
 * `addr()` through an ordinary resolver, so the whole integration is a lookup
 * any client already knows how to do — which is the point, and is only
 * convincing if the code on the page has no import from us in it.
 */
function Snippet() {
  const lines: [string, string][] = [
    ["k", "const"],
    ["p", " holder = "],
    ["k", "await"],
    ["p", " client.getEnsAddress({\n"],
    ["p", "  name: "],
    ["s", '"base.l2beat.eth"'],
    ["p", ",\n});\n\n"],
    ["c", "// → 0x7099…79C8 — whoever holds it right now"],
  ];

  return (
    <div className="overflow-hidden rounded-[--radius-card] border border-line bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line-soft px-3 py-2">
        <span className="size-2 rounded-full bg-line" />
        <span className="size-2 rounded-full bg-line" />
        <span className="size-2 rounded-full bg-line" />
        <span className="ml-1 text-[10px] text-ink-faint">viem · no SDK</span>
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed">
        <code>
          {lines.map(([tone, text], i) => (
            <span
              key={i}
              className={
                tone === "k"
                  ? "text-brand"
                  : tone === "s"
                    ? "text-good"
                    : tone === "c"
                      ? "text-ink-faint"
                      : "text-ink-soft"
              }
            >
              {text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[--radius-card] border border-dashed border-line bg-surface p-10 text-center text-sm text-ink-soft">
      {children}
    </div>
  );
}
