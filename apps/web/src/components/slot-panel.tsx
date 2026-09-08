"use client";

import { ArrowRight, Coins, Gavel, LogOut, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract } from "wagmi";

import { RunwayChoice } from "@/components/runway-choice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { ValuationInput } from "@/components/valuation-input";
import type { Subname } from "@/hooks/use-namespaces";
import { useTx } from "@/hooks/use-tx";
import { slotAbi } from "@/lib/abis";
import { formatAmount } from "@/lib/format";
import {
  describeDays,
  MONTH_SECONDS,
  rentFor,
  runwaySeconds,
  runwayTone,
  TONE_LABEL,
  TONE_TEXT,
} from "@/lib/runway";
import { cn } from "@/lib/utils";

/**
 * The market for one name, filtered to what YOU can do about it.
 *
 * The panel has three faces and they are mutually exclusive, because the two
 * roles want different things and showing both at once is how a buy button
 * ends up next to a release button.
 *
 *   nobody holds it  → take it: a valuation and how long to fund
 *   somebody else    → take it FROM them, at a valuation at least theirs
 *   you hold it      → one form for valuation and escrow together, plus release
 *
 * Liquidate and collect sit outside that split: anyone may call them, and they
 * only appear when the chain says they would do something.
 *
 * What the name IS lives in {NameDetails}, one column over. The split is not
 * cosmetic: a visitor arrives asking two questions — what is this, and can I
 * have it — and answering both in one column made the second one push the
 * first off the screen the moment a form opened.
 */
export function SlotPanel({
  subname,
  onDone,
}: {
  subname: Subname;
  onDone?: () => void;
}) {
  const { address } = useAccount();
  const { send, pending, error } = useTx();
  const state = subname.state;

  const isOccupant =
    !!address &&
    !!state &&
    state.occupant.toLowerCase() === address.toLowerCase();
  const isVacant = !state || state.isVacant;

  return (
    <div>
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <h2 className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
          The market
        </h2>
        <Status subname={subname} />
      </header>

      {state && <Figures state={state} />}

      <div className="space-y-4 px-4 py-4">
        {isVacant ? (
          <TakeForm
            subname={subname}
            label="Take it"
            onDone={onDone}
            send={send}
            pending={pending}
          />
        ) : isOccupant ? (
          <HoldForm
            subname={subname}
            onDone={onDone}
            send={send}
            pending={pending}
          />
        ) : (
          <TakeForm
            subname={subname}
            label="Take it from them"
            onDone={onDone}
            send={send}
            pending={pending}
          />
        )}

        {error && (
          <p className="rounded-xl bg-hot-soft px-3 py-2 text-xs text-hot">
            {error}
          </p>
        )}
      </div>

      <Communal subname={subname} send={send} pending={pending} />
    </div>
  );
}

function Status({ subname }: { subname: Subname }) {
  const s = subname.state;
  if (!s) return null;
  if (s.isVacant) return <Badge tone="brand">Available</Badge>;
  if (s.isInsolvent) return <Badge tone="bad">Liquidatable</Badge>;
  const tone = runwayTone(s.secondsUntilLiquidation, s.minDepositSeconds);
  return (
    <Badge tone={tone === "safe" ? "good" : "warn"}>{TONE_LABEL[tone]}</Badge>
  );
}

/**
 * The three numbers the decision turns on, edge to edge.
 *
 * Valuation, what holding it costs per month, and how long the escrow lasts —
 * three because they are the whole trade in order: what you say it is worth,
 * what saying that costs you, how long you have paid for.
 *
 * Escrow and rate used to sit here too and were the wrong kind of true. The
 * rate is a constant of the namespace, the same on every row; and the escrow
 * only means anything divided by the rent, which is the runway. Four figures
 * where two were derivable made the row longer and the decision no clearer.
 *
 * Full-bleed with dividers rather than a padded box. Three figures in a box
 * inside a card is two frames around one row.
 */
function Figures({ state }: { state: NonNullable<Subname["state"]> }) {
  // The slot's own answer, not `runwaySeconds` on the deposit. They differ:
  // this one accounts for tax accrued since the last settlement, so it is the
  // number that decides an actual liquidation. Computing it here as well would
  // give the badge and the figure two sources for one fact.
  const runway = state.isVacant ? 0n : state.secondsUntilLiquidation;
  const tone = runwayTone(runway, state.minDepositSeconds);
  const perMonth = rentFor(MONTH_SECONDS, state.price, state.taxBps);

  return (
    <dl className="grid grid-cols-3 divide-x divide-line border-y border-line bg-canvas/50">
      <Figure label="Valuation" value={formatAmount(state.price)} />
      <Figure label="Rent" value={`${formatAmount(perMonth)}/mo`} />
      <Figure
        label="Runway"
        value={state.isVacant ? "—" : describeDays(runway)}
        className={state.isVacant ? undefined : TONE_TEXT[tone]}
      />
    </dl>
  );
}

function Figure({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm font-semibold tabular-nums",
          className,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Buying, whether from nobody or from somebody.
 *
 * One form for both, because the transaction is the same `buy` either way and
 * the only difference is what the valuation has to clear.
 */
function TakeForm({
  subname,
  label,
  onDone,
  send,
  pending,
}: {
  subname: Subname;
  label: string;
  onDone?: () => void;
  send: ReturnType<typeof useTx>["send"];
  pending: string | null;
}) {
  const { address } = useAccount();
  const s = subname.state;
  const [price, setPrice] = useState(0n);
  const [multiple, setMultiple] = useState(1);

  /**
   * Seed the field ONCE, and never again.
   *
   * Guarded by a ref rather than by `price === 0n`, which is what it was and
   * was a bug you could not type through: clearing the field to enter a new
   * number produces exactly zero, so the effect re-seeded on the very
   * keystroke that emptied it and the value snapped back to 0.01 every time.
   * The condition and the person typing were fighting over the same value.
   *
   * It opens at the current valuation because on an occupied slot the floor IS
   * their valuation, so a blank field would start below every valid value.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !s) return;
    seeded.current = true;
    setPrice(s.price > 0n ? s.price : 10n ** 16n);
  }, [s]);

  const window = s?.minDepositSeconds ?? 0n;
  const taxBps = s?.taxBps ?? 0n;
  const wanted = rentFor(window * BigInt(multiple), price, taxBps);

  // The floor comes from the slot, not from us: it settles first, so the
  // minimum for a given valuation is a question only it can answer.
  const { data: floor } = useReadContract({
    address: subname.slot,
    abi: slotAbi,
    functionName: "minDepositForBuy",
    args: [price],
    query: { enabled: price > 0n },
  });

  const deposit = floor && floor > wanted ? floor : wanted;

  // And the total, likewise — it folds in the outgoing holder's refund and any
  // arrears, which no client-side sum can know.
  const { data: owed } = useReadContract({
    address: subname.slot,
    abi: slotAbi,
    functionName: "quoteBuy",
    args: [address ?? "0x0000000000000000000000000000000000000000", deposit],
    query: { enabled: !!address && deposit > 0n },
  });

  const tooLow = !!s && !s.isVacant && price < s.price;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="price">Valuation</Label>
        <ValuationInput
          id="price"
          value={price}
          onChange={setPrice}
          taxBps={taxBps}
        />
        {tooLow && (
          <p className="text-[11px] text-warn">
            At least {formatAmount(s.price)} — that is what they declared, and
            it is what they agreed to sell at.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Runway</Label>
        <RunwayChoice
          window={window}
          price={price}
          taxBps={taxBps}
          value={multiple}
          onChange={(m) => setMultiple(m)}
        />
      </div>

      <div className="space-y-1 border-t border-line pt-3">
        <Row label="Escrow" value={formatAmount(deposit)} />
        {!!s && !s.isVacant && (
          <Row label="Paid to holder" value={formatAmount(s.price)} />
        )}
        <Row
          label="Total"
          value={owed !== undefined ? formatAmount(owed) : "—"}
          strong
        />
      </div>

      <Button
        className="w-full"
        size="lg"
        disabled={!address || tooLow || !owed || !!pending}
        onClick={async () => {
          if (!address || owed === undefined) return;
          const r = await send("buy", {
            address: subname.slot,
            abi: slotAbi,
            functionName: "buy",
            args: [address, price, deposit, owed],
            value: owed,
          } as never);
          if (r) onDone?.();
        }}
      >
        {pending === "buy" ? "Confirming…" : label}
        <ArrowRight />
      </Button>
    </div>
  );
}

/**
 * The holder's form: valuation and escrow in one place.
 *
 * Together rather than as separate buttons, because they are one decision.
 * Raising your valuation without funding the extra rent shortens your runway,
 * and a UI that hides that behind two buttons lets someone price themselves
 * into a liquidation they did not see coming.
 */
function HoldForm({
  subname,
  onDone,
  send,
  pending,
}: {
  subname: Subname;
  onDone?: () => void;
  send: ReturnType<typeof useTx>["send"];
  pending: string | null;
}) {
  const s = subname.state!;
  const [price, setPrice] = useState(s.price);
  const [topUp, setTopUp] = useState(0n);

  const projected = runwaySeconds(s.deposit + topUp, price, s.taxBps);
  const tone = runwayTone(projected, s.minDepositSeconds);
  const priceChanged = price !== s.price;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="reprice">Valuation</Label>
        <ValuationInput
          id="reprice"
          value={price}
          onChange={setPrice}
          taxBps={s.taxBps}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Runway to add</Label>
        <RunwayChoice
          window={s.minDepositSeconds}
          price={price}
          taxBps={s.taxBps}
          value={0}
          onChange={(_, cost) => setTopUp(cost)}
        />
      </div>

      <div className="border-t border-line pt-3">
        <Row
          label="Runway after this"
          value={describeDays(projected)}
          className={TONE_TEXT[tone]}
          strong
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          disabled={!priceChanged || !!pending}
          onClick={async () => {
            const r = await send("price", {
              address: subname.slot,
              abi: slotAbi,
              functionName: "selfAssess",
              args: [price],
            });
            if (r) onDone?.();
          }}
        >
          {pending === "price" ? "Confirming…" : "Set valuation"}
        </Button>
        <Button
          disabled={topUp === 0n || !!pending}
          onClick={async () => {
            const r = await send("topUp", {
              address: subname.slot,
              abi: slotAbi,
              functionName: "topUp",
              args: [topUp],
              value: topUp,
            } as never);
            if (r) onDone?.();
          }}
        >
          <Plus />
          {pending === "topUp" ? "Confirming…" : "Fund"}
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          disabled={s.deposit === 0n || !!pending}
          onClick={async () => {
            // A margin, because the slot settles before it pays out: asking
            // for the exact balance always reverts, since a moment's rent has
            // accrued between reading it and the transaction landing.
            const margin = rentFor(600n, s.price, s.taxBps);
            const amount = s.deposit > margin ? s.deposit - margin : 0n;
            const r = await send("withdraw", {
              address: subname.slot,
              abi: slotAbi,
              functionName: "withdraw",
              args: [amount],
            });
            if (r) onDone?.();
          }}
        >
          <Minus />
          {pending === "withdraw" ? "…" : "Withdraw"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          disabled={!!pending}
          onClick={async () => {
            const r = await send("release", {
              address: subname.slot,
              abi: slotAbi,
              functionName: "release",
            });
            if (r) onDone?.();
          }}
        >
          <LogOut />
          {pending === "release" ? "…" : "Give it up"}
        </Button>
      </div>
    </div>
  );
}

/**
 * The two actions that belong to nobody in particular.
 *
 * Shown only when they would do something. A permanently visible "Liquidate"
 * on a healthy slot is noise, and worse, it teaches people the button does
 * nothing.
 */
function Communal({
  subname,
  send,
  pending,
}: {
  subname: Subname;
  send: ReturnType<typeof useTx>["send"];
  pending: string | null;
}) {
  const s = subname.state;
  if (!s) return null;
  const canLiquidate = s.isInsolvent && !s.isVacant;
  const canCollect = s.taxOwed > 0n;
  if (!canLiquidate && !canCollect) return null;

  return (
    <div className="flex gap-2 border-t border-line px-4 py-3">
      {canLiquidate && (
        <Button
          variant="danger"
          size="sm"
          disabled={!!pending}
          onClick={() =>
            send("liquidate", {
              address: subname.slot,
              abi: slotAbi,
              functionName: "liquidate",
            })
          }
        >
          <Gavel />
          Liquidate
        </Button>
      )}
      {canCollect && (
        <Button
          variant="outline"
          size="sm"
          disabled={!!pending}
          onClick={() =>
            send("collect", {
              address: subname.slot,
              abi: slotAbi,
              functionName: "collect",
            })
          }
        >
          <Coins />
          Collect {formatAmount(s.taxOwed)}
        </Button>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-ink-faint">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-sm font-semibold" : "font-medium",
          className,
        )}
      >
        {value}
      </span>
    </div>
  );
}
