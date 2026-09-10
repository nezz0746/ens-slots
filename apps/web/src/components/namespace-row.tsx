"use client";

import { ArrowRight, ImageOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Namespace } from "@/hooks/use-namespaces";
import { hasProfile, type Profile } from "@/hooks/use-profile";
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

  return (
    <div className="group relative flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-canvas/60">
      {/*
       * A stretched link: navigation is an invisible overlay across the whole
       * row. It stays that way rather than becoming a plain wrapping `<a>`
       * because the row is a flex layout with an avatar in it, and an anchor
       * around the lot changes what the browser does with a drag.
       */}
      <Link
        href={`/n/${ns.address}`}
        className="absolute inset-0 z-10 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none focus-visible:-outline-offset-2"
        aria-label={ns.parentName}
      />

      <Avatar src={profile?.avatar ?? ""} rich={rich} />

      {/*
        * The name, and nothing else.
        *
        * This row used to carry the profile description, the website, three
        * label chips, three count badges and the total valuation — six kinds
        * of thing, none of which anybody chooses a namespace by. They are all
        * on the namespace's own page, one click away, with room to be read.
        *
        * A list is for picking. What you pick by is the name.
        */}
      <span className="min-w-0 flex-1 truncate font-medium tracking-tight">
        {ns.parentName}
      </span>

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
 * reads as this app being broken rather than as a picture being gone.
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
