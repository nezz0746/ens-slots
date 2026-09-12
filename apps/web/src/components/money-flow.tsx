import { ArrowRight } from "lucide-react";

/**
 * Two names, their slots, and where the money ends up.
 *
 * ── What the colours mean, and why they are load-bearing ────────────────────
 *
 * Three protocols touch every row on this page and the question a reader
 * actually has is "which of these is yours?". So each layer gets one colour and
 * keeps it everywhere, including in {SlotNameAnatomy} above:
 *
 *   ENS blue   the NAME. An ordinary ENSv2 registration.
 *   magenta    the MARKET. A 0xSlots slot: a price, a tax, a holder.
 *   ink        NAMESLOTS. The contract in the middle, and the only part of
 *              this diagram we wrote.
 *
 * ── Why two namespaces and not one ──────────────────────────────────────────
 *
 * One would read as "the system", and the thing most worth understanding is
 * that there is no system — there is a namespace per name, each with its own
 * owner, its own money, and no connection to the other. Two side by side say
 * that without a sentence. The vacant row is there for the same reason: a slot
 * with nobody in it is a normal state, not a failure.
 *
 * The figures are illustrative. Nothing here reads the chain: this is a diagram
 * on an explainer page, and a live one would turn a fixed picture into a
 * loading state that sometimes says nothing at all.
 */

type Slot = {
  label: string;
  holder: string;
  tax: number;
};

type Namespace = {
  parent: string;
  owner: string;
  slots: Slot[];
};

const NAMESPACES: Namespace[] = [
  {
    parent: "l2beat.eth",
    owner: "0x26bB…b113",
    slots: [
      { label: "base", holder: "0xA1c4…9f2e", tax: 120 },
      { label: "app", holder: "0xB27d…4c11", tax: 40 },
      { label: "docs", holder: "", tax: 0 },
    ],
  },
  {
    parent: "france.eth",
    owner: "0x8f31…02aa",
    slots: [
      { label: "paris", holder: "0xC3e9…77b0", tax: 90 },
      { label: "lyon", holder: "0xD4a2…1e63", tax: 30 },
    ],
  },
];

const LEGEND = [
  { dot: "bg-brand", name: "ENSv2", what: "the names" },
  { dot: "bg-hot", name: "0xSlots", what: "the markets" },
  { dot: "bg-ink", name: "Nameslots", what: "the bit in the middle" },
];

function Money({ amount }: { amount: number }) {
  return (
    <span className="text-hot tabular-nums">
      ${amount}
      <span className="text-ink-faint">/mo</span>
    </span>
  );
}

export function MoneyFlow() {
  return (
    <figure className="my-8">
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {LEGEND.map((l) => (
          <span key={l.name} className="flex items-center gap-1.5 text-xs">
            <span className={`size-2.5 rounded-full ${l.dot}`} />
            <span className="font-semibold text-ink">{l.name}</span>
            <span className="text-ink-faint">{l.what}</span>
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {NAMESPACES.map((ns) => {
          const total = ns.slots.reduce((sum, s) => sum + s.tax, 0);

          return (
            <div
              key={ns.parent}
              // `flex-col` with the rows growing: the two cards hold a
              // different number of slots, and without this their dark footers
              // sat at different heights — which reads as the two namespaces
              // being different KINDS of thing rather than the same thing
              // twice.
              className="flex flex-col overflow-hidden rounded-card border border-line bg-surface"
            >
              <div className="flex items-baseline justify-between gap-3 border-b border-line bg-canvas px-4 py-3">
                <span className="text-lg font-bold tracking-tight text-brand">
                  {ns.parent}
                </span>
                <span className="text-[11px] text-ink-faint">
                  an ENS name somebody owns
                </span>
              </div>

              <ul className="flex-1 divide-y divide-line-soft">
                {ns.slots.map((slot) => (
                  <li
                    key={slot.label}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="truncate">
                      <span className="font-semibold text-hot">
                        {slot.label}
                      </span>
                      <span className="text-ink-faint">.{ns.parent}</span>
                    </span>
                    {slot.holder ? (
                      <span className="flex shrink-0 items-center gap-3 text-xs">
                        <span className="font-mono text-ink-soft">
                          {slot.holder}
                        </span>
                        <Money amount={slot.tax} />
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-ink-faint italic">
                        nobody — open to anyone
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {/* The whole point of the picture: many holders, one collector,
                  one payout, and the payout is decided by who holds the name
                  at the top of this card rather than by anything stored. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-line bg-ink px-4 py-3 text-xs text-white">
                <span className="font-semibold">SlotNamespace</span>
                <span className="text-white/60">collects</span>
                <span className="font-semibold tabular-nums text-hot-soft">
                  ${total}/mo
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-white/50" />
                <span className="font-mono">withdraw()</span>
                <ArrowRight className="size-3.5 shrink-0 text-white/50" />
                <span className="font-mono text-brand-soft">{ns.owner}</span>
              </div>
            </div>
          );
        })}
      </div>

      <figcaption className="mt-3 text-xs leading-relaxed text-ink-faint">
        Two names, two namespaces, two owners, and no connection between them.
        The only shared pieces are a factory that lists every namespace and one
        resolver that answers for all of them — both{" "}
        <span className="font-semibold text-ink">Nameslots</span>. The names are{" "}
        <span className="font-semibold text-brand">ENSv2</span>; the prices and
        the tax are <span className="font-semibold text-hot">0xSlots</span>.
      </figcaption>
    </figure>
  );
}
