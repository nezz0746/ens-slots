"use client";

import {
  encodeSponsorRecord,
  parseSponsorRecord,
  RECORD_KEY,
  SPONSOR_TYPE_LIST,
  type SponsorRecord,
  type SponsorType,
} from "@ens-slots/sponsor";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Wand2 } from "lucide-react";
import { useState } from "react";

import { SponsorCard } from "@/components/sponsor-card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useTx } from "@/hooks/use-tx";
import { namespaceAbi } from "@/lib/abis";
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
export function SponsorEditor({
  namespace,
  node,
  current,
}: {
  namespace: `0x${string}`;
  node: `0x${string}`;
  /** What is published right now, so the editor can open on it. */
  current?: SponsorRecord | null;
}) {
  const { send, pending, error } = useTx();
  const queryClient = useQueryClient();

  const [type, setType] = useState<SponsorType>(
    (current?.known ? (current.type as SponsorType) : null) ??
      SPONSOR_TYPE_LIST[0].type as SponsorType,
  );
  const [values, setValues] = useState<Record<string, string>>({});
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

  async function publish() {
    if (!built) return;
    const value = encodeSponsorRecord(built);
    const ok = await send("record", {
      address: namespace,
      abi: namespaceAbi,
      functionName: "setText",
      args: [node, RECORD_KEY, value],
    });
    if (ok) {
      // Both the panel's own read and the list's, so the row's type chip and
      // the card update together rather than a poll apart.
      queryClient.invalidateQueries({ queryKey: ["sponsor"] });
      queryClient.invalidateQueries({ queryKey: ["sponsor-records"] });
      setBuilt(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-line px-4 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-ink-soft">
          What this space shows
        </p>
        <code className="truncate text-[10px] text-ink-faint">{RECORD_KEY}</code>
      </div>

      <div className="flex flex-wrap gap-1">
        {SPONSOR_TYPE_LIST.map((d) => (
          <button
            key={d.type}
            type="button"
            onClick={() => {
              setType(d.type as SponsorType);
              setValues({});
              setBuilt(null);
              setProblem(null);
            }}
            className={cn(
              "rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors",
              d.type === type
                ? "border-brand bg-brand-soft text-brand-ink"
                : "border-line text-ink-soft hover:border-brand/40",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-ink-faint">{definition.hint}</p>

      <div className="space-y-2">
        {fields.map((f) => (
          <div key={f.name} className="space-y-1">
            <Label htmlFor={`${node}-${f.name}`}>{f.name}</Label>
            {f.choices ? (
              <select
                id={`${node}-${f.name}`}
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
                id={`${node}-${f.name}`}
                value={values[f.name] ?? ""}
                placeholder={f.name === "url" ? "https://…" : "0x…"}
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
          <p className="text-[11px] text-ink-faint">
            This is what everyone will see, drawn from the bytes below.
          </p>
          <SponsorCard record={built} />
          <p className="text-[10px] text-ink-faint tabular-nums">
            {new Blob([encodeSponsorRecord(built)]).size} bytes on chain
          </p>
          <Button
            disabled={!!pending}
            onClick={publish}
            className="w-full"
          >
            <Send />
            {pending === "record" ? "Publishing…" : "Publish"}
          </Button>
        </div>
      )}

      {error && <p className="text-[11px] text-hot">{error}</p>}
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
