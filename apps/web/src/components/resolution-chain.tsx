import { ArrowDown, ArrowRight } from "lucide-react";

/**
 * The four contracts a slot name touches, in the order it touches them.
 *
 * ── What is deliberately not here ───────────────────────────────────────────
 *
 * Both factories. `SlotNamespaceFactory` and ENS's `VerifiableFactory` exist to
 * DEPLOY the boxes below, once, and then never appear again — a reader working
 * out what a name does does not meet them. Drawing them put two nodes and four
 * edges into the picture that answer a question nobody asked yet, which is most
 * of why the generated graph this replaces was unreadable.
 *
 * ── One colour per protocol ─────────────────────────────────────────────────
 *
 *   ENS blue   ENSv2 — the name and the registry it lives in
 *   magenta    0xSlots — the market: a price, a tax, a holder
 *   ink        Nameslots — the two contracts we wrote
 *
 * Held identically in {SlotNameAnatomy} above, so a colour means the same thing
 * on both pictures.
 */

type Tone = "ens" | "ours" | "slots";

const TONE: Record<Tone, { box: string; tag: string; label: string }> = {
  ens: {
    box: "border-brand/40 bg-brand-soft/30",
    tag: "bg-brand text-white",
    label: "ENSv2",
  },
  ours: {
    box: "border-ink/25 bg-ink/[0.04]",
    tag: "bg-ink text-white",
    label: "Nameslots",
  },
  slots: {
    box: "border-hot/40 bg-hot-soft/30",
    tag: "bg-hot text-white",
    label: "0xSlots",
  },
};

const CHAIN: { name: string; tone: Tone; does: string }[] = [
  {
    name: "UserRegistry",
    tone: "ens",
    does: "Holds base.l2beat.eth as a real ENS name, and says which resolver answers for it.",
  },
  {
    name: "SlotNamespaceResolver",
    tone: "ours",
    does: "Answers addr() and text() for every namespace. One contract, all of them.",
  },
  {
    name: "SlotNamespace",
    tone: "ours",
    does: "Owns the subname, keeps its records, and receives the tax.",
  },
  {
    name: "Slot",
    tone: "slots",
    does: "One per label. The price, the tax, and who is holding it right now.",
  },
];

function Box({ step }: { step: (typeof CHAIN)[number] }) {
  const tone = TONE[step.tone];
  return (
    <div className={`flex-1 rounded-xl border p-3 lg:min-w-0 ${tone.box}`}>
      <span
        className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase ${tone.tag}`}
      >
        {tone.label}
      </span>
      <p className="mt-1.5 text-[13px] leading-tight font-semibold break-words text-ink">
        {step.name}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-ink-soft">{step.does}</p>
    </div>
  );
}

/** Right on a wide screen, down on a narrow one — the chain turns a corner. */
function Step() {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center text-ink-faint"
    >
      <ArrowRight className="hidden size-4 lg:block" />
      <ArrowDown className="size-4 lg:hidden" />
    </div>
  );
}

export function ResolutionChain() {
  return (
    <figure className="my-8 space-y-4">
      <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
        <p className="mb-3 text-xs text-ink-faint">
          Somebody asks for{" "}
          <span className="font-semibold text-ink">base.l2beat.eth</span>
        </p>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-1.5">
          {CHAIN.map((step, i) => (
            <div
              key={step.name}
              className="flex flex-col gap-2 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-1.5"
            >
              <Box step={step} />
              {i < CHAIN.length - 1 && <Step />}
            </div>
          ))}
        </div>

        {/* The two directions, stated once. Reading right gets you an answer;
            reading left gets you paid, and they are the same chain. */}
        <div className="mt-4 grid gap-2 border-t border-line pt-3 text-[11px] sm:grid-cols-2">
          <p className="text-ink-soft">
            <ArrowRight className="mr-1 inline size-3 text-ink-faint" />
            <span className="font-semibold text-ink">
              addr() → 0xA1c4…9f2e
            </span>{" "}
            — whoever is holding it, read at the moment you ask.
          </p>
          <p className="text-ink-soft">
            <ArrowRight className="mr-1 inline size-3 rotate-180 text-ink-faint" />
            <span className="font-semibold text-hot">$120/mo in tax</span> flows
            back the other way, and{" "}
            <span className="font-mono">withdraw()</span> pays whoever owns{" "}
            <span className="font-semibold text-brand">l2beat.eth</span>.
          </p>
        </div>
      </div>

      {/* The empty case gets equal billing. A slot with nobody in it is the
          state every name starts in and returns to, and a diagram that only
          draws the happy path makes vacancy look like breakage. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-hot-soft bg-surface p-4">
          <p className="text-[10px] font-bold tracking-wide text-hot uppercase">
            While somebody holds it
          </p>
          <dl className="mt-2 space-y-1 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">addr()</dt>
              <dd className="font-mono text-ink">0xA1c4…9f2e</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Tax</dt>
              <dd className="text-hot tabular-nums">$120/mo to the owner</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Anyone else</dt>
              <dd className="text-ink">can buy it at $2,400</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-line bg-canvas p-4">
          <p className="text-[10px] font-bold tracking-wide text-ink-faint uppercase">
            While it is empty
          </p>
          <dl className="mt-2 space-y-1 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">addr()</dt>
              <dd className="font-mono text-ink-faint">0x0 — nothing</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Tax</dt>
              <dd className="text-ink-faint">none</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Anyone</dt>
              <dd className="text-ink">names their own price and takes it</dd>
            </div>
          </dl>
        </div>
      </div>

      <figcaption className="text-xs leading-relaxed text-ink-faint">
        The name itself never moves between people — it stays registered to{" "}
        <span className="font-semibold text-ink">SlotNamespace</span> the whole
        time. What changes hands is what it resolves to, so a turnover writes
        nothing to ENS and there is nothing about it that can fail.
      </figcaption>
    </figure>
  );
}
