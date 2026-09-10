"use client";

import {
  ArrowRight,
  Coins,
  Gavel,
  Loader2,
  LogOut,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { encodeFunctionData } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useReadContract } from "wagmi";

import { RunwayChoice } from "@/components/runway-choice";
import { Status } from "@/components/market-figures";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { ValuationInput } from "@/components/valuation-input";
import type { Subname } from "@/hooks/use-namespaces";
import { formatUsd, usdOf, useTokenPrice } from "@/hooks/use-token-price";
import { useAllowance } from "@/hooks/use-allowance";
import { useCurrency } from "@/hooks/use-addresses";
import { useTx } from "@/hooks/use-tx";
import { slotAbi } from "@/lib/abis";
import {
  DECIMALS,
  isDollarPegged,
  isNative,
  SYMBOL,
} from "@/lib/currency";
import { formatAmount } from "@/lib/format";
import {
  DAY_SECONDS,
  depositForSeconds,
  describeDays,
  MONTH_SECONDS,
  rentFor,
  runwaySeconds,
  runwayTone,
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
      {/*
        * The figures moved out to sit under the name; see {MarketFigures}.
        * What is left is the controls, so the heading names the act rather
        * than the subject — "The market" over a form was labelling the topic
        * of the page, not the thing in the box.
        */}
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 pt-4 pb-3">
        <h2 className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">
          {isVacant ? "Take it" : isOccupant ? "Your position" : "Take it from them"}
        </h2>
        <Status subname={subname} />
      </header>

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
  const currency = useCurrency();
  const s = subname.state;
  const [price, setPrice] = useState(0n);
  const [multiple, setMultiple] = useState(1);

  /**
   * Seed the field ONCE, and only when there is something to seed it with.
   *
   * An occupied slot opens at the current valuation, because the floor IS that
   * valuation and a blank field would start below every valid value. A VACANT
   * one opens blank: there is no floor, so any seed is this app inventing a
   * number and calling it the asking price. It used to seed `10n ** 16n` —
   * 0.01 of an 18-decimal token, left behind when the currency became
   * 6-decimal USDC, where the same constant reads as ten billion dollars.
   *
   * Guarded by a ref rather than by `price === 0n`: clearing the field to type
   * a new number produces exactly zero, so that condition re-seeded on the
   * keystroke that emptied it and fought whoever was typing.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !s) return;
    seeded.current = true;
    if (s.price > 0n) setPrice(s.price);
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

  // The slot pulls what it is owed, so it needs an allowance for the total —
  // not the deposit. `owed` is the escrow plus whatever the current holder is
  // paid, and approving only half of that reverts inside the transfer.
  const allowance = useAllowance(subname.slot, owed ?? 0n);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="price">Valuation</Label>
        <ValuationInput
          id="price"
          value={price}
          onChange={setPrice}
          decimals={DECIMALS}
          symbol={SYMBOL}
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
          decimals={DECIMALS}
          symbol={SYMBOL}
          onChange={(m) => setMultiple(m)}
        />
      </div>

      <div className="space-y-1 border-t border-line pt-3">
        <Row
          label="Rent"
          value={`${formatAmount(rentFor(MONTH_SECONDS, price, taxBps))}/mo`}
        />
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
        disabled={!address || tooLow || !owed || !!pending || allowance.approving}
        onClick={async () => {
          if (!address || owed === undefined) return;
          // Approve first when the currency is a token, and stop if it is
          // declined — sending the buy anyway would revert on the transfer
          // and cost gas to learn something already known.
          if (!(await allowance.approve())) return;
          const r = await send("buy", {
            address: subname.slot,
            abi: slotAbi,
            functionName: "buy",
            args: [address, price, deposit, owed],
            // No `value`: the slot rejects a non-zero `msg.value` on the
            // ERC-20 path, and pays for the native one out of the transfer.
            ...(isNative(currency) ? { value: owed } : {}),
          } as never);
          if (r) onDone?.();
        }}
      >
        {allowance.approving
          ? "Approving…"
          : pending === "buy"
            ? "Confirming…"
            : allowance.enough
              ? label
              : `Approve & ${label.toLowerCase()}`}
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
/**
 * Everything the occupant can do to their own position, without selling it.
 *
 * ── Why one button and not three ─────────────────────────────────────────
 *
 * Because the contract does not treat them as independent. `selfAssess` ends
 * with `_requireFunded(_deposit, newPrice)`, so the deposit still standing
 * after settlement has to cover the minimum at the NEW price — raising your
 * valuation, the most ordinary thing an occupant does, reverts unless the
 * deposit already covers it. And `withdraw` refuses to leave the deposit under
 * the minimum at the current price, so how much you may take back is a
 * function of the valuation, and LOWERING it is precisely what frees escrow.
 *
 * Three buttons made each of those a trap: a field that accepted a price the
 * chain would refuse, and a withdraw that could only quote a ceiling for a
 * price you had not changed yet. One form, one submit, and the coupling
 * becomes two lines of copy.
 *
 * Ported from the 0xSlots market app's `ManageTerms`, where both rules were
 * re-read against `Slot.sol`.
 *
 * ── Why it is sometimes two signatures ────────────────────────────────────
 *
 * `multicall` is not payable, and these slots hold native ETH, so a top-up
 * cannot ride inside the batch — it goes first, alone, with value, and is
 * awaited because the reprice depends on the deposit it lands. Reprice and
 * withdraw need no value and always share one transaction. The count is said
 * on the form before the wallet asks, because a wallet asking twice for one
 * button is alarming when you were not told to expect it.
 */

/** Headroom over the minimum, so a slow confirmation cannot undershoot it. */
const SETTLE_MARGIN_SECONDS = 600n;

/**
 * Runway, as one continuous scale from taking back to adding.
 *
 * The same three intervals in both directions, laid out like the percentage
 * steps on the valuation field — cuts on the left, additions on the right, one
 * real division at the turn. "Fund" and "Withdraw" were two buttons speaking
 * different vocabularies; as a signed scale they are one question — how much
 * runway do you want — asked once.
 */
const RUNWAY_STEPS = [
  { label: "−1mo", seconds: -MONTH_SECONDS },
  { label: "−1w", seconds: -(DAY_SECONDS * 7n) },
  { label: "−1d", seconds: -DAY_SECONDS },
  { label: "+1d", seconds: DAY_SECONDS },
  { label: "+1w", seconds: DAY_SECONDS * 7n },
  { label: "+1mo", seconds: MONTH_SECONDS },
] as const;

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
  const taxBps = s.taxBps;
  const currency = useCurrency();
  const price = useTokenPrice();
  const queryClient = useQueryClient();

  /**
   * Re-read the slot NOW rather than on the next poll.
   *
   * Every figure this form computes from — price, deposit, tax owed — comes
   * from `getSlotInfo`, polled on an interval. Without this, a successful
   * submit reset the fields onto STALE state: the valuation snapped back to the
   * price you had just changed, the runway showed the escrow you had just
   * funded as unfunded, and the reduce half stayed dead — for up to five
   * seconds, or indefinitely in a background tab, where polling pauses.
   *
   * Called after the top-up lands as well as at the end, so a reprice that
   * fails on the second signature still leaves the form showing the funded
   * deposit rather than offering to fund it again.
   */
  const reread = () =>
    queryClient.invalidateQueries({ queryKey: ["readContracts"] });

  const [priceWei, setPriceWei] = useState<bigint | null>(null);
  /** Signed: positive adds runway, negative takes it back. */
  const [deltaSeconds, setDeltaSeconds] = useState<bigint>(0n);

  // The field starts at whatever the slot currently says and only diverges once
  // touched, so opening the panel and leaving it changes nothing.
  const newPrice = priceWei ?? s.price;
  const priceChanged = newPrice !== s.price && newPrice > 0n;

  // What settlement will take before any of this runs. `selfAssess`, `topUp`
  // and `withdraw` all call `_settle()` first, so the deposit these figures
  // must satisfy is the one left AFTER the tax owed so far is deducted — not
  // the one on screen. `taxOwed` is the raw debt and can exceed the escrow.
  const owed = s.taxOwed > s.deposit ? s.deposit : s.taxOwed;
  const settledDeposit = s.deposit - owed;

  /**
   * The floor the deposit has to clear, by the contract's own ceilDiv.
   *
   * At the NEW price, for both directions, because that is the price both
   * checks run against: `selfAssess` enforces it as its last act, and
   * `withdraw` — which goes after the reprice — enforces it against whatever
   * the price is by then. Aimed a little above the floor rather than exactly
   * at it: these figures are quoted now and spent when the wallet confirms,
   * and tax keeps accruing in between.
   */
  const floor =
    s.minDepositSeconds > 0n
      ? depositForSeconds(
          newPrice,
          taxBps,
          s.minDepositSeconds + SETTLE_MARGIN_SECONDS,
        )
      : 0n;

  // The shortfall a reprice creates, and only a reprice. `_requireFunded` runs
  // inside `selfAssess` and nowhere else on this path, so an occupant whose
  // deposit has decayed below the minimum is not in trouble — they are simply
  // nearer the end of their runway. Charging them to open a panel they only
  // opened to look at would invent an obligation the contract does not impose.
  const shortfall =
    priceChanged && floor > settledDeposit ? floor - settledDeposit : 0n;

  /** What may actually leave, at the price this submit will set. */
  const withdrawable = settledDeposit > floor ? settledDeposit - floor : 0n;

  // Taking money out while the new valuation demands more of it is not a
  // trade-off, it is a contradiction. The reduce half goes dead and says why.
  const canReduce = shortfall === 0n && withdrawable > 0n;
  const delta = deltaSeconds < 0n && !canReduce ? 0n : deltaSeconds;

  const wanted = depositForSeconds(
    newPrice,
    taxBps,
    delta < 0n ? -delta : delta,
  );

  // Whichever is larger — asking for a day of runway cannot be allowed to send
  // less than the reprice itself demands.
  const topUpAmount =
    delta >= 0n ? (wanted > shortfall ? wanted : shortfall) : shortfall;
  // Capped at the ceiling rather than offered and refused on chain.
  const withdrawAmount =
    delta < 0n ? (wanted < withdrawable ? wanted : withdrawable) : 0n;
  const capped = delta < 0n && wanted > withdrawable;

  const nothingToDo =
    !priceChanged && topUpAmount === 0n && withdrawAmount === 0n;

  // Whether anything has been touched — which is NOT `!nothingToDo`. Typing the
  // current price back in leaves nothing to submit and a field the occupant
  // changed, and a reset offered only when a transaction is possible would be
  // unavailable in exactly the states somebody wants it.
  const dirty = priceWei !== null || deltaSeconds !== 0n;

  const reset = useCallback(() => {
    setPriceWei(null);
    setDeltaSeconds(0n);
  }, []);

  const runwayAfter = runwaySeconds(
    settledDeposit + topUpAmount - withdrawAmount,
    newPrice,
    taxBps,
  );
  const toneAfter = runwayTone(runwayAfter, s.minDepositSeconds);
  const rentAfter = rentFor(MONTH_SECONDS, newPrice, taxBps);

  const moved = topUpAmount > 0n ? topUpAmount : withdrawAmount;

  /**
   * How the work splits, which depends entirely on the currency.
   *
   * `multicall` is not payable. On a NATIVE slot a top-up therefore cannot ride
   * inside it and has to go first, alone, with value — two signatures whenever
   * funding accompanies a reprice.
   *
   * On an ERC-20 slot the money moves by `transferFrom`, so `topUp` carries no
   * value and joins `selfAssess` and `withdraw` in one batch. What it costs
   * instead is an allowance, which is a signature only when the standing one
   * is short.
   */
  const native = isNative(currency);
  const allowance = useAllowance(subname.slot, topUpAmount);

  const separateTopUp = native && topUpAmount > 0n;
  const batched =
    (priceChanged ? 1 : 0) +
    (withdrawAmount > 0n ? 1 : 0) +
    (!native && topUpAmount > 0n ? 1 : 0);
  const steps =
    allowance.steps + (separateTopUp ? 1 : 0) + (batched > 0 ? 1 : 0);

  const working = pending === "terms" || allowance.approving;

  /**
   * What the button says it will do.
   *
   * Named specifically for a single action — "Fund", "Withdraw" — and collapsed
   * to "Update terms" for two or more. Joining them read as "Approve & fund &
   * set valuation" once an allowance was in play, which is three ampersands
   * describing one press.
   */
  const actions = [
    topUpAmount > 0n && "Fund",
    priceChanged && "Set valuation",
    withdrawAmount > 0n && "Withdraw",
  ].filter(Boolean) as string[];
  const verb = actions.length === 1 ? actions[0] : "Update terms";

  async function submit() {
    // The allowance covers the top-up only; withdrawal and repricing move
    // nothing the slot has to pull. Asked first, because a declined approval
    // should cost nothing and leave the form exactly as it was.
    if (!(await allowance.approve())) return;

    // A NATIVE top-up cannot be batched — `multicall` is not payable — so it
    // goes alone, with value, and is awaited: the reprice that may follow is
    // checked against the deposit this lands.
    if (separateTopUp) {
      const funded = await send("terms", {
        address: subname.slot,
        abi: slotAbi,
        functionName: "topUp",
        args: [topUpAmount],
        value: topUpAmount,
      } as never);
      if (!funded) return;
      // The runway half has landed. If the reprice below fails, the form must
      // show a price still pending and NO delta — not offer to fund again.
      setDeltaSeconds(0n);
      await reread();
      if (batched === 0) {
        reset();
        onDone?.();
        return;
      }
    }

    const calls: { functionName: "topUp" | "selfAssess" | "withdraw"; args: readonly unknown[] }[] = [];
    // Funding first inside the batch, for the same reason it goes first
    // outside one: `selfAssess` ends by checking the deposit, and it has to be
    // checking the funded one.
    if (!native && topUpAmount > 0n)
      calls.push({ functionName: "topUp", args: [topUpAmount] });
    if (priceChanged) calls.push({ functionName: "selfAssess", args: [newPrice] });
    if (withdrawAmount > 0n)
      calls.push({ functionName: "withdraw", args: [withdrawAmount] });

    if (calls.length === 0) return;

    // One call needs no wrapper, and sending it bare keeps the revert reason
    // attributable to the function that produced it — the difference between
    // "InvalidDeposit" and "the batch failed".
    const ok =
      calls.length === 1
        ? await send("terms", {
            address: subname.slot,
            abi: slotAbi,
            functionName: calls[0].functionName,
            args: calls[0].args,
          } as never)
        : await send("terms", {
            address: subname.slot,
            abi: slotAbi,
            functionName: "multicall",
            args: [
              calls.map((c) =>
                encodeFunctionData({
                  abi: slotAbi,
                  functionName: c.functionName,
                  args: c.args as never,
                }),
              ),
            ],
          });

    if (ok) {
      await reread();
      reset();
      onDone?.();
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="reprice">Valuation</Label>
        <ValuationInput
          id="reprice"
          value={newPrice}
          onChange={setPriceWei}
          decimals={DECIMALS}
          symbol={SYMBOL}
          disabled={working}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Runway</Label>

        <div className="flex overflow-hidden rounded-lg border border-line">
          {RUNWAY_STEPS.map(({ label, seconds }, i) => {
            const reducing = seconds < 0n;
            const on = delta === seconds;
            return (
              <button
                key={label}
                type="button"
                disabled={working || (reducing && !canReduce)}
                onClick={() =>
                  setDeltaSeconds((v) => (v === seconds ? 0n : seconds))
                }
                className={cn(
                  "min-w-0 flex-1 py-1.5 text-[11px] font-medium tabular-nums transition-colors disabled:opacity-40",
                  // The turn from taking back to adding gets the one real
                  // division, as on the percentage scale above.
                  i === 3
                    ? "border-l border-line"
                    : i > 0 && "border-l border-line-soft",
                  reducing
                    ? "bg-hot-soft/50 text-hot hover:bg-hot-soft"
                    : "bg-good-soft/50 text-good hover:bg-good-soft",
                  on && "ring-1 ring-current ring-inset brightness-95",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* The two things that are easy to get wrong, said plainly: what this
          costs now, and how long it keeps the name funded afterwards. */}
      <dl className="space-y-1.5 rounded-xl bg-canvas/60 px-3 py-2.5">
        {moved > 0n && (
          <Row
            label={
              topUpAmount > 0n
                ? wanted <= shortfall
                  ? "You add — the new valuation requires it"
                  : "You add"
                : capped
                  ? "You take back — all the name may release"
                  : "You take back"
            }
            value={[
              formatAmount(moved),
              isDollarPegged() ? null : formatUsd(usdOf(moved, price)),
            ]
              .filter(Boolean)
              .join(" · ")}
            className={topUpAmount > 0n ? "text-good" : "text-hot"}
          />
        )}
        <Row
          label={priceChanged ? "Rent at the new valuation" : "Rent"}
          value={`${formatAmount(rentAfter)}/mo`}
        />
        <Row
          label="Runway after this"
          value={describeDays(runwayAfter)}
          className={TONE_TEXT[toneAfter]}
          strong
        />
        {!nothingToDo && steps > 1 && (
          <Row
            label="To confirm"
            value={`${steps} signatures — ${
              allowance.steps > 0
                ? "the allowance first"
                : "funding lands first"
            }`}
          />
        )}
      </dl>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={reset}
          disabled={!dirty || working}
          title="Discard changes and show the name's current terms"
          className="shrink-0 px-3"
        >
          <RotateCcw />
        </Button>
        <Button
          disabled={nothingToDo || working}
          onClick={() => void submit()}
          className="flex-1"
        >
          {working ? <Loader2 className="animate-spin" /> : null}
          {allowance.approving
            ? "Approving…"
            : working
              ? "Confirming…"
              : nothingToDo
                ? "No changes"
                : allowance.enough
                  ? verb
                  : `Approve & ${verb.toLowerCase()}`}
        </Button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        disabled={working || !!pending}
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
