// Cluster "player level" derived from total Cluster Points — the number on the
// mobile game HUD's XP bar. A gently rising triangular curve: each level costs
// a bit more CP than the last, so early levels come fast and later ones feel
// earned (like a mobile game's account level).
const BASE = 200; // CP for the very first level-up

// Cumulative CP required to *reach* level L (L>=1). Level 1 starts at 0.
export function cpForLevel(L: number): number {
  return Math.round((BASE * (L - 1) * L) / 2);
}

export type LevelInfo = { level: number; into: number; span: number; next: number; pct: number };

export function levelFromCp(cp: number): LevelInfo {
  const c = Math.max(0, Math.floor(cp || 0));
  let level = Math.floor((1 + Math.sqrt(1 + (8 * c) / BASE)) / 2);
  if (level < 1) level = 1;
  const start = cpForLevel(level);
  const next = cpForLevel(level + 1);
  const span = Math.max(1, next - start);
  const into = Math.max(0, c - start);
  return { level, into, span, next, pct: Math.min(100, Math.round((into / span) * 100)) };
}
