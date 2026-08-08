// The daily CP ceiling, derived from money rather than typed. B88.3.
//
// ===== WHAT CHANGED =====
//
// The ceiling was 500, in a settings row, with no connection to the CP vault.
// Now:
//
//   today's ceiling = remaining allocation ÷ eligible gamers ÷ days left
//
// Every term is measured, and the whole thing is recomputed daily. More gamers
// arrive and it falls; a quiet day leaves money and tomorrow's rises. It cannot
// overspend the week, because the week's budget is its numerator.
//
// ===== THE THREE THINGS THAT ARE EASY TO GET WRONG =====
//
// **1. Which gamers?** Not "everyone registered" — that drags in dormant
// accounts and makes the ceiling meaninglessly small, and it means a gamer who
// signed up once in March permanently dilutes everybody. Eligible means: could
// earn today. Unlocked, not banned, active in the last 7 days, plus everyone who
// arrived today. Shown on the page, because a divisor nobody can see is a number
// nobody trusts.
//
// **2. Days left, including today.** Dividing by the whole week every day would
// spend it seven times. Dividing by 1 on Sunday is correct — the money has to go
// somewhere and the week is ending.
//
// **3. Bounded both ways.** Without a floor a growth spike makes a mission worth
// 4 CP, which reads as the product breaking. Without a cap a quiet week hands one
// gamer a fortune out of a reserve meant to last a month. The bounds are an
// admin's decision and they are part of the plan, not a safety net bolted on.
//
// ===== WHY IT IS RECOMPUTED ONCE A DAY, NOT PER REQUEST =====
//
// A ceiling that moves while a gamer is halfway through a mission takes
// something away mid-task. It is computed for the day and it holds for the day.

import { and, gte, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { weekBudget, daysLeftInWeek, weekStartOfDate } from "@/lib/allocations";
import { cpPerDollar } from "@/lib/marketplace";

/**
 * The bounds, and they are deliberately wide apart.
 *
 * The floor is not "a nice minimum" — it is the point below which a daily
 * mission stops being worth opening, and a mission nobody opens costs us the
 * habit we are paying to build.
 *
 * The cap is the worst case for one gamer in one day, which is the number the
 * whole abuse model is bounded by.
 */
export const CEILING_FLOOR = 50;
export const CEILING_CAP = 5000;

export type CeilingPlan = {
  /** What one gamer may be credited today. */
  ceiling: number;
  /** Dollars left in this week's CP allocation. */
  remaining: number;
  /** The divisor: gamers who could earn today. */
  eligible: number;
  /** Including today. 7 on Monday, 1 on Sunday. */
  daysLeft: number;
  /** CP per dollar, at the live rate. */
  rate: number;
  /** True when the raw figure was outside the bounds and was clamped. */
  clamped: "floor" | "cap" | null;
  /** What the arithmetic gave before clamping — shown, so the clamp is visible. */
  raw: number;
  /** One sentence, for the admin screen and the gamer's mission card. */
  note: string;
};

/**
 * Gamers who could be credited CP today.
 *
 * Deliberately NOT "every account". A gamer who has not opened the product in a
 * month costs the vault nothing, and counting them shrinks the ceiling for the
 * people who are actually here.
 *
 * "Active" is a 7-day window on quest events rather than the 1-day window
 * `activeGamers` uses for the vault runway. The runway asks "what did we spend
 * yesterday"; this asks "how many people might turn up today", and somebody who
 * played on Tuesday might well play on Thursday.
 *
 * New accounts count from the moment they exist. A gamer who joins this morning
 * can earn this afternoon, so they have to be in the divisor or the last person
 * through the door is funded out of everybody else's ceiling.
 */
export async function eligibleGamers(db: DB, now = new Date()): Promise<number> {
  try {
    const sevenDays = new Date(now.getTime() - 7 * 86400_000);
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [row] = await db.select({
      n: sql<number>`count(distinct ${schema.users.id})`,
    }).from(schema.users)
      .leftJoin(schema.questEvents, sql`${schema.questEvents.userId} = ${schema.users.id}
        and ${schema.questEvents.createdAt} >= ${sevenDays}`)
      .where(and(
        sql`${schema.users.status} = 'active'`,
        // Unlocked, or new enough to still be unlocking. A locked account can
        // still earn up to LOCKED_CP_CAP, so it draws on the vault and belongs
        // in the divisor.
        or(
          sql`${schema.questEvents.id} is not null`,
          gte(schema.users.createdAt, startOfToday),
        ),
        // `status` already carries this — active | suspended | banned — and is
        // checked above. There is no separate banned flag, and inventing one
        // here would have been a second source of truth for the same fact.
      ));
    return Math.max(0, Number(row?.n ?? 0));
  } catch { return 0; }
}

/**
 * Today's ceiling, from this week's remaining CP allocation.
 *
 * Returns a ceiling of 0 when nothing is released. That is not a failure state
 * and it is not the same as "unset": it means nobody funded this week, earning
 * is paused, and the note says so. Falling back to a default here would spend
 * money nobody released.
 */
export async function planDailyCeiling(db: DB, now = new Date()): Promise<CeilingPlan> {
  const [budget, eligible, rate] = await Promise.all([
    weekBudget(db, "cp", now),
    eligibleGamers(db, now),
    cpPerDollar(db),
  ]);
  const daysLeft = daysLeftInWeek(now);
  const remaining = budget.remaining;

  const base = {
    remaining, eligible, daysLeft, rate,
    week: budget.week,
  };

  // ===== NOBODY HAS RELEASED A BUDGET FOR THIS WEEK =====
  //
  // Not "zero". Nothing has been RELEASED, which is a different fact: the
  // allocation model is not in use yet.
  //
  // This distinction is the whole migration. Treating "no allocation" as a
  // ceiling of zero would mean the deploy that introduced this file silently
  // stopped every gamer on the platform earning, until somebody discovered a
  // screen they had never seen. Nothing changes for anyone until an admin
  // releases their first week — and from that moment the derived ceiling takes
  // over completely.
  if (!budget.exists) {
    const { DEFAULT_DAILY_CP_CEILING } = await import("@/lib/quests");
    return {
      ...base, ceiling: DEFAULT_DAILY_CP_CEILING, raw: DEFAULT_DAILY_CP_CEILING, clamped: null,
      note:
        `No weekly budget has been released, so the ceiling is the shipped default of `
        + `${DEFAULT_DAILY_CP_CEILING} CP. Release an amount on the week screen and it becomes derived: `
        + "the money left this week, divided by the gamers who could earn today, divided by the days left.",
    };
  }

  if (remaining <= 0) {
    return {
      ...base, ceiling: 0, raw: 0, clamped: null,
      note: budget.allocated > 0
        ? `This week's CP budget is spent. Nothing more is credited until ${weekKeyNext(now)} — every action is still recorded, and nothing is backdated when it reopens.`
        : "No CP has been released for this week, so nothing is earning. Release an amount on the week screen.",
    };
  }
  if (eligible <= 0) {
    // Nobody to divide by. Not zero — that would stop the first gamer through
    // the door from earning anything on the day they arrive.
    return {
      ...base, ceiling: CEILING_FLOOR, raw: CEILING_FLOOR, clamped: null,
      note: "Nobody has earned yet this week, so the ceiling sits at its floor until there is somebody to divide by.",
    };
  }

  const dollarsPerGamerPerDay = remaining / eligible / daysLeft;
  const raw = Math.floor(dollarsPerGamerPerDay * rate);
  const ceiling = Math.min(CEILING_CAP, Math.max(CEILING_FLOOR, raw));
  const clamped = raw < CEILING_FLOOR ? "floor" as const
    : raw > CEILING_CAP ? "cap" as const : null;

  return {
    ...base, ceiling, raw, clamped,
    note:
      `${money(remaining)} left this week ÷ ${eligible.toLocaleString()} gamer${eligible === 1 ? "" : "s"} `
      + `÷ ${daysLeft} day${daysLeft === 1 ? "" : "s"} = ${ceiling.toLocaleString()} CP each today`
      + (clamped === "floor"
        ? ` — the arithmetic gave ${raw.toLocaleString()}, held up to the ${CEILING_FLOOR} floor so a mission is still worth opening.`
        : clamped === "cap"
          ? ` — the arithmetic gave ${raw.toLocaleString()}, held down to the ${CEILING_CAP.toLocaleString()} cap.`
          : "."),
  };
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** The Monday after this one, for the "it reopens on" sentence. */
function weekKeyNext(now: Date): string {
  const next = new Date(weekStartOfDate(now).getTime() + 7 * 86400_000);
  return next.toISOString().slice(0, 10);
}
