// Tiny inline SVG area sparkline for the daily impressions/clicks trend. Pure
// server-renderable — no client JS needed.
export default function Sparkline({
  points, width = 640, height = 90, stroke = "#22d3ee", fill = "rgba(34,211,238,0.14)",
}: { points: number[]; width?: number; height?: number; stroke?: string; fill?: string }) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points);
  const n = points.length;
  const step = n > 1 ? width / (n - 1) : width;
  const y = (v: number) => height - 4 - (v / max) * (height - 12);
  const coords = points.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const line = coords.map((c, i) => (i === 0 ? `M${c}` : `L${c}`)).join(" ");
  const area = `${line} L${((n - 1) * step).toFixed(1)},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-[90px]">
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
