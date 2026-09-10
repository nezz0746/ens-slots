import { ImageResponse } from "next/og";
import { createPublicClient, formatUnits, http } from "viem";

import { OG_CONTENT_TYPE, OG_SIZE, OgFrame, ogFonts } from "@/app/_og/frame";
import { namespaceAbi, slotAbi } from "@/lib/abis";
import { CHAINS } from "@/lib/chains";
import { DECIMALS, SYMBOL } from "@/lib/currency";
import { shortAddress } from "@/lib/format";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "A namespace on ENS Slots";

/**
 * The card for one namespace, drawn from what the namespace actually says.
 *
 * ── Why this one reads a chain and the other two do not ───────────────────
 *
 * The front page's card is about the protocol, which does not change. This one
 * is about `l2beat.eth` specifically, and a card that said "A namespace on ENS
 * Slots" over an address would be worth less than the URL it was attached to.
 * The name, how many subnames are open and what they are collectively held at
 * are the three things somebody deciding whether to click actually wants.
 *
 * ── Which chain ──────────────────────────────────────────────────────────
 *
 * The route has no wallet and so no chain. It tries each chain this build knows
 * about and takes the first that answers, which in production is Sepolia alone
 * and in development is the fork first — the fork being where an address you
 * are looking at locally almost certainly lives.
 *
 * ── Failure is a card, not a 500 ─────────────────────────────────────────
 *
 * An RPC that is slow, down, or simply has no contract at this address must not
 * cost the page its preview. Every read is wrapped, and what falls out is the
 * generic frame with the address on it — which is exactly what this card would
 * have been if it never read anything.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const namespace = address as `0x${string}`;
  const summary = await readNamespace(namespace);

  return new ImageResponse(
    (
      <OgFrame
        title={summary?.parentName ?? shortAddress(namespace)}
        subtitle={
          summary
            ? "Every subname here is rented. The holder sets the price, pays tax on it, and can be taken out by anyone willing to pay it."
            : "A namespace of rentable ENS subnames — self-priced, and always for sale."
        }
        facts={
          summary
            ? [
                {
                  label: "Subnames",
                  value: String(summary.total),
                  tone: "brand" as const,
                },
                {
                  label: "Held",
                  value: `${summary.held} of ${summary.total}`,
                },
                {
                  label: "Held at",
                  value: `${summary.value} ${SYMBOL}`,
                  tone: "hot" as const,
                },
              ]
            : []
        }
      />
    ),
    { ...size, fonts: await ogFonts() },
  );
}

type Summary = { parentName: string; total: number; held: number; value: string };

/** The first chain that answers about this address, or nothing. */
async function readNamespace(namespace: `0x${string}`): Promise<Summary | null> {
  for (const chain of CHAINS) {
    try {
      const client = createPublicClient({ chain, transport: http() });

      const [parentName, listing] = await Promise.all([
        client.readContract({
          address: namespace,
          abi: namespaceAbi,
          functionName: "parentName",
        }),
        client.readContract({
          address: namespace,
          abi: namespaceAbi,
          functionName: "listing",
        }),
      ]);

      const slots = listing[2];
      if (!parentName) continue;

      // One multicall rather than a request per slot: a crawler is waiting on
      // this, and a namespace with twenty names would otherwise be twenty
      // round trips before a single pixel is drawn.
      //
      // `getSlotInfo` rather than `occupant()` and `price()`, which the slot
      // does have but `slotAbi` does not — it carries the one call the app
      // makes and nothing else, and asking it for a function it never declared
      // fails as an empty result rather than as an error. It read "0 of 4".
      const states = await client.multicall({
        contracts: slots.map(
          (slot) =>
            ({ address: slot, abi: slotAbi, functionName: "getSlotInfo" }) as const,
        ),
      });

      let held = 0;
      let value = 0n;
      for (const state of states) {
        const info = state.result as
          | { isVacant: boolean; price: bigint }
          | undefined;
        if (!info || info.isVacant) continue;
        held++;
        value += info.price;
      }

      return {
        parentName,
        total: slots.length,
        held,
        // Whole units. The cents on a headline figure are noise at this size.
        value: Math.round(Number(formatUnits(value, DECIMALS))).toLocaleString("en-US"),
      };
    } catch {
      // Try the next chain. A namespace that is on none of them falls through
      // to the generic card.
    }
  }
  return null;
}
