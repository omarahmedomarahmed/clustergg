const PALETTES = [
  ["#7c3aed", "#0891b2"], ["#0891b2", "#e879f9"], ["#e879f9", "#7c3aed"],
  ["#f59e0b", "#dc2626"], ["#10b981", "#0891b2"], ["#6366f1", "#e879f9"],
];

export default function Avatar({
  name, src, size = 40, className = "",
}: { name: string; src?: string | null; size?: number; className?: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src} alt={name} width={size} height={size}
        className={`rounded-full object-cover border border-violet-400/30 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const idx = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PALETTES.length;
  const [from, to] = PALETTES[idx];
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white border border-white/20 ${className}`}
      style={{
        width: size, height: size, fontSize: size * 0.42,
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
      aria-label={name}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
