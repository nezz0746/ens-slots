"use client";

import {
  encodeSponsorRecord,
  parseSponsorRecord,
  RECORD_KEY,
  SPONSOR_TYPE_LIST,
  type SponsorRecord,
  type SponsorType,
} from "@ens-slots/sponsor";
import {
  Coins,
  Droplets,
  Link2,
  Loader2,
  type LucideProps,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useState } from "react";

import { XLogo } from "@/components/icons/x-logo";
import { SponsorCard } from "@/components/sponsor-card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Publishing what a sponsoring space shows.
 *
 * ── Two steps, on purpose ─────────────────────────────────────────────────
 *
 * Enrich, then publish. They are separate because enrichment reaches out to
 * third-party hosts and can plausibly fail — a URL that does not load, an
 * index that has never seen a pool — and finding that out AFTER signing a
 * transaction would mean paying gas to store a broken pointer. The preview
 * between them is the point: what you see is drawn from the exact bytes about
 * to go on chain, by the same component that will draw it for everyone else.
 *
 * ── The form is the schema ────────────────────────────────────────────────
 *
 * Fields come from the type's own zod object, and a field annotated with
 * `withChoices` renders as a select. Nothing here lists field names, so adding
 * a type to the package adds it to this form with no edit — which is the same
 * argument the descriptor-driven hook form makes in 0xSlots.
 */
/**
 * The mark for each type.
 *
 * Here rather than in `@ens-slots/sponsor`, which describes what a record IS
 * and has no opinion about how it is drawn — a consumer rendering these on
 * their own site picks their own. Falls back to a link, which is what an
 * unrecognised pointer amounts to.
 */
const TYPE_ICON: Record<string, (p: LucideProps) => React.ReactNode> = {
  token: Coins,
  pool: Droplets,
  miniapp: Sparkles,
  post: XLogo,
  url: Link2,
};

export function SponsorEditor({
  current,
  onStage,
}: {
  /** What is staged or published right now, so the editor can open on it. */
  current?: SponsorRecord | null;
  /**
   * Hand the finished payload back as a string, rather than sending it.
   *
   * The editor stages; the page publishes. Every record on this name is
   * written by one `setTexts`, so a form that sent its own transaction would
   * be the one field that cost a signature to change — and would land before
   * the others, leaving the name half-updated if the batch were then declined.
   */
  onStage: (json: string) => void;
}) {

  const [type, setType] = useState<SponsorType>(
    (current?.known ? (current.type as SponsorType) : null) ??
      SPONSOR_TYPE_LIST[0].type as SponsorType,
  );
  /**
   * Opened on what is already published, not on an empty form.
   *
   * `data` is the original input the record was built from — the URL someone
   * pasted, the token address they typed — so it maps straight back onto the
   * fields. Starting blank made every edit a retype from memory: the values
   * were visible in the card two rows up and nowhere in the form meant to
   * change them.
   */
  const [values, setValues] = useState<Record<string, string>>(() =>
    current?.known && current.data && typeof current.data === "object"
      ? Object.fromEntries(
          Object.entries(current.data as Record<string, unknown>).map(
            ([k, v]) => [k, v == null ? "" : String(v)],
          ),
        )
      : {},
  );
  const [built, setBuilt] = useState<SponsorRecord | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const definition = SPONSOR_TYPE_LIST.find((d) => d.type === type)!;
  const fields = fieldsOf(definition.data);

  const ready = fields.every((f) => (values[f.name] ?? "").trim().length > 0);

  async function enrich() {
    setProblem(null);
    setEnriching(true);
    try {
      const data = Object.fromEntries(
        fields.map((f) => [
          f.name,
          f.numeric ? Number(values[f.name]) : values[f.name]?.trim(),
        ]),
      );

      const res = await fetch("/api/sponsor/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, data }),
      });
      const json = await res.json();
      if (!res.ok) {
        setProblem(json.error ?? "Could not read that");
        setBuilt(null);
        return;
      }
      // Round-tripped through the parser rather than trusted: the preview must
      // be drawn from something that survives the same check a reader applies,
      // or it is a preview of a record nobody else can read.
      setBuilt(parseSponsorRecord(encodeSponsorRecord(json)));
    } catch {
      setProblem("Could not reach the enrichment service");
      setBuilt(null);
    } finally {
      setEnriching(false);
    }
  }

  function stage() {
    if (!built) return;
    onStage(encodeSponsorRecord(built));
    setBuilt(null);
  }

  return (
    // No border or horizontal padding of its own: it now sits inside the
    // disclosure, which draws the frame. Keeping them gave the form a second
    // rule directly under the button's and inset it from the panel's column.
    <div className="space-y-3 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-ink-soft">
          What this space shows
        </p>
        <code className="truncate text-[10px] text-ink-faint">{RECORD_KEY}</code>
      </div>

      <div className="flex overflow-hidden rounded-lg border border-line">
        {SPONSOR_TYPE_LIST.map((d, i) => {
          const Icon = TYPE_ICON[d.type] ?? Link2;
          const active = d.type === type;
          return (
            <button
              key={d.type}
              type="button"
              title={d.hint}
              onClick={() => {
                setType(d.type as SponsorType);
                setValues({});
                setBuilt(null);
                setProblem(null);
              }}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 py-1.5 text-[10px] font-medium transition-colors",
                i > 0 && "border-l border-line-soft",
                active
                  ? "bg-brand text-white"
                  : "bg-surface text-ink-soft hover:bg-canvas",
              )}
            >
              <Icon className="size-3.5" />
              <span className="truncate">{d.label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-ink-faint">{definition.hint}</p>

      <div className="space-y-2">
        {fields.map((f) => (
          <div key={f.name} className="space-y-1">
            <Label htmlFor={`sponsor-${f.name}`}>{f.name}</Label>
            {f.choices ? (
              <select
                id={`sponsor-${f.name}`}
                value={values[f.name] ?? ""}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.name]: e.target.value }));
                  setBuilt(null);
                }}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
              >
                <option value="">Choose…</option>
                {f.choices.map((c) => (
                  <option key={String(c.value)} value={String(c.value)}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`sponsor-${f.name}`}
                value={values[f.name] ?? ""}
                placeholder={f.name === "url" ? "splits.org" : "0x…"}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.name]: e.target.value }));
                  setBuilt(null);
                }}
              />
            )}
          </div>
        ))}
      </div>

      <Button
        variant="secondary"
        disabled={!ready || enriching}
        onClick={enrich}
        className="w-full"
      >
        {enriching ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Wand2 />
        )}
        {enriching ? "Reading it…" : "Fetch details"}
      </Button>

      {problem && (
        <p className="rounded-xl bg-hot-soft px-3 py-2 text-[11px] text-hot">
          {problem}
        </p>
      )}

      {built && (
        <div className="space-y-2">
          <SponsorCard record={built} />
          <Button onClick={stage} className="w-full">
            <Send />
            Use this
          </Button>
        </div>
      )}

    </div>
  );
}

type Field = {
  name: string;
  numeric: boolean;
  choices?: ReadonlyArray<{ label: string; value: unknown }>;
};

/**
 * The fields of a type's `data` schema, read off the schema itself.
 *
 * `withChoices` hangs the options on the schema object, so a select and a text
 * input are told apart by the schema rather than by a list kept in the UI.
 */
// biome-ignore lint/suspicious/noExplicitAny: reaching into zod internals is the point
function fieldsOf(schema: any): Field[] {
  const shape = schema?.shape ?? schema?._def?.shape?.();
  if (!shape) return [];
  return Object.entries(shape).map(([name, field]) => {
    const f = field as { choices?: Field["choices"] };
    return {
      name,
      choices: f.choices,
      numeric: !!f.choices && typeof f.choices[0]?.value === "number",
    };
  });
}
