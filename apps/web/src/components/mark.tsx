/**
 * Our symbol. Not ENS's.
 *
 * ENS's guidelines let ecosystem builders adapt their marks but not imply a
 * partnership, and the safe reading of that is to draw our own. This one is
 * about the thing this project actually does: a rounded slot with a piece
 * seated in it, in ENS blue, with the seated piece in magenta because that is
 * the part that changes hands.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      role="presentation"
    >
      <rect width="24" height="24" rx="7" fill="#0080BC" />
      <rect x="5" y="5" width="14" height="6" rx="3" fill="#CEE1E8" />
      <rect x="5" y="13" width="14" height="6" rx="3" fill="#F53293" />
    </svg>
  );
}
