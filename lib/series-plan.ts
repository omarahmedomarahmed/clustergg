// A series, planned all the way out. B91.3.
//
// ===== WHAT WAS THERE, AND WHY IT WAS NOT ENOUGH =====
//
// A repeating challenge already existed as a chain: run 1 is a real row, and
// `openNextRun` creates run 2 when run 1 finishes. That is fine for a machine
// and useless for everybody else — the campaign a brand bought does not exist
// yet, so nobody can look at it, price it, announce it early, or tell a gamer
// "this is week 2 of 8". A month sold is four rows that will exist one day.
//
// So the whole series is MATERIALISED at the moment it is created. Every run is
// a row with its own dates, its own index and the same `seriesId`, written as a
// DRAFT — which is the rung `stageOf` reads as "queued" once the bill is paid.
//
// ===== WHY DRAFTS AND NOT ACTIVE =====
//
// A dozen queries across the gamer-facing product read `status = "active"` as
// "live now": the homepage, the feed, the planets, the card renderer, the
// Discord resolver. Writing week 4 as active would put it on the homepage three
// weeks early with a countdown to a race nobody is running. The row stays a
// draft until it is ANNOUNCED, and announcing is what makes it visible and
// joinable — which is exactly what "announced" is supposed to mean.
//
// ===== CONSECUTIVE MEANS CONSECUTIVE =====
//
// Run N+1 starts when run N ends. No gaps, no overlaps, and the windows are
// computed from the FIRST start rather than accumulated from each previous end,
// so a drifting rounding error cannot make week 8 land on a Tuesday.

import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { CADENCE_DAYS, runTitle } from "@/lib/challenge-series";

export const MAX_RUNS = 52;

export type RunWindow = { index: number; startAt: Date; endAt: Date };

/**
 * The windows, from one start date.
 *
 * `monthly` advances by calendar month rather than by 30 days, because a brand
 * that buys "the first Monday of each month for six months" and gets the 30th,
 * the 29th, the 28th has been given something they did not ask for. Everything
 * else advances by a fixed number of days, which is what a week is.
 */
export function planRuns(startAt: Date, cadence: string, runs: number): RunWindow[] {
  const n = Math.max(1, Math.min(MAX_RUNS, Math.round(runs) || 1));
  const days = CADENCE_DAYS[cadence] ?? 7;
  const out: RunWindow[] = [];

  for (let i = 0; i < n; i++) {
    let start: Date;
    let end: Date;
    if (cadence === "monthly") {
      start = addMonths(startAt, i);
      end = addMonths(startAt, i + 1);
    } else {
      // Computed from the FIRST start, never accumulated from the previous end.
      start = new Date(startAt.getTime() + i * days * 86400_000);
      end = new Date(startAt.getTime() + (i + 1) * days * 86400_000);
    }
    out.push({ index: i + 1, startAt: start, endAt: end });
  }
  return out;
}

/**
 * Same day-of-month, next month — clamped.
 *
 * The 31st in a 30-day month is the 30th, not the 1st of the month after. A
 * campaign that silently jumps a month is one nobody notices until a brand asks
 * where their October week went.
 */
function addMonths(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + n);
  const last = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, last));
  return out;
}

/** How long a plan runs, in words a human buys in. */
export function planSummary(windows: RunWindow[], cadence: string): string {
  if (!windows.length) return "Nothing scheduled.";
  const first = windows[0].startAt;
  const last = windows[windows.length - 1].endAt;
  const noun = cadence === "daily" ? "day" : cadence === "monthly" ? "month" : "week";
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${windows.length} ${noun}${windows.length === 1 ? "" : "s"} · ${fmt(first)} → ${fmt(last)}`;
}

export type SeriesTemplate = Record<string, unknown> & {
  cadence: string;
  baseTitle: string;
};

/**
 * Write every run after the first.
 *
 * Takes the handle it is given: this runs inside the same request that created
 * run 1, and half a series is worse than none — a brand who paid for eight
 * weeks and got three is a refund conversation.
 *
 * Idempotent by construction: it only ever writes runs whose index does not
 * already exist, so a retry after a partial failure completes the series
 * instead of duplicating it.
 */
export async function materialiseSeries(
  db: DB,
  opts: {
    seriesId: string;
    template: SeriesTemplate;
    windows: RunWindow[];
    createdBy?: string | null;
  },
): Promise<{ created: number }> {
  const existing = await db.select({ runIndex: schema.challenges.runIndex })
    .from(schema.challenges)
    .where(eq(schema.challenges.seriesId, opts.seriesId));
  const have = new Set(existing.map((r) => r.runIndex));

  let created = 0;
  for (const w of opts.windows) {
    if (have.has(w.index)) continue;
    await db.insert(schema.challenges).values({
      ...opts.template,
      id: uid(),
      createdBy: opts.createdBy ?? null,
      seriesId: opts.seriesId,
      runIndex: w.index,
      runsPlanned: opts.windows.length,
      title: runTitle(opts.template.baseTitle, opts.template.cadence, w.index),
      startAt: w.startAt,
      endAt: w.endAt,
      // A DRAFT until it is announced. See the note at the top of this file:
      // writing it active would publish week 8 today.
      status: "draft",
      announcedAt: null,
    } as never);
    created++;
  }
  return { created };
}

export type SeriesRunRow = {
  id: string;
  runIndex: number;
  title: string;
  status: string;
  startAt: Date;
  endAt: Date;
  announcedAt: Date | null;
};

/** Every run of a series, in order. */
export async function runsOfSeries(db: DB, seriesId: string): Promise<SeriesRunRow[]> {
  try {
    return await db.select({
      id: schema.challenges.id,
      runIndex: schema.challenges.runIndex,
      title: schema.challenges.title,
      status: schema.challenges.status,
      startAt: schema.challenges.startAt,
      endAt: schema.challenges.endAt,
      announcedAt: schema.challenges.announcedAt,
    }).from(schema.challenges)
      .where(eq(schema.challenges.seriesId, seriesId))
      .orderBy(asc(schema.challenges.runIndex));
  } catch { return []; }
}

/**
 * The next run that is ready to be announced.
 *
 * Used by the weekly job and by the admin console: at any moment a series has
 * at most one run that should be told to the servers — the earliest unannounced
 * one whose start is still ahead. Announcing two at once is how a server gets
 * told about weeks 3, 4 and 5 in the same minute.
 */
export async function nextToAnnounce(db: DB, seriesId: string, now = new Date()): Promise<SeriesRunRow | null> {
  const runs = await runsOfSeries(db, seriesId);
  return runs.find((r) => !r.announcedAt && r.startAt > now && r.status !== "cancelled") ?? null;
}

/** Runs that have not started, for a screen that wants to say what is coming. */
export async function upcomingRuns(db: DB, seriesId: string, now = new Date()): Promise<SeriesRunRow[]> {
  const runs = await runsOfSeries(db, seriesId);
  return runs.filter((r) => r.startAt > now && r.status !== "cancelled");
}

/** Is this id part of a series with more than one run? */
export async function isSeries(db: DB, seriesId: string | null | undefined): Promise<boolean> {
  if (!seriesId) return false;
  const rows = await db.select({ id: schema.challenges.id }).from(schema.challenges)
    .where(and(eq(schema.challenges.seriesId, seriesId)));
  return rows.length > 1;
}
