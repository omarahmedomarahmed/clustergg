// Turning the CP vault into a daily number. C1.
//
// THE PROBLEM THE MODEL POSED: "tomorrow's mission CP comes from the vault." It
// cannot, directly — `lib/missions.ts:4-9` is explicit that **a mission awards
// no CP of its own.** A mission is a view over actions the gamer already does,
// priced by `ACTION_CATALOG` and capped by B17. There was no dial.
//
// THREE WAYS TO BUILD ONE. Only the third is safe:
//
//   1. Pay a bonus on mission completion. **No.** The moment a mission pays,
//      the daily ceiling stops being the ceiling and the exposure doubles
//      through a feature that reads as copywriting. `missions.ts:7-9`.
//   2. Scale every action weight. **No.** It breaks the 125-per-quest invariant
//      the mission arithmetic rests on, and it drags `win_challenge` and
//      `connect_account` along — one-off actions whose price has nothing to do
//      with how much a daily is worth.
//   3. **Set the ceiling, and scale only the weights beneath it.** Yes. The
//      ceiling stays the hard bound, so the worst case is bounded by the number
//      we chose rather than by the sum of a table.
//
// This module computes (3). It writes nothing: it returns a plan, and an admin
// applies it. A dial that turns itself is a dial nobody watches.

import { ACTION_CATALOG, DEFAULT_DAILY_CP_CEILING } from "@/lib/quests";
import { MISSION_TEMPLATES } from "@/lib/missions";
import { vaultGamerDays } from "@/lib/active-gamers";

/**
 * The actions a daily mission can ask for.
 *
 * Read from the templates rather than listed here, so an admin who edits a
 * mission cannot leave this file behind. Anything NOT in this set — winning a
 * challenge, connecting an account, the once-ever actions — keeps its price
 * whatever the dial does, because those are paid for being rare and scaling
 * them would make a milestone cheaper on a quiet month.
 */
export function missionEligibleActions(): string[] {
  const out = new Set<string>();
  for (const t of MISSION_TEMPLATES) for (const task of t.tasks) out.add(task.action);
  return [...out];
}

export type DialPlan = {
  /** The new hard ceiling, CP per gamer per day. */
  ceiling: number;
  /** Multiplier applied to mission-eligible weights. 1 means nothing moves. */
  scale: number;
  /** key → new weight, only for actions that change. Rounded to whole CP. */
  weights: Record<string, number>;
  /** What ONE mission is worth at the new weights. Should equal the ceiling. */
  missionTotal: number;
  /** What the eligible table could pay if a gamer maxed every action. */
  eligibleCapSum: number;
  /** Actions deliberately left alone, and why — printed, not implied. */
  untouched: string[];
  /** One sentence for whoever is about to press apply. */
  note: string;
};

/**
 * Plan a move to `targetDailyCp`.
 *
 * `targetDailyCp` is the ceiling — the most one gamer can be credited in a day.
 *
 * WHAT IS SCALED TO IT: the MISSION, not the whole table. A day's mission is a
 * fixed list of tasks that totals 500 CP today, and that total is the number a
 * gamer is actually shown and actually chases. Scaling the table's Σ(weight ×
 * cap) instead would be scaling a number nobody can reach — every action at its
 * cap, every day — and at a 500 ceiling it would have rescaled every weight to
 * make a 1,230-CP table sum to 500, cutting every price by 60% to change
 * nothing.
 *
 * So: mission total → ceiling. At the current ceiling the plan is empty, which
 * is the property that makes this safe to run at any time.
 *
 * The 125-per-quest invariant (`tests/db/missions.mts`) is not broken by this,
 * because every mission-eligible weight moves by the SAME factor — the blocks
 * stay in proportion. A per-action edit would break it; a uniform scale cannot.
 */
export function planCpDial(
  targetDailyCp: number,
  current: { key: string; weight: number; cap: number }[] = ACTION_CATALOG.map(
    (a) => ({ key: a.key, weight: a.defaultWeight, cap: a.defaultCap }),
  ),
): DialPlan {
  const ceiling = Math.max(0, Math.round(targetDailyCp));
  const eligible = new Set(missionEligibleActions());

  // What ONE mission is worth, at these weights. Averaged across the templates
  // because a week picks one and they are all meant to be worth the same — if
  // they ever drift, the average is the honest thing to scale rather than
  // whichever one happens to be first in the file.
  const weightOf = (rows: { key: string; weight: number }[]) =>
    new Map(rows.map((a) => [a.key, a.weight]));
  const missionTotal = (rows: { key: string; weight: number }[]) => {
    const w = weightOf(rows);
    const totals = MISSION_TEMPLATES.map((t) =>
      t.tasks.reduce((s, task) => s + (w.get(task.action) ?? 0) * task.count, 0));
    return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  };
  const today = missionTotal(current);

  // Kept for the plan's report: what the eligible table could pay if somebody
  // maxed every action. Uncapped actions are excluded rather than treated as
  // infinite — B17 caps every action a mission uses anyway.
  const capSumOf = (rows: { key: string; weight: number; cap: number }[]) =>
    rows.filter((a) => eligible.has(a.key) && a.cap > 0)
      .reduce((s, a) => s + a.weight * a.cap, 0);

  const scale = today > 0 && ceiling > 0 ? ceiling / today : 1;
  const weights: Record<string, number> = {};
  if (Math.abs(scale - 1) > 0.005) {
    for (const a of current) {
      if (!eligible.has(a.key)) continue;
      // Floor of 1 CP on anything that used to pay. Scaling an action to zero
      // silently retires it, and a retired action still listed in a mission is
      // a task worth nothing that a gamer is being asked to do.
      const next = a.weight > 0 ? Math.max(1, Math.round(a.weight * scale)) : 0;
      if (next !== a.weight) weights[a.key] = next;
    }
  }

  const applied = current.map((a) => ({ ...a, weight: weights[a.key] ?? a.weight }));
  const untouched = current.filter((a) => !eligible.has(a.key) && a.weight > 0).map((a) => a.key);

  return {
    ceiling,
    scale: Math.round(scale * 1000) / 1000,
    weights,
    missionTotal: Math.round(missionTotal(applied)),
    eligibleCapSum: Math.round(capSumOf(applied)),
    untouched,
    note: ceiling === 0
      ? "Ceiling 0 — nothing earns. Everything is still recorded, and nothing is backdated when it reopens."
      : `Ceiling ${ceiling} CP/day. ${Object.keys(weights).length} mission action${Object.keys(weights).length === 1 ? "" : "s"} rescaled ×${(Math.round(scale * 100) / 100).toFixed(2)}; ${untouched.length} one-off action${untouched.length === 1 ? "" : "s"} left at their price.`,
  };
}

/**
 * What the vault can afford, as a daily ceiling.
 *
 * The other direction: instead of "make it 500", ask "what is 500 costing, and
 * how long does the vault last". Given a vault balance, a CP rate and how many
 * gamers are active, this is the ceiling that spends the vault over `days`.
 *
 * Returns null when there is nobody to divide by — see `vaultRunwayDays` for
 * why an unmeasured population must not produce a comfortable number.
 */
export function affordableCeiling(opts: {
  vaultDollars: number;
  cpPerDollar: number;
  dailyActiveGamers: number;
  days: number;
}): number | null {
  if (!(opts.dailyActiveGamers > 0) || !(opts.days > 0)) return null;
  const totalCp = opts.vaultDollars * opts.cpPerDollar;
  return Math.max(0, Math.floor(totalCp / (opts.dailyActiveGamers * opts.days)));
}

/** The shipped ceiling, for anything that needs a starting point. */
export const DEFAULT_CEILING = DEFAULT_DAILY_CP_CEILING;

/** Re-exported so a caller planning a dial can show the runway beside it. */
export { vaultGamerDays };
