import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import {
  dayKey, parseScheduled, parseMilestones, progressOf, streakFrom,
  milestonesHit, nextMilestone, templateForWeek,
  type Milestone, type MissionProgress, type ScheduledMission,
} from "@/lib/missions";
import { DEFAULT_DAILY_CP_CEILING } from "@/lib/quests";

// The Daily Mission, connected to something. B113.
//
// ===== WHAT WAS ACTUALLY WRONG =====
//
// `lib/missions.ts` is a complete system: mission templates, per-day schedules,
// task progress, a streak that loops, milestones that award trophies. It has 89
// assertions in `tests/db/missions.mts`, all green.
//
// **Nothing imported it.** Not one page, not one action, not the bot. A grep for
// `from "@/lib/missions"` returned a single hit — `lib/cp-dial.ts`, which reads
// the templates to price them for an admin screen and never asks whether
// anybody is running one.
//
// So: no gamer has ever seen a daily mission. No streak has ever been counted.
// `milestonesHit` has never been called, which means **no milestone trophy has
// ever been awarded to anyone** — while `lib/cards/render.tsx` tells gamers
// their trophy might have been "earned at a streak milestone". A promise in the
// product with no path behind it.
//
// That is a worse defect than a missing feature, and it is the reason this file
// is a wiring job rather than a new one. Almost nothing here is new logic; it is
// the reader, the writer and the award path that were never built around logic
// that already worked.
//
// ===== WHY THE STREAK IS DERIVED, LIKE EVERYTHING ELSE =====
//
// There is no `streak` column and there should not be. A stored counter and the
// events it came from disagree the first time a job runs twice, an event is
// backdated, or a day rolls over in the wrong timezone — and the stored one is
// the one nobody can reconstruct. So the streak is a query over `quest_events`
// grouped by UTC day, exactly like every balance in this codebase.
//
// ===== WHY MILESTONE AWARDS ARE IDEMPOTENT ON A SYNTHETIC KEY =====
//
// The streak is a LOOP, not a ladder: day 7 awards its trophy, a missed day
// resets to zero, and climbing back to 7 awards it again. So "have they had the
// 7-day trophy" is the wrong question — "have they had it FOR THIS RUN" is the
// right one. The key is the day the current streak started, written into
// `user_trophies.challengeId`, which is a free-text column with no foreign key.

/** Where the day's mission schedule lives, when staff have set one. */
export const MISSION_SCHEDULE_KEY = "missions.schedule";
/** Where the streak milestones live. */
export const MILESTONES_KEY = "missions.milestones";

/**
 * The milestones a gamer is climbing toward when staff have set none.
 *
 * A default rather than an empty list, because an empty list means the streak
 * counts and rewards nothing — which is indistinguishable, to a gamer, from the
 * feature not existing. `trophyId: null` means "a milestone with no prize yet":
 * it still shows on the band and still marks the run, and staff attach a trophy
 * when they have one.
 */
export const DEFAULT_MILESTONES: Milestone[] = [
  { days: 3, trophyId: null },
  { days: 7, trophyId: null },
  { days: 14, trophyId: null },
  { days: 30, trophyId: null },
];

/** How far back the streak is counted. Longer than the longest milestone. */
export const STREAK_LOOKBACK_DAYS = 120;

/** Marks a trophy awarded by the streak rather than by a challenge. */
export const STREAK_SOURCE = "streak";

/** `streak:<days>:<the day this run began>` — unique per milestone per run. */
export const streakAwardKey = (days: number, runStart: string) =>
  `${STREAK_SOURCE}:${days}:${runStart}`;

async function settingRaw(db: DB, key: string): Promise<unknown> {
  try {
    const [row] = await db.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings).where(eq(schema.platformSettings.key, key)).limit(1);
    return row?.value ?? null;
  } catch { return null; }
}

/**
 * Every UTC day in the window where the FULL ceiling was earned.
 *
 * One query. The alternative — a row per day, or a call per day — is the shape
 * that turns a nav band into a hundred queries on every page load.
 */
export async function fullDaysFor(
  db: DB, userId: string, ceiling = DEFAULT_DAILY_CP_CEILING, lookbackDays = STREAK_LOOKBACK_DAYS,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (ceiling <= 0) return out;
  try {
    const since = new Date(Date.now() - lookbackDays * 86400000);
    const rows = await db.select({
      day: sql<string>`to_char(${schema.questEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      cp: sql<number>`coalesce(sum(${schema.questEvents.cpAwarded}), 0)`,
    }).from(schema.questEvents)
      .where(and(eq(schema.questEvents.userId, userId), gte(schema.questEvents.createdAt, since)))
      .groupBy(sql`1`);
    for (const r of rows) if (Number(r.cp) >= ceiling) out.add(String(r.day));
    return out;
  } catch { return out; }
}

export type LiveMission = {
  /** Today's mission and how far through it they are. */
  progress: MissionProgress;
  /** Consecutive full days, ending today or yesterday. */
  streak: number;
  /** The day the current run began, or today when the streak is 0. */
  runStart: string;
  milestones: Milestone[];
  /** The next one and how many days away, or null past the last. */
  next: { milestone: Milestone; away: number } | null;
  /** Milestones already banked in THIS run. */
  reached: number[];
};

/** The first day of the run ending on the most recent full day. */
export function runStartOf(fullDays: Set<string>, streak: number, now = new Date()): string {
  if (streak <= 0) return dayKey(now);
  // Walk back from today until the streak's length is consumed. Today may not
  // be a full day yet — a streak of 3 finishing yesterday is still a streak of
  // 3 — so the walk starts wherever the run actually ends.
  const day = (offset: number) => dayKey(new Date(now.getTime() - offset * 86400000));
  let end = 0;
  while (!fullDays.has(day(end)) && end < 2) end++;
  return day(end + streak - 1);
}

/**
 * Everything a surface needs to draw the mission and the streak.
 *
 * Read-only. The award path is separate and explicit, because a page render
 * should not be the thing that hands somebody a trophy — `unlockState`
 * promotes on read and that is defensible for a flag, but writing a
 * redeemable prize as a side effect of drawing a nav band is not.
 */
export async function liveMission(db: DB, userId: string, now = new Date()): Promise<LiveMission> {
  const [scheduleRaw, milestoneRaw] = await Promise.all([
    settingRaw(db, MISSION_SCHEDULE_KEY),
    settingRaw(db, MILESTONES_KEY),
  ]);

  const today = dayKey(now);
  // No schedule set means this week's shipped template, not "no mission". A
  // gamer must never open the app to an empty day because staff have not
  // configured something.
  const mission: ScheduledMission = scheduleRaw
    ? parseScheduled((scheduleRaw as Record<string, unknown>)?.[today] ?? null, today)
    : parseScheduled(null, today, [templateForWeek(now)]);

  const parsed = parseMilestones(milestoneRaw);
  const milestones = parsed.length ? parsed : DEFAULT_MILESTONES;

  const [fullDays, counts, earned] = await Promise.all([
    fullDaysFor(db, userId),
    countsToday(db, userId, now),
    cpToday(db, userId, now),
  ]);

  const streak = streakFrom(fullDays, now);
  const runStart = runStartOf(fullDays, streak, now);
  const reached = await reachedThisRun(db, userId, runStart);

  return {
    progress: progressOf(mission, counts, earned),
    streak,
    runStart,
    milestones,
    next: nextMilestone(streak, milestones),
    reached,
  };
}

async function countsToday(db: DB, userId: string, now: Date): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const rows = await db.select({
      action: schema.questEvents.actionKey,
      n: sql<number>`count(*)`,
    }).from(schema.questEvents)
      .where(and(eq(schema.questEvents.userId, userId), gte(schema.questEvents.createdAt, start)))
      .groupBy(schema.questEvents.actionKey);
    for (const r of rows) out[String(r.action)] = Number(r.n);
    return out;
  } catch { return out; }
}

async function cpToday(db: DB, userId: string, now: Date): Promise<number> {
  try {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [row] = await db.select({ n: sql<number>`coalesce(sum(${schema.questEvents.cpAwarded}), 0)` })
      .from(schema.questEvents)
      .where(and(eq(schema.questEvents.userId, userId), gte(schema.questEvents.createdAt, start)));
    return Number(row?.n ?? 0);
  } catch { return 0; }
}

/** Which milestones have already been banked in this run. */
export async function reachedThisRun(db: DB, userId: string, runStart: string): Promise<number[]> {
  try {
    const rows = await db.select({ key: schema.userTrophies.challengeId })
      .from(schema.userTrophies).where(eq(schema.userTrophies.userId, userId));
    const days: number[] = [];
    for (const r of rows) {
      const parts = String(r.key ?? "").split(":");
      if (parts[0] === STREAK_SOURCE && parts[2] === runStart) days.push(Number(parts[1]));
    }
    return days.filter((d) => Number.isFinite(d));
  } catch { return []; }
}

export type StreakAward = { days: number; trophyId: string | null; awarded: boolean };

/**
 * Hand over any milestone trophy this run has earned and not yet been given.
 *
 * SEPARATE FROM THE READ, on purpose. `unlockState` promotes on read and that is
 * defensible for a boolean; writing a REDEEMABLE PRIZE as a side effect of
 * drawing a nav band is not. This is called from the paths that already write —
 * the quest-award path and the daily cron — so a trophy arrives because
 * something happened, not because somebody looked.
 *
 * Idempotent on `streak:<days>:<runStart>`, so calling it twice in a second and
 * calling it every hour for a week both award exactly once. A milestone with no
 * trophy attached is still recorded as reached — it marks the run and shows on
 * the band; it simply hands over nothing.
 */
export async function awardStreakMilestones(
  db: DB, userId: string, now = new Date(),
): Promise<StreakAward[]> {
  try {
    const live = await liveMission(db, userId, now);
    if (live.streak <= 0) return [];
    const due = milestonesHit(live.streak, live.milestones, live.reached);
    const out: StreakAward[] = [];

    for (const m of due) {
      const key = streakAwardKey(m.days, live.runStart);
      // A milestone with no trophy has nothing to insert, so nothing marks it
      // as reached and it would be "due" forever. Harmless — `milestonesHit`
      // is idempotent in effect and the band reads the streak, not the row —
      // and cheaper than writing a placeholder trophy row nobody can redeem.
      if (!m.trophyId) { out.push({ days: m.days, trophyId: null, awarded: false }); continue; }

      const [existing] = await db.select({ id: schema.userTrophies.id })
        .from(schema.userTrophies)
        .where(and(
          eq(schema.userTrophies.userId, userId),
          eq(schema.userTrophies.challengeId, key),
        )).limit(1);
      if (existing) { out.push({ days: m.days, trophyId: m.trophyId, awarded: false }); continue; }

      await db.insert(schema.userTrophies).values({
        id: uid(), userId, trophyId: m.trophyId, challengeId: key,
        placement: 1, status: "held",
      });
      out.push({ days: m.days, trophyId: m.trophyId, awarded: true });
    }
    return out;
  } catch { return []; }
}
