// Who counts as an ACTIVE gamer, and how many there are. C12.
//
// THE FINDING: "expected active gamers" is the denominator of everyone's pay —
// the CP vault's runway, the per-gamer cost, the "one brand per 1,400 daily
// actives" floor the whole company runs on — and it was never defined anywhere.
// The only number resembling it was `DEFAULT_ASSUMPTIONS.dailyActive = 0.35`,
// a slider position in a calculator. A projection wearing a measurement's job.
//
// THE DEFINITION, and it is deliberately narrow:
//
//   A gamer is ACTIVE on a day if we CREDITED THEM CP that day.
//
// Not "logged in", not "opened a card", not "has an account". The reason is
// that this number's only job is to divide the CP vault, and the vault is only
// drained by gamers who were paid. Counting sessions would inflate the
// denominator with people who cost nothing, which understates the per-gamer
// cost and makes the runway look longer than it is — the exact direction of
// error that kills a company quietly.
//
// It also means the number is a BY-PRODUCT of the ledger rather than a second
// system: `quest_events` already records every credit, so there is nothing to
// keep in sync and nothing to backfill.
//
// What it is NOT: a growth metric. A gamer who plays every day and earns
// nothing because they hit their ceiling is active by any product definition
// and absent from this one. Anybody reporting engagement should count something
// else and say which.

import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/** The windows we report on. Daily is the one the vault arithmetic uses. */
export const ACTIVE_WINDOWS = { day: 1, week: 7, month: 30 } as const;
export type ActiveWindow = keyof typeof ACTIVE_WINDOWS;

export type ActiveCounts = {
  /** Distinct gamers credited CP in the last 1 / 7 / 30 days. */
  day: number;
  week: number;
  month: number;
  /** Gamers who have EVER been credited. The denominator of the ratio below. */
  everEarned: number;
  /**
   * Measured daily-active share, 0–1 — `day ÷ everEarned`.
   *
   * Null when nobody has ever earned, which is the honest answer on an empty
   * database. A zero here would be read as "0% active" and would silently make
   * every projection that divides by it produce Infinity or 0.
   */
  dailyActiveRate: number | null;
};

const EMPTY: ActiveCounts = { day: 0, week: 0, month: 0, everEarned: 0, dailyActiveRate: null };

/**
 * Count them.
 *
 * One query per window rather than a single grouped one, because the windows
 * overlap and a `count(distinct)` per window is both simpler to read and
 * simpler to prove right than a pivot. This runs on an admin screen, not a
 * request path.
 *
 * A credit of zero CP does not count. `awardQuestAction` writes a row whenever
 * an action fires, including when the gamer is at their ceiling and earns
 * nothing — and somebody who was paid nothing did not drain the vault.
 */
export async function activeGamers(db: DB, now = new Date()): Promise<ActiveCounts> {
  try {
    const since = (days: number) => new Date(now.getTime() - days * 86400_000);
    const countSince = async (days: number) => {
      const [r] = await db.select({
        n: sql<number>`count(distinct ${schema.questEvents.userId})`,
      }).from(schema.questEvents)
        .where(sql`${schema.questEvents.cpAwarded} > 0 and ${schema.questEvents.createdAt} >= ${since(days)}`);
      return Number(r?.n ?? 0);
    };
    const [day, week, month] = await Promise.all([
      countSince(ACTIVE_WINDOWS.day),
      countSince(ACTIVE_WINDOWS.week),
      countSince(ACTIVE_WINDOWS.month),
    ]);
    const [ever] = await db.select({
      n: sql<number>`count(distinct ${schema.questEvents.userId})`,
    }).from(schema.questEvents).where(sql`${schema.questEvents.cpAwarded} > 0`);
    const everEarned = Number(ever?.n ?? 0);
    return {
      day, week, month, everEarned,
      dailyActiveRate: everEarned > 0 ? day / everEarned : null,
    };
  } catch {
    // A missing table reads as "nothing measured", never as zero activity.
    return EMPTY;
  }
}

/**
 * What the CP vault can carry, at a rate and a ceiling.
 *
 * The arithmetic the model rests on, in one place so the calculator, the vault
 * screen and any deck all quote the same figure:
 *
 *   gamer-days = vault dollars × CP per dollar ÷ daily ceiling
 *
 * `docs/COMMERCIAL_MODEL_V2.md` §3. At $52.50 into the vault per $350
 * challenge, 10,000 CP/$1 and a 500 CP/day ceiling, one challenge sold funds
 * 1,050 gamer-days of MAXIMAL earning — and a maximal gamer is the worst case,
 * not the forecast, which is why this returns days rather than a date.
 */
export function vaultGamerDays(vaultDollars: number, cpPerDollar: number, dailyCeiling: number): number {
  if (!(dailyCeiling > 0) || !(cpPerDollar > 0)) return 0;
  return Math.max(0, Math.floor((vaultDollars * cpPerDollar) / dailyCeiling));
}

/**
 * How long the vault lasts at a measured population, in days.
 *
 * Null when there is nothing to divide by — an unmeasured population, or none.
 * Returning Infinity or a large number would read as "we are fine".
 */
export function vaultRunwayDays(
  vaultDollars: number,
  cpPerDollar: number,
  dailyCeiling: number,
  dailyActiveGamers: number,
): number | null {
  if (!(dailyActiveGamers > 0)) return null;
  return Math.floor(vaultGamerDays(vaultDollars, cpPerDollar, dailyCeiling) / dailyActiveGamers);
}
