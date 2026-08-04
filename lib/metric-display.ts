// How a tracked stat is written down for a human — one rule, one file.
//
// Every synced stat has two faces. `metricValue` is the sortable number, and
// for a ladder game it is a position we derived (League's GOLD II becomes 2700
// so that a leaderboard can order it); `rankLabel` is what the game itself
// calls that position, and it is the only one a player recognises. A gamer
// looking at their own card should see the rank they earned, not the score we
// invented to sort it by.
//
// This existed as `rankLabel ?? fmtNum(value)` copied into four call sites, and
// the fifth surface — the feed dashboard — never selected `rankLabel` into its
// projection at all, so it could only ever print the number. That is the bug
// B26 was raised for. One helper, so the next ladder game inherits the rule
// instead of needing a fifth copy.
//
// The same split applies to the *name* of the stat. A key like `solo_tier`
// de-underscored reads "solo tier"; the provider registry already declares
// "Solo/Duo tier", which is what the game calls it.

import { fmtNum } from "@/lib/utils";
import { getProvider } from "@/lib/providers/registry";

/** The two faces of a stat, as stored in `stat_current`. */
export type MetricFace = {
  metricValue: number;
  rankLabel?: string | null;
  /** Optional suffix ("%", "h") — never appended to a rank label. */
  unit?: string | null;
};

/**
 * What to show a human. The rank label wins whenever there is one; the number
 * is for sorting and for everything that has no ladder.
 *
 * A unit is deliberately dropped when a rank label is present: "Gold II %" is
 * not a thing anyone wants to read.
 */
export function metricText(m: MetricFace): string {
  const label = m.rankLabel?.trim();
  if (label) return label;
  const n = fmtNum(m.metricValue);
  return m.unit ? `${n} ${m.unit}` : n;
}

/** True when this stat is a named rank rather than a figure. */
export function isRank(m: MetricFace): boolean {
  return !!m.rankLabel?.trim();
}

/**
 * The stat's display name, in the game's own words.
 *
 * Falls back to the de-underscored key only when the registry has no entry for
 * it — which happens for a stat synced before its capability was declared, and
 * an ugly label beats a blank one.
 */
export function metricLabel(providerId: string | null | undefined, metricKey: string): string {
  const cap = providerId ? getProvider(providerId)?.capabilities.find((c) => c.key === metricKey) : undefined;
  return cap?.label ?? metricKey.replace(/_/g, " ");
}

/** The registry's declared unit for a stat, if it has one. */
export function metricUnit(providerId: string | null | undefined, metricKey: string): string | null {
  const cap = providerId ? getProvider(providerId)?.capabilities.find((c) => c.key === metricKey) : undefined;
  return cap?.unit ?? null;
}
