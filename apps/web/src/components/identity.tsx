"use client";

import { useState, type ReactNode } from "react";

import { useIdentity } from "@/hooks/use-identity";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * An address, as whoever it belongs to.
 *
 * One component for both places this appears — the wallet button and the
 * namespace's earning line — because the fallback chain is the interesting
 * part and it should not be written twice: the mainnet primary name with its
 * avatar, and where there is none, the truncated address that was always there.
 *
 * ── It renders the address first, then improves ───────────────────────────
 *
 * `useIdentity` answers `{ null, null }` until the lookup lands, which is
 * deliberately the same shape as "this address has no name". So the first
 * paint is the truncated address — never a spinner or a gap — and a name
 * arriving swaps it. Nothing here can be in a loading state, because the thing
 * it would be loading is an embellishment on something already legible.
 */
export function Identity({
  address,
  className,
  icon,
}: {
  address?: string;
  className?: string;
  /**
   * Drawn where the avatar would go when there is not one — the wallet button
   * passes its icon, so the row keeps its shape whether or not the person has
   * a picture, and one is simply replaced by the other. Omitted elsewhere,
   * where a missing avatar should take no space at all.
   */
  icon?: ReactNode;
}) {
  const { name, avatar } = useIdentity(address);
  const [broken, setBroken] = useState(false);

  if (!address) return null;

  const showAvatar = !!avatar && !broken;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {!showAvatar && icon}
      {showAvatar && (
        // Not next/image: the host is whatever the name's owner set in their
        // avatar record, and the optimiser needs an allow-list.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt=""
          // Falls back to `icon`, or to nothing, rather than leaving a broken
          // image box. Avatar records point wherever their owner liked — a host
          // that is down, a CID nobody pins any more — and that is not
          // something this app can fix or should apologise for; the name beside
          // it is still perfectly good.
          onError={() => setBroken(true)}
          className="size-4 shrink-0 rounded-full bg-line-soft object-cover"
        />
      )}
      {/* `title` so the address stays recoverable: a name is a claim about an
          address, and the person reading may want the address it maps to. */}
      <span title={name ? address : undefined}>
        {name ?? shortAddress(address)}
      </span>
    </span>
  );
}
