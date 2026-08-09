// Size tiers. LABELS, not rates.
//
// Split out of `week-close.ts` by B99 so the scoring (`week-standing.ts`) and
// the close can both read them without importing each other — the close calls
// the standing, so the standing cannot reach back into the close.
//
// A tier decides who a server competes against, and nothing else. The old model
// paid a percentage per tier, which is the thing v2 replaced with the pool —
// see C3. Thresholds are qualified linked members, the same count the snapshot
// records and the same one an owner is shown.

export const TIERS = [
  { key: "small", floor: 0 },
  { key: "mid", floor: 500 },
  { key: "large", floor: 5000 },
] as const;

export type TierKey = (typeof TIERS)[number]["key"];

export const tierOf = (qualified: number): TierKey => {
  let k: TierKey = "small";
  for (const t of TIERS) if (qualified >= t.floor) k = t.key;
  return k;
};
