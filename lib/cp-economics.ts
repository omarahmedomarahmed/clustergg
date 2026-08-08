// What we give away, modelled before we give it (B16).
//
// Pure functions, no I/O. That is not tidiness — it is so the calculator, the
// tests and anybody's spreadsheet can all be shown the same arithmetic, and so
// the one screen where a wrong number costs real money can be checked without
// standing a database up.
//
// **Read B34 before touching a weight.** B34 decided what the numbers ARE (the
// rate, the table, the ceiling); this file decides what they MEAN at a
// population. Two different questions, and the second is worthless if somebody
// quietly changes the first.

import { ACTION_CATALOG, ACTION_CAP_SUM, DEFAULT_DAILY_CP_CEILING, type QuestActionKey } from "@/lib/quests";
import { DEFAULT_CP_PER_DOLLAR } from "@/lib/cp-rate";

/** One action's economics, as configured right now. */
export type ActionConfig = {
  key: string;
  label: string;
  /** CP per occurrence. */
  weight: number;
  /** Occurrences that pay, per gamer per UTC day. 0 means uncapped. */
  cap: number;
  /** Quest keys listening to this action. */
  quests: string[];
};

export type EconConfig = {
  actions: ActionConfig[];
  /** CP to the dollar. */
  cpPerDollar: number;
  /** The hard per-gamer daily ceiling, across every action. 0 disables it. */
  ceiling: number;
};

/**
 * Assumptions, kept separate from the config on purpose.
 *
 * "Every gamer maxes every action every day" is the WORST CASE, not the
 * forecast, and the two must never be reported as one number. A model that
 * shows only the worst case gets ignored as alarmist; one that shows only the
 * forecast gets us killed by the month it is wrong.
 */
export type Assumptions = {
  /** Share of the population active on a given day, 0–1. */
  dailyActive: number;
  /** Share of their available cap an active gamer actually reaches, 0–1. */
  capReach: number;
};

/**
 * The slider's starting position. NOT a measurement — C12.
 *
 * `dailyActive: 0.35` was the only number in the codebase resembling "expected
 * active gamers", which is the denominator of the CP vault's runway and of
 * everyone's pay. It is a plausible opening guess for a calculator and nothing
 * more. The measured definition, and the count that goes with it, is
 * `lib/active-gamers.ts` — use that anywhere a decision depends on the answer.
 */
export const DEFAULT_ASSUMPTIONS: Assumptions = { dailyActive: 0.35, capReach: 0.30 };

/** The shipped configuration, before an admin has touched anything. */
export function defaultConfig(): EconConfig {
  return {
    cpPerDollar: DEFAULT_CP_PER_DOLLAR,
    ceiling: DEFAULT_DAILY_CP_CEILING,
    actions: ACTION_CATALOG.map((a) => ({
      key: a.key, label: a.label, weight: a.defaultWeight, cap: a.defaultCap, quests: [a.group],
    })),
  };
}

/** What one action can pay a single gamer in a day. Uncapped reads as Infinity. */
export function actionMaxDaily(a: ActionConfig): number {
  if (a.cap <= 0) return Infinity;
  // NOT multiplied by a.quests.length. Before B34 an action paid every listening
  // quest, so two quests doubled both the payout and the cap; B34.2 made CP a
  // once-per-action credit and left progress on every quest. If this line ever
  // grows a `* quests.length` again, the multiplier is back.
  return a.weight * a.cap;
}

/**
 * The most one gamer can be credited in a day.
 *
 * Two numbers, and the gap between them is the point: `table` is what the
 * per-action caps sum to, `capped` is what the ceiling actually allows. The
 * caps shape behaviour; the ceiling is the guarantee.
 */
export function maxDailyCp(c: EconConfig): { table: number; capped: number; uncapped: boolean } {
  const uncapped = c.actions.some((a) => a.cap <= 0 && a.weight > 0);
  const table = c.actions.reduce((s, a) => s + (a.cap > 0 ? a.weight * a.cap : 0), 0);
  if (uncapped) return { table: Infinity, capped: c.ceiling > 0 ? c.ceiling : Infinity, uncapped };
  return { table, capped: c.ceiling > 0 ? Math.min(table, c.ceiling) : table, uncapped };
}

/** Worst-case dollars per day at a population. */
export function maxDailyCost(c: EconConfig, gamers: number): number {
  const { capped } = maxDailyCp(c);
  if (!Number.isFinite(capped)) return Infinity;
  return (capped / c.cpPerDollar) * gamers;
}

/** The forecast: what it costs if the assumptions hold rather than the worst case. */
export function expectedDailyCost(c: EconConfig, gamers: number, a: Assumptions): number {
  const { capped } = maxDailyCp(c);
  if (!Number.isFinite(capped)) return Infinity;
  return (capped / c.cpPerDollar) * gamers * clamp01(a.dailyActive) * clamp01(a.capReach);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export type Liability = { key: string; label: string; why: string };

/**
 * Everything still open, and why.
 *
 * An uncapped action is listed as an open liability WITH ITS REASON rather than
 * silently zeroed. Some genuinely should not be rationed — winning a challenge
 * is not a thing to ration — and a model that hides that is lying by omission
 * to the person deciding whether to raise a weight.
 */
export function exposure(c: EconConfig, gamers = 1_000_000): {
  perGamerCp: number; perGamerCost: number; worstCase: number;
  uncapped: Liability[]; ceilingHolds: boolean;
} {
  const { capped, table } = maxDailyCp(c);
  const uncapped: Liability[] = c.actions
    .filter((a) => a.cap <= 0 && a.weight > 0)
    .map((a) => ({
      key: a.key, label: a.label,
      why: c.ceiling > 0
        ? `No cap of its own. Bounded only by the ${c.ceiling.toLocaleString()} CP daily ceiling — which means it can consume the whole day's budget on its own.`
        : "No cap and no ceiling. This action is unbounded: one script can mint Cluster Points until somebody notices.",
    }));
  return {
    perGamerCp: capped,
    perGamerCost: Number.isFinite(capped) ? capped / c.cpPerDollar : Infinity,
    worstCase: maxDailyCost(c, gamers),
    uncapped,
    // The ceiling is doing work only if it is actually lower than the table.
    ceilingHolds: c.ceiling > 0 && (!Number.isFinite(table) || c.ceiling < table),
  };
}

/**
 * Every action reachable without spending money or playing a game, ranked by
 * CP per minute.
 *
 * This is the abuse surface. Winning a challenge is expensive to fake because
 * it requires actually being good at a game we track; writing a comment costs
 * a few seconds. The ranking is what a second account would do first, so it is
 * also the order in which B35's defences matter.
 */
export type AbuseRow = { key: string; label: string; cpPerDay: number; secondsEach: number; cpPerMinute: number };

/**
 * Seconds of unavoidable human effort per occurrence, for actions a person can
 * do without playing anything. An action absent from this map needs a game, a
 * result, or another person's money, and is not on the free surface.
 */
const SELF_SERVE_SECONDS: Partial<Record<QuestActionKey, number>> = {
  write_post: 40,
  write_comment: 12,
  reaction_given: 3,
  join_planet: 10,
  message_new: 20,
  ad_impression: 6,
  ad_click: 4,
  botlist_vote: 45,
  connect_account: 90,
  bot_added: 120,
};

export function abuseSurface(c: EconConfig): AbuseRow[] {
  return c.actions
    .map((a) => {
      const secondsEach = SELF_SERVE_SECONDS[a.key as QuestActionKey];
      if (secondsEach === undefined || a.weight <= 0) return null;
      const occurrences = a.cap > 0 ? a.cap : 240;   // an uncapped action is only bounded by patience
      const cpPerDay = a.weight * occurrences;
      return {
        key: a.key, label: a.label, cpPerDay, secondsEach,
        cpPerMinute: (a.weight / secondsEach) * 60,
      };
    })
    .filter((r): r is AbuseRow => r !== null)
    .sort((a, b) => b.cpPerMinute - a.cpPerMinute);
}

/**
 * How long a determined faker needs to reach a dollar — WITH the caps applied.
 *
 * The first version of this took the fastest action and ignored its cap, which
 * answered a question about a platform we do not run: at 25 CP in 4 seconds it
 * reported 27 minutes per dollar, when clicking an ad is capped at 3 a day and
 * pays 75 CP however long anybody sits there.
 *
 * What actually bounds a faker is the pair of limits the platform really has:
 * every action's daily cap, and the global ceiling on top of them. So the model
 * is now the honest one — fill a day with every self-serve action up to its cap,
 * see how much that pays and how long it takes, and count how many ACCOUNT-DAYS
 * a dollar needs. It reports minutes of work per dollar across all of them.
 *
 * The difference is not cosmetic: it is 27 minutes versus about six hours, and
 * the second number is the one a decision should be made on.
 */
export function minutesPerDollar(c: EconConfig): number | null {
  const surface = abuseSurface(c);
  if (!surface.length) return null;

  // One account, one day, doing everything self-serve up to its cap.
  const rawCp = surface.reduce((sum, r) => sum + r.cpPerDay, 0);
  // The ceiling still applies, and it is usually what binds.
  const cpPerAccountDay = c.ceiling > 0 ? Math.min(rawCp, c.ceiling) : rawCp;
  if (cpPerAccountDay <= 0) return null;

  const secondsPerAccountDay = surface.reduce((sum, r) => {
    const occurrences = r.cpPerDay / Math.max(1, r.cpPerMinute * r.secondsEach / 60);
    return sum + occurrences * r.secondsEach;
  }, 0);

  const accountDays = c.cpPerDollar / cpPerAccountDay;
  return (accountDays * secondsPerAccountDay) / 60;
}

/**
 * The old figure, kept and renamed for what it actually is.
 *
 * Useful for pricing ONE action — "is 25 CP for a click too much?" — and
 * misleading as a measure of the platform, which is how it came to say 27
 * minutes. Nothing should gate on this.
 */
export function fastestActionMinutesPerDollar(c: EconConfig): number | null {
  const best = abuseSurface(c)[0];
  if (!best || best.cpPerMinute <= 0) return null;
  return c.cpPerDollar / best.cpPerMinute;
}

/** The shipped table's own worst case, for anything that needs it without a config. */
export const SHIPPED_CAP_SUM = ACTION_CAP_SUM;
