import type { MetricDef, RankRung } from "@/lib/providers/registry";

// Challenge entry rules, written the way a gamer reads them.
//
// A rule is stored as `{ metric, op, value }` and always has been — `flex_tier
// >= 2700`. That is what the scoring engine compares and it is not changing
// here, because a migration of live challenges to buy nicer wording would be a
// terrible trade.
//
// What changes is that nobody sees it. `flex_tier >= 2700` is a sentence in a
// language only we speak: an admin building a challenge has to know how League
// packs a rank into one number, and a gamer deciding whether to enter sees an
// inequality where a rank should be. Both ends now read "At least Diamond I in
// Flex 5v5 tier", and the builder offers the game's own ladder instead of a
// number box.
//
// The rungs are not ours. `MetricDef.ranks` comes from the provider registry,
// which builds each ladder from the same arithmetic the adapter uses to store a
// synced rank — so a rung's `value` is a real stored value, not a position in a
// list. Where an API has no named ladder — a rating, a win count — the rule
// stays a number, because inventing names for "1,800 rapid rating" would be
// worse than showing 1,800.

export type Condition = { metric: string; op: string; value: number };

/** The comparisons a rule can make. One wording, used by the builder and the card. */
export const RULE_OPS = [
  { op: ">=", label: "at least" },
  { op: "<=", label: "at most" },
  { op: "==", label: "exactly" },
  { op: ">", label: "more than" },
  { op: "<", label: "under" },
] as const;

export type RuleOp = (typeof RULE_OPS)[number]["op"];

/** Does this metric have rungs the game itself names? */
export function isRanked(metric: MetricDef | undefined): boolean {
  return !!metric?.ranks?.length;
}

/**
 * The name this game gives that value, or the number when it has none.
 *
 * A stored value almost never lands exactly on a rung — Gold II's floor is
 * 3,200 and a Gold II player on 40 LP is stored at 3,240 — so this resolves to
 * the highest rung at or below it, which is the rank they actually hold.
 */
export function valueLabel(metric: MetricDef | undefined, value: number): string {
  const ranks = metric?.ranks;
  if (!ranks?.length) return value.toLocaleString();
  let best: RankRung = ranks[0];
  for (const r of ranks) {
    if (value >= r.value) best = r;
    else break;
  }
  return best.label;
}

/**
 * One rule as a sentence.
 *
 * Ranked: `At least Diamond I in Flex 5v5 tier`.
 * Numeric: `At least 50 total wins`.
 */
export function ruleSentence(cond: Condition, metric: MetricDef | undefined): string {
  const opDef = RULE_OPS.find((o) => o.op === cond.op) ?? RULE_OPS[0];
  const name = metric?.label ?? cond.metric;
  const op = sentenceCase(opDef.label);
  if (isRanked(metric)) {
    return `${op} ${valueLabel(metric, cond.value)} in ${name}`;
  }
  const n = cond.value.toLocaleString();
  const unit = metric?.unit ? ` ${metric.unit}` : "";
  return `${op} ${n}${unit} ${name.toLowerCase()}`;
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Every rule on a challenge, as sentences.
 *
 * Returns an empty list when a challenge has no conditions, and the caller
 * decides what "no conditions" should say — a card has room for "Open to
 * everyone", a compact list may prefer to show nothing at all.
 */
export function ruleLines(
  conditions: Condition[] | null | undefined,
  capabilities: MetricDef[],
): string[] {
  const byKey = new Map(capabilities.map((c) => [c.key, c]));
  return (conditions ?? [])
    .filter((c) => c.metric)
    .map((c) => ruleSentence(c, byKey.get(c.metric)));
}

/** What a challenge with no conditions is: open. */
export const OPEN_TO_EVERYONE = "Open to everyone who links the game";

/**
 * The choices a builder should offer for this metric.
 *
 * A ranked metric gets the game's own ladder; anything else gets a number box,
 * signalled by an empty list. A rung's `value` IS the stored value, so picking
 * "Diamond I" writes the number a synced Diamond I account actually holds.
 */
export function valueChoices(metric: MetricDef | undefined): RankRung[] {
  return metric?.ranks ?? [];
}

/** Does one measured value satisfy one rule? */
export function meetsRule(cond: Condition, value: number): boolean {
  switch (cond.op) {
    case ">": return value > cond.value;
    case "<": return value < cond.value;
    case "<=": return value <= cond.value;
    case "==": return value === cond.value;
    default: return value >= cond.value;
  }
}

/**
 * The rules an account does NOT meet, as sentences.
 *
 * This is the entry gate, and it is measured against what an account HOLDS —
 * its current rank, its lifetime wins — not against what it gains during the
 * run. "Who can enter" can only mean the former: a rule read as a delta would
 * demand a gamer climb from Iron to Diamond inside one week to qualify for a
 * challenge they had already joined, and would then silently score them zero.
 *
 * A metric that hasn't synced yet counts as 0, so an unranked account fails a
 * rank floor rather than slipping through it.
 */
export function unmetRules(
  conditions: Condition[] | null | undefined,
  stats: Record<string, number>,
  capabilities: MetricDef[],
): string[] {
  const byKey = new Map(capabilities.map((c) => [c.key, c]));
  return (conditions ?? [])
    .filter((c) => c.metric && !meetsRule(c, stats[c.metric] ?? 0))
    .map((c) => ruleSentence(c, byKey.get(c.metric)));
}
