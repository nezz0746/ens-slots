/**
 * The X wordmark, because lucide does not carry it.
 *
 * Every other sponsor type is labelled with a lucide glyph, which is the right
 * default — one drawing style across the set and no artwork to maintain. X is
 * the exception: lucide retired its `Twitter` bird when the platform renamed,
 * and its `X` is the close-window cross, so reaching for either would put a
 * wrong mark on the control. This is the official wordmark path, short enough
 * to inline and stable enough not to rot.
 *
 * Ported from adland, where the same gap was hit for the same reason.
 *
 * Takes the props the lucide icons are given at the call sites — `className`,
 * mainly — so the two are interchangeable in an icon map.
 */
export function XLogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
