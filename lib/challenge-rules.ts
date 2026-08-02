import type { MetricDef } from "@/lib/providers/registry";

// Challenge entry rules, written the way a gamer reads them.
//
// A rule is stored as `{ metric, op, value }` and always has been — `solo_tier
// >= 4`. That is what the scoring engine compares and it is not changing here,
// because a migration of live challenges to buy nicer wording would be a
// terrible trade.
//
// What changes is that nobody sees it. `solo_tier >= 4` is a sentence in a
// language only we speak: an admin building a challenge has to know that LoL
// tiers are an ordered list and that Gold is the fourth, and a gamer deciding
// whether to enter sees an inequality where a rank name should be. Both ends
// now read "Gold or above in Solo/Duo", and the builder offers the rank NAMES
// the game's own API gives us instead of a number box.
//
// The rank names are not ours: `MetricDef.rankLabels` comes from the provider
// registry, which mirrors what each API returns. Where an API has no named
// ladder — a rating, a win count — the rule stays a number, because inventing
// names for "1,800 rapid rating" would be worse than showing 1,800.

export type Condition = { metric: string; op: string; value: number };

/** The comparisons a rule can make, in both languages. */
export const RULE_OPS = [
  { op: ">=", ranked: "or above", numeric: "at least" },
  { op: "<=", ranked: "or below", numeric: "at most" },
  { op: "==", ranked: "exactly", numeric: "exactly" },
  { op: ">", ranked: "above", numeric: "more than" },
  { op: "<", ranked: "below", numeric: "under" },
] as const;

export type RuleOp = (typeof RULE_OPS)[number]["op"];

/** Does this metric have names the game itself uses? */
export function isRanked(metric: MetricDef | undefined): boolean {
  return !!metric?.rankLabels?.length;
}

/** The name this game gives that value, or the number when it has none. */
export function valueLabel(metric: MetricDef | undefined, value: number): string {
  const labels = metric?.rankLabels;
  if (!labels?.length) return value.toLocaleString();
  const i = Math.max(0, Math.min(labels.length - 1, Math.round(value)));
  return titleCase(labels[i]);
}

/** `CHALLENGER` → `Challenger`. The APIs shout; a card shouldn't. */
function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * One rule as a sentence.
 *
 * Ranked: `Gold or above in Solo/Duo`.
 * Numeric: `At least 50 total wins`.
 *
 * Reads left-to-right in both cases, which is why the ranked form puts the
 * value first: a rank is the subject of the sentence, a count is not.
 */
export function ruleSentence(cond: Condition, metric: MetricDef | undefined): string {
  const opDef = RULE_OPS.find((o) => o.op === cond.op) ?? RULE_OPS[0];
  const name = metric?.label ?? cond.metric;
  if (isRanked(metric)) {
    return `${valueLabel(metric, cond.value)} ${opDef.ranked} in ${name}`;
  }
  const n = cond.value.toLocaleString();
  const unit = metric?.unit ? ` ${metric.unit}` : "";
  return `${sentenceCase(opDef.numeric)} ${n}${unit} ${name.toLowerCase()}`;
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
 * signalled by an empty list. The index IS the stored value, which is what the
 * adapters already write into `stat_current` for tier metrics.
 */
export function valueChoices(metric: MetricDef | undefined): { value: number; label: string }[] {
  if (!isRanked(metric)) return [];
  return (metric!.rankLabels ?? []).map((l, i) => ({ value: i, label: titleCase(l) }));
}
