"use client";

import {
  RECORD_KEY,
  parseSponsorRecord,
  type SponsorRecord,
} from "@ens-slots/sponsor";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Send,
} from "lucide-react";
import {
  Children,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount } from "wagmi";

import { SponsorCard } from "@/components/sponsor-card";
import { SponsorEditor } from "@/components/sponsor-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Namespace, Subname } from "@/hooks/use-namespaces";
import { useSponsorRecord, useTextRecords } from "@/hooks/use-sponsor";
import { useTx } from "@/hooks/use-tx";
import { namespaceAbi } from "@/lib/abis";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * What the name IS, as opposed to what it costs.
 *
 * Split out of the panel so the two questions a visitor has — "what is this"
 * and "can I have it" — stop competing for the same column. Everything here is
 * resolution: the holder, the records, the payload. Everything in the auction
 * column is the market.
 */
export function NameDetails({
  namespace,
  subname,
}: {
  namespace: Namespace;
  subname: Subname;
}) {
  const { address } = useAccount();
  const name = `${subname.label}.${namespace.parentName}`;

  const state = subname.state;
  const isOccupant =
    !!address &&
    !!state &&
    state.occupant.toLowerCase() === address.toLowerCase();
  const vacant = !state || state.isVacant;

  const { data: sponsor } = useSponsorRecord({
    name,
    namespace: namespace.address,
    node: subname.node,
  });
  const record = sponsor?.record ?? null;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-xl font-semibold tracking-tight">
            {subname.label}
            <span className="text-ink-faint">.{namespace.parentName}</span>
          </h2>
        </div>
        <p className="text-xs text-ink-faint">
          {vacant ? (
            "Nobody holds this"
          ) : (
            <>
              Held by{" "}
              <span className="font-medium text-ink-soft">
                {isOccupant ? "you" : shortAddress(state?.occupant)}
              </span>
            </>
          )}
        </p>
      </header>

      <Records
        name={name}
        namespace={namespace.address}
        node={subname.node}
        occupant={vacant ? undefined : state?.occupant}
        canEdit={isOccupant}
        record={record}
        raw={sponsor?.raw}
        via={sponsor?.via}
      />
    </div>
  );
}

/**
 * Every record on the name, and one transaction to change them.
 *
 * ── Staged, not sent ──────────────────────────────────────────────────────
 *
 * Editing a row writes into a local draft; nothing reaches the chain until
 * "Publish" at the bottom, which sends the whole set through `setTexts`. The
 * alternative — a signature per field — made a profile of eight records eight
 * wallet prompts, and left the name half-updated whenever somebody stopped
 * approving halfway.
 *
 * ── One pane sliding over another ─────────────────────────────────────────
 *
 * The editor takes the whole column rather than expanding a row, because the
 * fields for a sponsor payload are taller than the list itself and pushing the
 * rest down loses the reader's place. Sliding keeps the list one gesture away
 * and makes clear the editor is a detour rather than a new screen.
 */
function Records({
  name,
  namespace,
  node,
  occupant,
  canEdit,
  record,
  raw,
  via,
}: {
  name: string;
  namespace: `0x${string}`;
  node: `0x${string}`;
  occupant?: `0x${string}`;
  canEdit: boolean;
  record?: SponsorRecord | null;
  raw?: string;
  via?: "ens" | "contract";
}) {
  const { data: texts } = useTextRecords({ name });
  const { send, pending, error } = useTx();
  const queryClient = useQueryClient();

  /** key → the value staged for it. Absent means unchanged. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);

  /**
   * Focus follows the pane.
   *
   * Closing the editor makes the pane it was in inert, and focus inside an
   * inert subtree falls to the document — so a keyboard user who saved a
   * record would land back at the top of the page. Putting it on the row they
   * just edited is where they were, and where the next Tab should carry on
   * from.
   *
   * `preventScroll` for the same reason the field above uses it: at the
   * moment focus moves, the list is still a pane-width off to the side, and
   * the browser would scroll the page to chase it.
   */
  const rows_ = useRef<HTMLDListElement>(null);
  const wasEditing = useRef<string | null>(null);
  useEffect(() => {
    const closed = wasEditing.current && !editing;
    const key = wasEditing.current;
    wasEditing.current = editing;
    if (!closed || !key) return;
    rows_.current
      ?.querySelector<HTMLButtonElement>(`[data-key="${CSS.escape(key)}"]`)
      ?.focus({ preventScroll: true });
  }, [editing]);

  const onChain: Record<string, string> = Object.fromEntries(
    (texts ?? []).map((r) => [r.key, r.value]),
  );
  onChain[RECORD_KEY] = record ? JSON.stringify(record) : "";

  const rows = [
    ...(texts ?? []).map((r) => r.key),
    RECORD_KEY,
  ];

  const valueOf = (key: string) => drafts[key] ?? onChain[key] ?? "";
  const changed = Object.keys(drafts);

  async function publish() {
    if (!changed.length) return;
    const ok = await send("records", {
      address: namespace,
      abi: namespaceAbi,
      functionName: "setTexts",
      args: [node, changed, changed.map((k) => drafts[k])],
    });
    if (!ok) return;
    // Re-read now rather than on the next poll, so the list stops showing
    // "changed" badges for values the chain already agrees with.
    await queryClient.invalidateQueries({ queryKey: ["text-records"] });
    await queryClient.invalidateQueries({ queryKey: ["sponsor"] });
    await queryClient.invalidateQueries({ queryKey: ["sponsor-records"] });
    setDrafts({});
  }

  return (
    <section className="space-y-2">
      <p className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
        Records
      </p>

      <Slider showingDetail={editing !== null}>
        {/* ── the list ── */}
        <dl
          ref={rows_}
          className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line"
        >
          {rows.map((key) => {
            const isSponsor = key === RECORD_KEY;
            const value = valueOf(key);
            const dirty = key in drafts;
            return (
              <RecordRow
                key={key}
                label={key}
                value={value}
                dirty={dirty}
                sponsor={isSponsor}
                record={isSponsor ? draftedRecord(value, record) : undefined}
                onClick={canEdit ? () => setEditing(key) : undefined}
              />
            );
          })}
          <RecordRow label="eth" value={occupant ?? ""} mono empty="nobody holds this" />
        </dl>

        {/* ── the editor for one record ── */}
        {editing !== null && (
          <FieldEditor
            recordKey={editing}
            value={valueOf(editing)}
            current={
              editing === RECORD_KEY
                ? draftedRecord(valueOf(editing), record)
                : undefined
            }
            raw={editing === RECORD_KEY ? raw : undefined}
            via={via}
            onCancel={() => setEditing(null)}
            onSave={(next) => {
              setDrafts((d) =>
                next === (onChain[editing] ?? "")
                  ? // Typed back to what the chain already says: not a change,
                    // and leaving it staged would publish a no-op write.
                    Object.fromEntries(
                      Object.entries(d).filter(([k]) => k !== editing),
                    )
                  : { ...d, [editing]: next },
              );
              setEditing(null);
            }}
          />
        )}
      </Slider>

      {canEdit && (
        <div className="space-y-2">
          <Button
            className="w-full"
            disabled={!changed.length || !!pending}
            onClick={publish}
          >
            <Send />
            {pending === "records"
              ? "Publishing…"
              : changed.length
                ? `Publish ${changed.length} change${changed.length > 1 ? "s" : ""}`
                : "No changes"}
          </Button>
          {!!changed.length && !pending && (
            <p className="text-center text-[10px] text-ink-faint">
              One transaction, whatever you changed
            </p>
          )}
          {error && <p className="text-[11px] text-hot">{error}</p>}
        </div>
      )}
    </section>
  );
}

/** A staged sponsor payload, parsed — falling back to what is published. */
function draftedRecord(value: string, published?: SponsorRecord | null) {
  if (!value) return null;
  return parseSponsorRecord(value) ?? published ?? null;
}

/**
 * Two panes, one visible, sliding horizontally.
 *
 * ── Height follows the visible pane, measured twice over ──────────────────
 *
 * The two panes are different heights — the list is nine rows, the editor is
 * one field — so a container sized to the taller one leaves whichever is
 * showing floating above dead space. It has to be a number either way:
 * `height: auto` does not interpolate, so there would be no transition.
 *
 * The measurement happens in a layout effect on EVERY render, and again from
 * a ResizeObserver. Neither alone is enough:
 *
 *   - The observer misses the case that matters most here. The list renders
 *     short and grows when the records query lands, and observer callbacks
 *     are delivered during the rendering steps — which a hidden or
 *     backgrounded tab throttles to a stop. Left to the observer, a list
 *     opened in a background tab stayed frozen at its two-row height.
 *   - The layout effect misses everything React does not cause: an image
 *     arriving, a font swapping, the column being resized.
 *
 * So both, and `setHeight` with an unchanged number is a no-op React bails
 * out of, which is what keeps the every-render measurement from looping.
 *
 * ── The off-screen pane is inert, and the scroll is pinned ────────────────
 *
 * `overflow: hidden` stops a box painting outside itself; it does not stop it
 * SCROLLING. Focus something inside the half that is off to the right — the
 * editor's autofocused field is exactly that — and the browser scrolls the
 * container to bring it into view, setting `scrollLeft` to a pane's width on
 * top of the transform already moving the track. Slide back to the list and
 * the scroll stays behind: the container is 396px wide, showing content that
 * begins 396px to its left, so the records list renders as a blank box.
 *
 * `inert` on the hidden pane is the cause fixed — nothing in it can take
 * focus, so nothing asks to be scrolled to, and it leaves the accessibility
 * tree as well, which `aria-hidden` alone did while still letting a keyboard
 * tab into it. `onScroll` pinning the offset is the symptom fixed, for any
 * other route to the same place. The transform does the moving here; this box
 * has no business scrolling at all.
 */
function Slider({
  showingDetail,
  children,
}: {
  showingDetail: boolean;
  children: ReactNode;
}) {
  const [list, detail] = Children.toArray(children);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  /**
   * The height animates for a PANE SWITCH and for nothing else.
   *
   * Height changes for two very different reasons here, and only one of them
   * is worth animating. Switching to the editor is a move the reader asked
   * for. The other is content arriving: the list renders with one row while
   * the records query is in flight and grows to nine when it lands, so with
   * the transition always on, picking a name unfurled the whole column
   * downwards — every time, since {NameDetails} is keyed on the node and
   * choosing one remounts this.
   *
   * Guarding on "did the pane change" rather than on "is this the first
   * measurement" is what distinguishes them; the first measurement is not
   * reliably the last one, because the data has not arrived yet.
   */
  const [animate, setAnimate] = useState(false);
  const shown = useRef(showingDetail);

  // Cleared on a timer rather than on `transitionend`, which never fires in a
  // hidden tab — the flag would latch on and animate every later growth.
  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => setAnimate(false), 320);
    return () => clearTimeout(timer);
  }, [animate]);

  const active = showingDetail ? detailRef : listRef;

  // `offsetHeight` rather than `contentRect`, which excludes padding the pane
  // sets on itself.
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // Set beside the height, so both land in one commit: a transition that
    // arrived a frame later would have nothing left to animate.
    if (shown.current !== showingDetail) {
      shown.current = showingDetail;
      setAnimate(true);
    }
    if (active.current) setHeight(active.current.offsetHeight);
    if (box.current) box.current.scrollLeft = 0;
  });

  useEffect(() => {
    const el = active.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  return (
    <div
      ref={box}
      className={cn(
        "overflow-hidden",
        animate &&
          "transition-[height] duration-300 ease-out motion-reduce:transition-none",
      )}
      style={{ height }}
      onScroll={(e) => {
        e.currentTarget.scrollLeft = 0;
      }}
    >
      <div
        // `items-start`, not the default stretch. Stretch makes both panes as
        // tall as the taller one, so measuring either returns the same number
        // and the height stops following the visible pane.
        className="flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: showingDetail ? "translateX(-50%)" : "none" }}
      >
        <div className="w-1/2 shrink-0" ref={listRef} inert={showingDetail}>
          {list}
        </div>
        <div className="w-1/2 shrink-0" ref={detailRef} inert={!showingDetail}>
          {detail}
        </div>
      </div>
    </div>
  );
}

/** One row of the list. The sponsor one draws its payload rather than a string. */
function RecordRow({
  label,
  value,
  dirty,
  sponsor,
  record,
  mono,
  empty = "not set",
  onClick,
}: {
  label: string;
  value: string;
  dirty?: boolean;
  sponsor?: boolean;
  record?: SponsorRecord | null;
  mono?: boolean;
  empty?: string;
  onClick?: () => void;
}) {
  const body = (
    <div
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left",
        sponsor && "bg-brand-soft/40",
        onClick && "transition-colors hover:bg-canvas",
      )}
    >
      {/* 128px: `com.ethglobal.sponsor` measures 122 at this size and weight,
          and it is both the longest key in the profile and the one nobody
          should have to hover to read. */}
      <dt
        title={label}
        className={cn(
          "w-32 shrink-0 truncate text-[11px]",
          sponsor ? "font-medium text-brand-ink" : "text-ink-faint",
        )}
      >
        {label}
      </dt>
      <dd className="min-w-0 flex-1">
        {sponsor && record ? (
          <SponsorCard record={record} compact />
        ) : (
          <span
            className={cn(
              "block truncate text-[11px]",
              !value && "text-ink-faint",
              mono && value && "font-mono",
            )}
          >
            {value || empty}
          </span>
        )}
      </dd>
      {dirty && (
        <span className="shrink-0 rounded px-1 py-px text-[9px] font-semibold tracking-wide text-warn uppercase">
          edited
        </span>
      )}
      {onClick && <ChevronRight className="size-3.5 shrink-0 text-ink-faint" />}
    </div>
  );

  return onClick ? (
    <button
      type="button"
      data-key={label}
      onClick={onClick}
      className="block w-full"
    >
      {body}
    </button>
  ) : (
    body
  );
}

/** The form for one record. Saves into the draft, never to the chain. */
function FieldEditor({
  recordKey,
  value,
  current,
  raw,
  via,
  onSave,
  onCancel,
}: {
  recordKey: string;
  value: string;
  current?: SponsorRecord | null;
  raw?: string;
  via?: "ens" | "contract";
  onSave: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);

  /**
   * Focused by hand, and explicitly without scrolling.
   *
   * `autoFocus` fires as this pane mounts, while it is still sitting a full
   * pane-width off to the right — so the browser scrolled the PAGE sideways
   * to bring the field into view, and the transform then slid the field back
   * leaving the page 74px off centre. `preventScroll` takes the caret without
   * the scroll; the slide is what brings the field into view.
   */
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-[11px] text-ink-faint transition-colors hover:text-brand"
        >
          <ChevronLeft className="size-3.5" />
          Records
        </button>
        <code className="truncate text-[10px] text-ink-faint">{recordKey}</code>
      </div>

      {recordKey === RECORD_KEY ? (
        <>
          <SponsorEditor current={current} onStage={onSave} />
          {raw && <OnChain raw={raw} via={via} />}
        </>
      ) : (
        <div className="space-y-2">
          <Input
            ref={field}
            value={draft}
            placeholder={PLACEHOLDER[recordKey] ?? "value"}
            onChange={(e) => setDraft(e.target.value)}
            className="h-9"
          />
          <Button size="sm" className="w-full" onClick={() => onSave(draft)}>
            Use this
          </Button>
        </div>
      )}
    </div>
  );
}

/** What each key wants, in the words a person would recognise. */
const PLACEHOLDER: Record<string, string> = {
  avatar: "https://… or ipfs://…",
  header: "a banner image URL",
  description: "a sentence about this name",
  url: "splits.org",
  location: "where you are",
  email: "you@example.com",
  "com.github": "your handle",
  "com.twitter": "your handle, without the @",
};

/**
 * The bytes as any other client sees them.
 *
 * Kept because "resolves through plain ENS" is a claim, and a claim about
 * interoperability is worth nothing unless the reader can check it. This is
 * the exact string `getEnsText` returns — no SDK in the path.
 */
function OnChain({ raw, via }: { raw: string; via?: "ens" | "contract" }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-1 border-t border-line-soft pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 text-[10px] text-ink-faint transition-colors hover:text-ink"
      >
        <ChevronDown
          className={cn("size-3 transition-transform", !open && "-rotate-90")}
        />
        {new Blob([raw]).size} bytes ·{" "}
        {via === "ens" ? "resolved through ENS" : "read from the contract"}
      </button>
      {open && (
        <div className="relative">
          <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-canvas p-2 text-[10px] leading-relaxed break-all whitespace-pre-wrap">
            {JSON.stringify(JSON.parse(raw), null, 2)}
          </pre>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(raw);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="absolute top-1.5 right-1.5 rounded-md border border-line bg-surface p-1 text-ink-faint transition-colors hover:text-ink"
          >
            {copied ? (
              <Check className="size-3 text-good" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
