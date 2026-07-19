const PALETTES = [
  ["#7c3aed", "#0891b2"], ["#0891b2", "#e879f9"], ["#e879f9", "#7c3aed"],
  ["#f59e0b", "#dc2626"], ["#10b981", "#0891b2"], ["#6366f1", "#e879f9"],
];

export default function Avatar({
  name, src, size = 40, className = "",
}: { name: string; src?: string | null; size?: number; className?: string }) {
  // Lock the box to an exact square. We pin min/max width+height (not just
  // width/height) so Tailwind Preflight's `img { max-width:100%; height:auto }`
  // reset can't shrink or stretch the avatar into a strip inside tight/padded
  // containers like leaderboard table cells or flex rows.
  const box = {
    width: size, height: size, minWidth: size, minHeight: size, maxWidth: size, maxHeight: size,
    flexShrink: 0, aspectRatio: "1 / 1" as const,
  };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src} alt={name} width={size} height={size}
        className={`block rounded-full object-cover border border-violet-400/30 ${className}`}
        style={{ ...box, objectFit: "cover" }}
      />
    );
  }
  const idx = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PALETTES.length;
  const [from, to] = PALETTES[idx];
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white border border-white/20 ${className}`}
      style={{
        ...box, fontSize: size * 0.42,
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
      aria-label={name}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
