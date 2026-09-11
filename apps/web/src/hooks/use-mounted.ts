"use client";

import { useEffect, useState } from "react";

/**
 * False during the render that hydrates, true from the next one on.
 *
 * ── What it is for ──────────────────────────────────────────────────────────
 *
 * Wallet state is not knowable on the server: there is no wallet there. wagmi
 * restores a previous connection from storage as soon as it loads, which can be
 * before React's first client render — so a component that branches on
 * `isConnected` can render nothing on the server and a whole subtree on the
 * client, in the same render that is supposed to match it. React calls that a
 * hydration failure and throws away the tree.
 *
 * Whether it actually happens is a race, which is the unpleasant part: on a
 * server-rendered page the restore usually loses and everything looks fine, and
 * on a statically prerendered one it usually wins. The same component is then
 * correct on one route and broken on another for reasons that have nothing to
 * do with either.
 *
 * Gating on this makes the first client render agree with the server by
 * construction — it renders the logged-out shape, always — and the real state
 * arrives one render later, which is a paint the user cannot perceive.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
