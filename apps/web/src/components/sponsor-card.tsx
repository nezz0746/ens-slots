"use client";

import {
  destinationOf,
  displayOf,
  type SponsorRecord,
} from "@ens-slots/sponsor";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BadgeCheck, ImageOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * What a sponsoring space is showing, drawn from its record.
 *
 * ── The fallback is the feature ───────────────────────────────────────────
 *
 * There is one renderer per type we happen to know, and a GENERIC one for
 * everything else. The generic one is not a degraded mode — it is the reason
 * the format is worth calling a standard. Every payload carries a name, an
 * image and a line of text no matter what `type` says, so a card published by
 * a newer client than this one still draws correctly, and adding a type never
 * requires anybody else to redeploy.
 *
 * Publish a record with any `type` string to see it — the envelope is
 * validated separately from the type-specific half, so the card still has a
 * name, an image and a line of text to draw.
 *
 * ── Everything here is untrusted ──────────────────────────────────────────
 *
 * The payload is written by whoever holds the name. Nothing auto-plays, no
 * script runs, no request is made on the sponsor's behalf, and every outbound
 * link carries `rel="noopener noreferrer"` and opens in a new tab. A name
 * resolving to something is not an endorsement of it, and the card should not
 * look like one.
 */
export function SponsorCard({
  record,
  via,
  className,
  compact,
}: {
  record: SponsorRecord;
  /** Which path answered — see `useSponsorRecord`. */
  via?: "ens" | "contract";
  className?: string;
  /**
   * Drawn as a record's value rather than as a panel of its own.
   *
   * Sheds the border, the provenance bar and the type-specific strip, and
   * gives the tagline one line instead of two — a value in a list has to be
   * the height of a row, and the full card is three times that. What survives
   * is what a row needs: the picture, the name, and one line of what it is.
   *
   * Everything dropped is a repetition in this position. The border and tint
   * belong to the row; the provenance bar restates the label the row already
   * carries; the detail strip is the reason to open the record, not a reason
   * to make every row taller.
   *
   * It also stops being a LINK. The row it sits in is a button that opens the
   * editor, and an anchor across most of that row's width swallowed the click:
   * aiming at the record you wanted to change opened the sponsor's website
   * instead. The card is a value being displayed here, not a destination.
   */
  compact?: boolean;
}) {
  const display = displayOf(record);
  const href = destinationOf(record);

  const body = (
    <div
      className={cn(
        "flex",
        compact ? "items-center gap-2" : "gap-3 p-3",
        className,
      )}
    >
      <Thumb src={display.image} alt="" compact={compact} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <p
            className={cn(
              "min-w-0 flex-1 truncate font-semibold",
              compact ? "text-[11px] leading-tight" : "text-sm",
            )}
          >
            {display.name}
          </p>
          {href && !compact && (
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
          )}
        </div>

        {display.tagline && (
          <p
            className={cn(
              "text-[11px] leading-snug text-ink-soft",
              compact ? "truncate" : "mt-0.5 line-clamp-2",
            )}
          >
            {display.tagline}
          </p>
        )}

        {!compact && <Detail record={record} />}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "overflow-hidden",
        !compact && "rounded-xl border border-line bg-surface",
      )}
    >
      {href && !compact ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block transition-colors hover:bg-canvas"
        >
          {body}
        </a>
      ) : (
        body
      )}

      {!compact && <Provenance record={record} via={via} />}
    </div>
  );
}

/**
 * The type-specific half, or nothing.
 *
 * Deliberately a strip UNDER the shared card rather than a different card per
 * type: the identity of a sponsored thing looks the same whatever it is, and
 * only the figures differ. It also means an unknown type is missing a line
 * rather than missing a layout.
 */
function Detail({ record }: { record: SponsorRecord }) {
  const meta = record.metadata as Record<string, unknown>;
  const data = record.data as Record<string, unknown>;

  switch (record.type) {
    case "pool":
    case "token":
      return (
        <LiveFigures
          chainId={Number(data?.chainId)}
          address={String(data?.address ?? "")}
          kind={record.type}
        />
      );

    case "miniapp":
      return (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-faint">
          {String(meta.host ?? "")}
          {meta.verified === true && (
            <span className="inline-flex items-center gap-0.5 text-good">
              <BadgeCheck className="size-3" />
              manifest
            </span>
          )}
        </p>
      );

    case "post":
      return meta.network ? (
        <p className="mt-1.5 text-[11px] text-ink-faint">
          {String(meta.network)}
        </p>
      ) : null;

    case "url":
      return meta.host ? (
        <p className="mt-1.5 text-[11px] text-ink-faint">
          {String(meta.host)}
        </p>
      ) : null;

    default:
      return null;
  }
}

/**
 * Price and liquidity, fetched now rather than read from the record.
 *
 * The one thing on this card that is NOT in the record, and the reason the
 * boundary between `data` and `metadata` is drawn where it is: a number that
 * moves cannot be published once and left there.
 */
function LiveFigures({
  chainId,
  address,
  kind,
}: {
  chainId: number;
  address: string;
  kind: "pool" | "token";
}) {
  const { data } = useQuery({
    queryKey: ["sponsor-live", chainId, address, kind],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/sponsor/live?chainId=${chainId}&address=${address}&kind=${kind}`,
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { figures: Figures | null };
      return json.figures;
    },
  });

  if (!data?.price) return null;

  const up = (data.change24h ?? 0) >= 0;

  return (
    <div className="mt-1.5 flex items-baseline gap-2 text-[11px] tabular-nums">
      <span className="font-semibold">{usd(data.price)}</span>
      {data.change24h != null && (
        <span className={up ? "text-good" : "text-hot"}>
          {up ? "+" : ""}
          {data.change24h.toFixed(1)}%
        </span>
      )}
      {data.liquidity != null && (
        <span className="text-ink-faint">{compact(data.liquidity)} TVL</span>
      )}
    </div>
  );
}

type Figures = {
  price: number | null;
  change24h: number | null;
  liquidity: number | null;
  volume24h: number | null;
};

/**
 * How this answer was obtained, stated on the card.
 *
 * Not decoration. The claim is that these records are readable by anything
 * that speaks ENS, and a badge that says "resolved through ENS" is the claim
 * being checked in front of whoever is looking — it says `contract` on the
 * cases where resolution is not wired up, which is exactly when somebody
 * needs to know.
 */
function Provenance({
  record,
  via,
}: {
  record: SponsorRecord;
  via?: "ens" | "contract";
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line-soft bg-canvas/60 px-3 py-1.5 text-[10px] text-ink-faint">
      <span className="truncate font-medium tracking-wide uppercase">
        {record.type}
        {!record.known && " · unrecognised type"}
      </span>
      {via && (
        <span className="shrink-0">
          {via === "ens" ? "resolved through ENS" : "read from the contract"}
        </span>
      )}
    </div>
  );
}

/**
 * The image, or a glyph where there is not one.
 *
 * `failed` is not belt-and-braces. These URLs point at hosts nobody here
 * controls, chosen by whoever held the name when they published — months ago,
 * possibly by somebody who has since lost it — so they rot. Without the
 * fallback a rotted one draws the browser's broken-image box, which reads as
 * this app being broken rather than as an image being gone.
 */
function Thumb({
  src,
  alt,
  compact,
}: {
  src: string;
  alt: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const size = compact ? "size-8" : "size-12";

  if (!src || failed) {
    return (
      <div
        className={cn(
          "grid shrink-0 place-items-center rounded-lg border border-line bg-canvas text-ink-faint",
          size,
        )}
      >
        <ImageOff className="size-4" />
      </div>
    );
  }
  return (
    // Not next/image: the host is chosen by whoever holds the name, and
    // configuring the optimiser would mean maintaining an allow-list of every
    // domain a sponsor might ever use.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      // `bg-canvas`, because a great many token logos are a light glyph on a
      // transparent ground — CLANKER's is nearly white — and on a white card
      // those render as an empty box that looks like a failed load.
      className={cn(
        "shrink-0 rounded-lg border border-line bg-canvas object-cover",
        size,
      )}
    />
  );
}

const usd = (n: number) =>
  n < 0.01
    ? `$${n.toPrecision(2)}`
    : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const compact = (n: number) =>
  `$${Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;
