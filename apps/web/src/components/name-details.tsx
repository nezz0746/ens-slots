"use client";

import { RECORD_KEY, type SponsorRecord } from "@ens-slots/sponsor";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus } from "lucide-react";
import { useState } from "react";
import { useAccount } from "wagmi";

import { SponsorCard } from "@/components/sponsor-card";
import { SponsorEditor } from "@/components/sponsor-editor";
import { Badge } from "@/components/ui/badge";
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
          {subname.sponsoring && <Badge tone="brand">Sponsoring</Badge>}
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

      <Sponsor
        record={record}
        raw={sponsor?.raw}
        via={sponsor?.via}
        sponsoring={subname.sponsoring}
        vacant={vacant}
      />

      {isOccupant && (
        <SponsorEditor
          namespace={namespace.address}
          node={subname.node}
          current={record}
        />
      )}

      <TextRecords
        name={name}
        namespace={namespace.address}
        node={subname.node}
        canEdit={isOccupant}
      />
    </div>
  );
}

/**
 * The payload, as drawn and as stored.
 *
 * Both, behind a toggle, because they answer different questions and a demo
 * that showed only the card would be asking to be taken on trust. The raw tab
 * is the bytes on chain — what any other client gets back from `getEnsText`,
 * and the thing that makes "no SDK required" checkable rather than claimed.
 */
function Sponsor({
  record,
  raw,
  via,
  sponsoring,
  vacant,
}: {
  record: SponsorRecord | null;
  raw?: string;
  via?: "ens" | "contract";
  sponsoring: boolean;
  vacant: boolean;
}) {
  const [tab, setTab] = useState<"rendered" | "raw">("rendered");
  const [copied, setCopied] = useState(false);

  if (!record) {
    if (!sponsoring) return null;
    return (
      <div className="rounded-xl border border-dashed border-line bg-canvas/60 px-3 py-5 text-center">
        <p className="text-xs font-medium text-ink-soft">
          {vacant ? "An empty sponsoring space" : "Nothing published yet"}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          Whoever holds it decides what appears here.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["rendered", "raw"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-medium capitalize transition-colors",
                t === tab
                  ? "bg-brand-soft text-brand-ink"
                  : "text-ink-faint hover:text-ink",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <code className="truncate text-[10px] text-ink-faint">{RECORD_KEY}</code>
      </div>

      {tab === "rendered" ? (
        <SponsorCard record={record} via={via} />
      ) : (
        <div className="relative">
          <pre className="max-h-64 overflow-auto rounded-xl border border-line bg-canvas p-3 text-[10px] leading-relaxed break-all whitespace-pre-wrap">
            {raw ? JSON.stringify(JSON.parse(raw), null, 2) : ""}
          </pre>
          <button
            type="button"
            onClick={() => {
              if (raw) navigator.clipboard?.writeText(raw);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="absolute top-2 right-2 rounded-md border border-line bg-surface p-1 text-ink-faint transition-colors hover:text-ink"
          >
            {copied ? (
              <Check className="size-3 text-good" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
          <p className="mt-1 text-[10px] text-ink-faint tabular-nums">
            {raw ? new Blob([raw]).size : 0} bytes ·{" "}
            {via === "ens" ? "resolved through ENS" : "read from the contract"}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * The name's other records, and a way to set one.
 *
 * Only the keys we know to ask about — see `KNOWN_TEXT_KEYS` for why a client
 * cannot list them. The editor takes a free-text key for the same reason: the
 * namespace vets nothing, so anything is writable, and a picker would imply a
 * restriction that does not exist.
 */
function TextRecords({
  name,
  namespace,
  node,
  canEdit,
}: {
  name: string;
  namespace: `0x${string}`;
  node: `0x${string}`;
  canEdit: boolean;
}) {
  const { data: records } = useTextRecords({ name });
  const { send, pending, error } = useTx();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const rows = records ?? [];

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
          Text records
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-1 text-[11px] text-ink-faint transition-colors hover:text-brand"
          >
            <Plus className="size-3" />
            Set one
          </button>
        )}
      </div>

      {rows.length > 0 ? (
        <dl className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line">
          {rows.map((r) => (
            <div key={r.key} className="flex gap-3 px-3 py-2">
              <dt className="w-24 shrink-0 truncate text-[11px] text-ink-faint">
                {r.key}
              </dt>
              <dd className="min-w-0 flex-1 truncate text-[11px]">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-3 py-3 text-[11px] text-ink-faint">
          None of the standard keys are set.
        </p>
      )}

      {open && canEdit && (
        <div className="space-y-2 rounded-xl border border-line bg-canvas/60 p-3">
          <Input
            value={key}
            placeholder="key — e.g. avatar, url, com.twitter"
            onChange={(e) => setKey(e.target.value)}
            className="h-9"
          />
          <Input
            value={value}
            placeholder="value"
            onChange={(e) => setValue(e.target.value)}
            className="h-9"
          />
          <Button
            size="sm"
            disabled={!key.trim() || !!pending}
            onClick={async () => {
              const ok = await send("text", {
                address: namespace,
                abi: namespaceAbi,
                functionName: "setText",
                args: [node, key.trim(), value],
              });
              if (ok) {
                // Refetch NOW rather than on the next poll. The write is
                // confirmed by the time `send` returns, so a list that still
                // said "none set" for another fifteen seconds read as the
                // transaction having failed.
                queryClient.invalidateQueries({ queryKey: ["text-records"] });
                setKey("");
                setValue("");
                setOpen(false);
              }
            }}
            className="w-full"
          >
            {pending === "text" ? "Saving…" : "Save record"}
          </Button>
          {error && <p className="text-[11px] text-hot">{error}</p>}
        </div>
      )}
    </section>
  );
}
