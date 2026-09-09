"use client";

import { ArrowRight, Globe, ImageOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { Namespace } from "@/hooks/use-namespaces";
import { hasProfile, type Profile } from "@/hooks/use-profile";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One parent name, as a row.
 *
 * ── Why a list and not a grid of cards ────────────────────────────────────
 *
 * The cards were sized by their banners, so three namespaces filled a screen
 * and the answer to "who has opened names, and what is going spare" took
 * scrolling to assemble. A row is the same facts at a tenth of the height,
 * which means they line up: counts under counts, valuations under valuations,
 * and a directory that can be read down rather than toured.
 *
 * The banner is what got cut. Everything else it showed — the picture, the
 * description, the website, the labels, the total — is still here, because
 * those are the parts that distinguish one namespace from another. Nothing is
 * bespoke: they are `avatar`, `description` and `url` on the parent name, the
 * same records any ENS client reads. See {useProfiles}.
 *
 * ── Degrading to the plain row ────────────────────────────────────────────
 *
 * A namespace whose owner has set nothing draws name, badges, labels and
 * valuation, and skips the rest. That is the common case a minute after
 * opening one, so it is a layout rather than a broken version of the rich one.
 */
export function NamespaceRow({
  namespace: ns,
  profile,
}: {
  namespace: Namespace;
  profile?: Profile;
}) {
  const rich = hasProfile(profile);
  const site = profile?.url ? hostOf(profile.url) : "";
  const available = ns.subnames.length - ns.occupied;

  return (
    <div className="group relative flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-canvas/60">
      {/*
       * The row is one target, and the website is another inside it.
       *
       * An `<a>` cannot contain an `<a>`, so wrapping the row in a Link would
       * make the website link impossible rather than merely awkward. This is
       * the stretched-link pattern: navigation is an invisible overlay across
       * the row, and the one thing that must sit above it says so.
       */}
      <Link
        href={`/n/${ns.address}`}
        className="absolute inset-0 z-10 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none focus-visible:-outline-offset-2"
        aria-label={`${ns.parentName} — ${ns.subnames.length} slotted subnames`}
      />

      <Avatar src={profile?.avatar ?? ""} rich={rich} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium tracking-tight">
            {ns.parentName}
          </span>
          {/*
           * Said out loud, for the same reason `SponsorCard` says it: this
           * profile was read straight off the contract because the parent
           * `.eth` name does not point at the namespace's resolver, so no
           * other ENS client can see any of it. Drawing it like one that DOES
           * resolve would claim something the app is not doing — and it is the
           * owner, looking at their own row, who most needs to know.
           */}
          {rich && profile!.via === "contract" && (
            <span
              className="shrink-0 rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn"
              title="Read from the contract. This name's parent does not point at the namespace's resolver, so no other ENS client can see this profile."
            >
              not resolving
            </span>
          )}
        </div>

        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-ink-faint">
          {profile?.description && (
            <span className="truncate">{profile.description}</span>
          )}
          {site && (
            <a
              href={profile!.url}
              target="_blank"
              rel="noreferrer noopener"
              // Above the overlay, so this goes to the website and every other
              // pixel goes to the namespace.
              className="relative z-20 inline-flex shrink-0 items-center gap-1 transition-colors hover:text-brand"
            >
              <Globe className="size-3 shrink-0" />
              <span className="truncate">{site}</span>
            </a>
          )}
        </div>
      </div>

      {/* A few of the spaces by name. Hidden on narrow screens, where the
          counts beside them say enough in less room. */}
      <div className="hidden max-w-[16rem] flex-wrap justify-end gap-1 lg:flex">
        {ns.subnames.slice(0, 3).map((s) => (
          <span
            key={s.node}
            className="truncate rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand-ink"
          >
            {s.label}
          </span>
        ))}
        {ns.subnames.length > 3 && (
          <span className="px-0.5 py-0.5 text-[11px] text-ink-faint">
            +{ns.subnames.length - 3}
          </span>
        )}
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <Badge>{ns.subnames.length} slotted</Badge>
        {ns.occupied > 0 && <Badge tone="good">{ns.occupied} held</Badge>}
        {available > 0 && <Badge tone="brand">{available} available</Badge>}
      </div>

      <div className="w-24 shrink-0 text-right text-xs tabular-nums">
        {ns.totalValue > 0n ? (
          <span className="font-medium">{formatAmount(ns.totalValue)}</span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </div>

      <ArrowRight className="size-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand" />
    </div>
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
function Avatar({ src, rich }: { src: string; rich: boolean }) {
  const [failed, setFailed] = useState(false);
  const shape = "size-10 shrink-0 rounded-lg bg-canvas object-cover";

  if (!src) {
    return (
      <div
        className={cn(
          shape,
          rich && "bg-gradient-to-br from-brand-soft to-canvas",
        )}
      />
    );
  }

  if (failed) {
    return (
      <div className={cn(shape, "grid place-items-center text-ink-faint")}>
        <ImageOff className="size-3.5" />
      </div>
    );
  }
  return (
    // Not next/image: the host is whatever the name's owner set, and the
    // optimiser needs an allow-list.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={shape}
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
