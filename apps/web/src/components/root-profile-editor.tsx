"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  ROOT_KEYS,
  useParentRecords,
  type RootKey,
} from "@/hooks/use-profile";
import { useTx } from "@/hooks/use-tx";
import { namespaceAbi } from "@/lib/abis";

/**
 * How each key is presented. The key itself is what goes on chain.
 *
 * ── Why a label and not the key ─────────────────────────────────────────────
 *
 * `org.telegram` is the string ENS stores and the string every other client
 * looks under, so it is what gets written — but it is a namespaced identifier,
 * not a word, and a form that asks for "org.telegram" is asking the writer to
 * know the schema. The placeholder carries the shape of the value, which is the
 * part that is actually ambiguous: a handle, a URL, or a URL with a scheme.
 */
const FIELDS: Record<
  RootKey,
  { label: string; placeholder: string; multiline?: boolean }
> = {
  avatar: { label: "Avatar", placeholder: "https://… or ipfs://…" },
  header: { label: "Banner", placeholder: "https://… or ipfs://…" },
  description: {
    label: "Description",
    placeholder: "What this namespace is for.",
    multiline: true,
  },
  url: { label: "Website", placeholder: "https://example.com" },
  "com.twitter": { label: "X", placeholder: "handle, without the @" },
  "com.github": { label: "GitHub", placeholder: "username" },
  "org.telegram": { label: "Telegram", placeholder: "username" },
};

/**
 * The namespace's own profile, editable by whoever opened it.
 *
 * ── One transaction, not seven ──────────────────────────────────────────────
 *
 * `setParentTexts` takes the keys and values as arrays, so a whole profile is
 * one signature. That is the same argument the subname editor makes for
 * `setTexts`: a prompt per field turns filling in a profile into seven wallet
 * confirmations, and leaves the name half-written the moment somebody stops
 * approving. The contract offers this natively, so there is nothing to batch by
 * hand — `multicall` is for mixes an array cannot express, like labels and a
 * profile together.
 *
 * ── Only what changed is sent ───────────────────────────────────────────────
 *
 * Untouched keys are left out of the arrays entirely rather than rewritten with
 * the value already there. Cheaper, and it keeps `ParentTextChanged` meaning
 * something changed — an indexer watching the log would otherwise see all seven
 * keys emitted every time somebody fixed a typo in one.
 *
 * An empty string is a real edit, not an absence: it is how ENS resolvers spell
 * "clear this record", and the contract stores it as such.
 */
export function RootProfileEditor({ address }: { address: `0x${string}` }) {
  const [open, setOpen] = useState(false);
  const { records, loaded, refetch } = useParentRecords(address);
  const { send, pending, error, clearError } = useTx();
  const queryClient = useQueryClient();

  /** key → the value staged for it. Absent means unchanged. */
  const [drafts, setDrafts] = useState<Partial<Record<RootKey, string>>>({});

  const changed = ROOT_KEYS.filter(
    (key) => key in drafts && drafts[key] !== records[key],
  );

  function close() {
    setOpen(false);
    setDrafts({});
    clearError();
  }

  async function save() {
    if (!changed.length) return;
    const ok = await send("profile", {
      address,
      abi: namespaceAbi,
      functionName: "setParentTexts",
      args: [changed, changed.map((key) => drafts[key] ?? "")],
    });
    if (!ok) return;

    // Re-read now rather than on the next poll, so the page stops showing the
    // values this transaction just replaced.
    await refetch();
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    close();
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Edit this namespace's own ENS records"
      >
        <Pencil />
        Edit profile
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title="Namespace profile"
        description="Ordinary ENS records on the parent name. One transaction."
        className="w-[min(30rem,calc(100vw-2rem))]"
      >
        {/*
         * Nothing to edit until the records are in hand.
         *
         * The fields fall back to the on-chain value, so rendering them before
         * the read lands would show seven empty boxes over seven populated
         * records — and typing in one and saving would carry those blanks with
         * it, wiping the rest.
         */}
        {!loaded ? (
          <div className="space-y-3">
            {ROOT_KEYS.map((key) => (
              <div key={key} className="space-y-1.5">
                <div className="h-3 w-16 animate-pulse rounded bg-line-soft" />
                <div className="h-10 w-full animate-pulse rounded-xl bg-line-soft" />
              </div>
            ))}
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {ROOT_KEYS.map((key) => {
              const field = FIELDS[key];
              const value = drafts[key] ?? records[key];
              const dirty = changed.includes(key);
              const set = (next: string) =>
                setDrafts((d) => ({ ...d, [key]: next }));

              return (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`root-${key}`} className="flex items-center gap-1.5">
                    {field.label}
                    {dirty && <span className="size-1.5 rounded-full bg-brand" />}
                    <span className="ml-auto font-normal text-ink-faint">
                      {key}
                    </span>
                  </Label>
                  {field.multiline ? (
                    <Textarea
                      id={`root-${key}`}
                      rows={3}
                      value={value}
                      placeholder={field.placeholder}
                      onChange={(e) => set(e.target.value)}
                    />
                  ) : (
                    <Input
                      id={`root-${key}`}
                      value={value}
                      placeholder={field.placeholder}
                      onChange={(e) => set(e.target.value)}
                    />
                  )}
                </div>
              );
            })}

            {error && (
              <p className="rounded-lg border border-hot/30 bg-hot-soft px-2.5 py-1.5 text-[11px] leading-snug text-hot">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-ink-faint">
                {changed.length === 0
                  ? "No changes yet."
                  : `${changed.length} record${changed.length > 1 ? "s" : ""} to write.`}
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!!pending || changed.length === 0}
                >
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
