import type { VerifiedMark } from "@/lib/verified-mark";

// The tick itself. B96.
//
// Inline SVG rather than an icon-font glyph or an emoji: the colour IS the
// information here, and an emoji tick renders in whatever colour the platform
// decided this year. Drawn at the size of the text beside it so it sits on the
// baseline of a name rather than floating above it.
//
// `title` comes from the mark and is always "Confirmed account" — never an age
// and never a range. See lib/verified-mark.ts for why.

export default function VerifiedMarkIcon({ mark, size = 14 }: {
  mark: VerifiedMark | null;
  size?: number;
}) {
  if (!mark) return null;
  return (
    <span
      className="inline-grid shrink-0 place-items-center align-middle"
      style={{ width: size, height: size }}
      title={mark.title}
      aria-label={mark.title}
      role="img"
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill={mark.color} fillOpacity="0.16" />
        <circle cx="12" cy="12" r="11" fill="none" stroke={mark.color} strokeOpacity="0.55" strokeWidth="1.5" />
        <path
          d="M7 12.4l3.2 3.2L17 8.8"
          fill="none" stroke={mark.color} strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
