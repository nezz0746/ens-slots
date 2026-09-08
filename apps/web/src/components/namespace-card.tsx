"use client";

import { ArrowRight, Globe, ImageOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Namespace } from "@/hooks/use-namespaces";
import { hasProfile, type Profile } from "@/hooks/use-profile";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One parent name, drawn from its own ENS records.
 *
 * ── Why the profile is worth the space it takes ───────────────────────────
 *
 * The list used to be names and counts, which is enough to navigate and not
 * enough to choose. Whether `sponsor.dailygwei.eth` is worth paying for is a
 * question about the publication, not about the label — so the card has to
 * show who the parent is before it shows what is available under them.
 *
 * Nothing here is bespoke. The banner, the picture, the description and the
 * link are `header`, `avatar`, `description` and `url` on the parent name,
 * which is what they are on every other ENS name. See {useProfiles}.
 *
 * ── Degrading to the plain card ───────────────────────────────────────────
 *
 * A namespace whose owner has set nothing draws exactly what this list drew
 * before: name, badges, labels, valuation. That is the common case for a
 * namespace opened a minute ago, so it is a first-class layout rather than a
 * broken version of the rich one — no empty banner, no placeholder avatar, no
 * gap where a description would go.
 */
export function NamespaceCard({
  namespace: ns,
  profile,
}: {
  namespace: Namespace;
  profile?: Profile;
}) {
  const rich = hasProfile(profile);
  const site = profile?.url ? hostOf(profile.url) : "";

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-colors hover:border-brand/50">
      {/*
       * The card is one target, and the website is another inside it.
       *
       * An `<a>` cannot contain an `<a>`, so the obvious markup — wrap the
       * whole card in a Link — makes the website link impossible rather than
       * merely awkward. This is the stretched-link pattern instead: the
       * navigation is an invisible overlay across the card, and the one thing
       * that has to sit above it says so.
       *
       * ── The three layers, stated because they are load-bearing ──────────
       *
       *   z-20  the website link — the only thing that must beat the overlay
       *   z-10  the overlay — every other pixel navigates to the namespace
       *   auto  the banner, then the content, painted in DOM order
       *
       * The last one is the subtle half. Both the banner and the content are
       * `relative`, so they paint in DOM order and the content — including the
       * picture lifted up into the banner — lands on top of it. Leaving the
       * content unpositioned put the banner over the picture instead, which
       * looked like the banner had been dropped down the card.
       */}
      <Link
        href={`/n/${ns.address}`}
        className="absolute inset-0 z-10 rounded-[--radius-card] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        aria-label={`${ns.parentName} — ${ns.subnames.length} slotted subnames`}
      />

      {rich && (
        <div className="relative">
          <Banner src={profile!.header} />
          {/*
           * The fallback, said out loud.
           *
           * `SponsorCard` makes the same admission for the same reason: this
           * profile was read straight off the contract because the parent
           * `.eth` name does not point at the namespace's resolver, so no
           * other ENS client can see any of it. Drawing it identically to a
           * profile that DOES resolve would be claiming something the app is
           * not doing — and it is the namespace owner, looking at their own
           * card, who most needs to know.
           */}
          {profile!.via === "contract" && (
            <span
              className="absolute top-2 right-2 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-medium text-warn"
              title="Read from the contract. This name's parent does not point at the namespace's resolver, so no other ENS client can see this profile."
            >
              not resolving
            </span>
          )}
        </div>
      )}

      <div className={cn("relative flex flex-1 flex-col p-5", rich && "pt-3")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {rich && (
              <Avatar
                src={profile!.avatar}
                alt=""
                // Lifted into the banner, which is the convention everywhere
                // this layout appears and the reason the banner is not simply
                // a picture with a card under it.
                className={profile!.header ? "-mt-9 shadow-sm" : ""}
              />
            )}
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold tracking-tight">
                {ns.parentName}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge>{ns.subnames.length} slotted</Badge>
                {ns.occupied > 0 && <Badge tone="good">{ns.occupied} held</Badge>}
                {ns.subnames.length - ns.occupied > 0 && (
                  <Badge tone="brand">
                    {ns.subnames.length - ns.occupied} available
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <ArrowRight className="mt-1 size-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand" />
        </div>

        {profile?.description && (
          <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">
            {profile.description}
          </p>
        )}

        {site && (
          <a
            href={profile!.url}
            target="_blank"
            rel="noreferrer noopener"
            // Above the overlay, so this one goes to the website and every
            // other pixel goes to the namespace.
            className="relative z-20 mt-2 inline-flex w-fit items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-brand"
          >
            <Globe className="size-3.5 shrink-0" />
            <span className="truncate">{site}</span>
          </a>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {/* Sponsoring labels wear the brand tint, so the two kinds of
              market are told apart before anyone clicks in. */}
          {ns.subnames.slice(0, 5).map((s) => (
            <span
              key={s.node}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px]",
                s.sponsoring
                  ? "bg-brand-soft text-brand-ink"
                  : "bg-canvas text-ink-soft",
              )}
            >
              {s.label}
            </span>
          ))}
          {ns.subnames.length > 5 && (
            <span className="px-1 py-1 text-[11px] text-ink-faint">
              +{ns.subnames.length - 5}
            </span>
          )}
        </div>

        {ns.totalValue > 0n && (
          <div className="mt-4 border-t border-line-soft pt-3 text-xs text-ink-faint">
            Holders value these at{" "}
            <span className="font-medium tabular-nums text-ink">
              {formatAmount(ns.totalValue)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * The banner, or a tint where there is not one.
 *
 * ── Why an aspect ratio and not a fixed height ────────────────────────────
 *
 * A fixed strip is a different crop at every card width, and at three cards to
 * a row it was cutting a 5:1 slice out of images that are nothing like 5:1.
 * What people actually set on a `header` record is an ENS banner at 3:1, or —
 * because the easiest thing to hand is whatever their site already serves —
 * an Open Graph card at roughly 2:1. A 5:2 box is the crop that costs both of
 * those the least: a little off the sides of a 3:1, a little off the top and
 * bottom of a 2:1, and a recognisable picture either way.
 *
 * `aspect-*` rather than a height, so it stays that crop from a phone to a
 * four-column grid.
 *
 * A namespace can also set an `avatar` and no `header`, so the box has to hold
 * its shape when empty: the picture below it is lifted into this space, and a
 * banner that collapsed would drop it onto the card's edge.
 */
function Banner({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const box = "aspect-[5/2] w-full";

  if (!src || failed) {
    return <div className={cn(box, "bg-gradient-to-br from-brand-soft to-canvas")} />;
  }
  return (
    // Not next/image, for the same reason `SponsorCard` is not: the host is
    // whatever the name's owner set, and the optimiser needs an allow-list.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      // The canvas tint is what shows while the image is still coming down, so
      // a slow host reads as an empty banner rather than as a broken one.
      className={cn(box, "bg-canvas object-cover")}
    />
  );
}

/**
 * The picture, or something in its place.
 *
 * ── Unset and broken are different states ─────────────────────────────────
 *
 * A rotted URL gets the broken-image glyph: these point at hosts nobody here
 * controls, set by whoever owns the parent name, so they do rot, and without
 * the fallback a dead one draws the browser's own broken-image box — which
 * reads as this app being broken rather than as a picture being gone. Same
 * reasoning as `SponsorCard`'s `Thumb`.
 *
 * An avatar that was never set gets a plain tint instead. Drawing the broken
 * glyph there says a picture failed to arrive when none was ever published,
 * which is a complaint about the owner's namespace that isn't true — and a
 * profile with a description and no avatar is an ordinary thing to have.
 */
function Avatar({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const shape =
    "size-14 shrink-0 rounded-xl border-2 border-surface bg-canvas object-cover";

  if (!src) {
    return (
      <div
        className={cn(shape, "bg-gradient-to-br from-brand-soft to-canvas", className)}
      />
    );
  }

  if (failed) {
    return (
      <div className={cn(shape, "grid place-items-center text-ink-faint", className)}>
        <ImageOff className="size-4" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn(shape, className)}
    />
  );
}

/**
 * `https://www.clanker.world/x` → `clanker.world`, and "" for anything that is
 * not a web page.
 *
 * ── The scheme check is the point, not the tidying ────────────────────────
 *
 * This record is a string an untrusted party wrote on chain — anyone may open
 * a namespace, so anyone may become an owner and set it. `new URL()` parses
 * far more than http: `javascript://clanker.world/%0aalert(1)` parses fine and
 * reports its hostname as `clanker.world`, so a check that only asked "does it
 * parse" would render an anchor that READS as clanker.world and carries a
 * script URL. React refuses to emit a `javascript:` href, but that is React's
 * guarantee rather than this component's, and it does nothing about the host
 * being a lie.
 *
 * So: http and https, or no link at all.
 */
function hostOf(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
