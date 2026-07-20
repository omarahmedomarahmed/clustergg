// Smooth curved trail math for the quest map, shared by the hero (draws the line
// + places the astronaut exactly on it) and the admin path editor (live preview).
// Points are {x,y} in 0..100 map-percent space. A Catmull-Rom spline through the
// points gives a natural curve; we can also sample it by arc-length so the marker
// sits precisely on the curve at any progress fraction.

export type Pt = { x: number; y: number };

// Catmull-Rom → cubic Bézier control points for each segment.
function segments(pts: Pt[]): { p0: Pt; c1: Pt; c2: Pt; p1: Pt }[] {
  const segs: { p0: Pt; c1: Pt; c2: Pt; p1: Pt }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const prev = pts[i - 1] ?? p0;
    const next = pts[i + 2] ?? p1;
    segs.push({
      p0,
      c1: { x: p0.x + (p1.x - prev.x) / 6, y: p0.y + (p1.y - prev.y) / 6 },
      c2: { x: p1.x - (next.x - p0.x) / 6, y: p1.y - (next.y - p0.y) / 6 },
      p1,
    });
  }
  return segs;
}

// SVG path `d` for a smooth curve through the points (viewBox 0..100).
export function smoothPathD(pts: Pt[]): string {
  if (pts.length < 2) return "";
  const segs = segments(pts);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (const s of segs) d += ` C ${s.c1.x} ${s.c1.y} ${s.c2.x} ${s.c2.y} ${s.p1.x} ${s.p1.y}`;
  return d;
}

const bez = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

// Sample the curve into a polyline with cumulative arc-length.
export function sampleCurve(pts: Pt[], perSeg = 24): { x: number; y: number; len: number }[] {
  if (pts.length < 2) return pts.map((p) => ({ ...p, len: 0 }));
  const segs = segments(pts);
  const out: { x: number; y: number; len: number }[] = [];
  let len = 0;
  let prev: Pt | null = null;
  for (let si = 0; si < segs.length; si++) {
    const s = segs[si];
    for (let k = (si === 0 ? 0 : 1); k <= perSeg; k++) {
      const t = k / perSeg;
      const x = bez(s.p0.x, s.c1.x, s.c2.x, s.p1.x, t);
      const y = bez(s.p0.y, s.c1.y, s.c2.y, s.p1.y, t);
      if (prev) len += Math.hypot(x - prev.x, y - prev.y);
      out.push({ x, y, len });
      prev = { x, y };
    }
  }
  return out;
}

export function totalLength(samples: { len: number }[]): number {
  return samples.length ? samples[samples.length - 1].len : 0;
}

// The point on the sampled curve at a given arc-length (clamped).
export function pointAtLength(samples: { x: number; y: number; len: number }[], target: number): Pt {
  if (samples.length === 0) return { x: 50, y: 50 };
  const total = samples[samples.length - 1].len;
  const t = Math.max(0, Math.min(total, target));
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].len >= t) {
      const a = samples[i - 1], b = samples[i];
      const span = b.len - a.len || 1;
      const f = (t - a.len) / span;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return { x: samples[samples.length - 1].x, y: samples[samples.length - 1].y };
}

// Arc-length of the sampled-curve point nearest to `p` (used to anchor each
// milestone onto the curve so the marker segments line up with the pins).
export function nearestLength(samples: { x: number; y: number; len: number }[], p: Pt): number {
  let best = 0, bestD = Infinity;
  for (const s of samples) {
    const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = s.len; }
  }
  return best;
}
