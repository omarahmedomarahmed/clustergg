// The weekly record — a closed week's complete working, written once.
//
// ===== WHY THIS TABLE EXISTS, AND WHY IT IS NOT A STORED DERIVATION =====
//
// House rule 1 is right about balances: a balance is `sum(ledger)` because
// **its inputs are permanent.** Every row that ever existed still exists, so
// the sum can always be taken again.
//
// A week's standing has the opposite property. Every input is live and moves:
// a member leaves, a profile lapses, an admin re-parents a gamer (A8), a
// server is renamed, and the next Monday's gun overwrites the gate. By Tuesday
// of week 4, week 3 **cannot** be re-derived. Not expensive — impossible.
//
// So it is recorded, exactly as a ledger row is, and for the same reason: a
// reading frozen at the instant it was true. Same shape as `baseline` and
// `parentGuildIdAtBaseline`. `07-DATA-MODEL.md` says this in the same words,
// and it says it because the obvious next edit is to delete this as a
// violation of a rule it is not violating.
//
// ===== THE NUMBER SURVIVED. THE WORKING DID NOT. =====
//
// `server_payouts` already kept what a server was paid. That looked like
// enough — until you ask when anybody actually needs this, and the answer is
// **a disputed payout**, which is precisely the moment somebody needs to see
// *why* a server earned what it earned. The total is the one thing not in
// dispute.
//
// ===== W1 / K12 — ONE FUNCTION, TWO CALLERS =====
//
// The record is written from the `PoolDivision` the close already computed —
// the same object `/pool` renders live. There is no second arithmetic here,
// only a copy: this module reads a division and writes rows. If it recomputed
// anything, `/pool` on Thursday and the record on Friday could disagree, and
// the pool being public is the entire innovation.

import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import type { PoolDivision } from "./score.ts";

export class RecordRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordRefused";
  }
}

/**
 * Write one week's record. **W1 — once, at the close.**
 *
 * Idempotent per week: a close that runs twice writes nothing the second time.
 * That is not a convenience — W2 forbids updating a row, so a second write
 * would be a *duplicate*, and `Σ totalCents` (W3) would then be double the
 * pool with no edit having happened anywhere.
 *
 * A **correction** is the other path, `superseded` below, and it is deliberately
 * a different function with a required reason.
 */
export async function writeWeekRecord(
  db: DB,
  input: {
    division: PoolDivision;
    /** Which payout each guild's share became, when it became one. */
    payoutIds?: Map<string, string>;
    challengeNames?: Map<string, { title: string; game: string; brandName: string | null }>;
  },
  now = new Date(),
): Promise<{ written: number; credits: number; alreadyWritten: boolean }> {
  const { division } = input;
  const weekStart = division.weekStart;

  const existing = await db
    .select({ id: schema.weekRecords.id })
    .from(schema.weekRecords)
    .where(eq(schema.weekRecords.weekStart, weekStart));
  if (existing.length > 0) {
    return { written: 0, credits: 0, alreadyWritten: true };
  }

  const serversInPool = division.shares.length;
  let written = 0;

  for (const [i, share] of division.shares.entries()) {
    await db.insert(schema.weekRecords).values({
      id: uid(),
      weekStart,
      guildId: share.guildId,
      // W5 — **copied, not joined.** A server renamed in week 9 still reads as
      // its week-3 name in week 3, because history that rewrites itself when
      // somebody edits a profile is not history.
      guildName: share.name,
      eligible: true,
      eligibilityFrozenAt: weekStart,
      linkedAtGun: share.linkedAtGun,
      profileCompleteAtGun: share.profileCompleteAtGun,
      ineligibleReason: null,
      entrants: share.entrants,
      conversionNumerator: share.conversionNumerator,
      conversionDenominator: share.conversionDenominator,
      conversion: share.conversion,
      activationNumerator: share.activationNumerator,
      activationDenominator: share.activationDenominator,
      activation: share.activation,
      // The division is already sorted best-first, so the position it was
      // ranked at is the position it is written at. Re-sorting here would be a
      // second implementation of the one thing K12 forbids duplicating.
      rank: i + 1,
      scoredShareCents: share.scoredCents,
      flatShareCents: share.flatCents,
      totalCents: share.totalCents,
      poolCents: division.poolCents,
      serversInPool,
      payoutId: input.payoutIds?.get(share.guildId) ?? null,
      writtenAt: now,
    });
    written++;
  }

  // ===== W6 — THE SERVERS THAT EARNED NOTHING GET A ROW TOO =====
  //
  // *"You earned nothing and here is exactly why"* is the question this table
  // exists to answer, and a table that only holds winners cannot answer it.
  // Zero money, `eligible: false`, and the gun's own reasons beside it.
  for (const drop of division.dropped) {
    await db.insert(schema.weekRecords).values({
      id: uid(),
      weekStart,
      guildId: drop.guildId,
      guildName: drop.name,
      eligible: false,
      eligibilityFrozenAt: null,
      linkedAtGun: drop.linkedAtGun,
      profileCompleteAtGun: drop.profileCompleteAtGun,
      ineligibleReason: drop.reason,
      // What they would have been credited with. A row saying only "no" tells
      // an owner nothing about how close they were.
      entrants: drop.entrants,
      poolCents: division.poolCents,
      serversInPool,
      writtenAt: now,
    });
    written++;
  }

  let credits = 0;
  for (const credit of division.credits) {
    const names = input.challengeNames?.get(credit.challengeId);
    await db.insert(schema.weekCredits).values({
      id: uid(),
      weekStart,
      guildId: credit.guildId,
      challengeId: credit.challengeId,
      // W5 again. A challenge retitled next season does not rewrite the week
      // it ran in.
      challengeTitle: names?.title ?? credit.challengeId,
      game: names?.game ?? "",
      brandName: names?.brandName ?? null,
      role: credit.role,
      entrantsCredited: credit.entrantsCredited,
      entrantsWhole: credit.entrantsWhole,
      scoredAboveZero: credit.scoredAboveZero,
      writtenAt: now,
    });
    credits++;
  }

  return { written, credits, alreadyWritten: false };
}

/**
 * W2 — a correction is a **new row** naming what it supersedes and why.
 *
 * Never an edit. The superseded row stays exactly as written, and both are
 * shown together on the page (05 §6 rule 4), because a history that quietly
 * changes is worth less than one that shows its own corrections.
 */
export async function superseded(
  db: DB,
  input: { recordId: string; reason: string; patch: Partial<typeof schema.weekRecords.$inferInsert> },
  now = new Date(),
): Promise<string> {
  if (!input.reason.trim()) {
    throw new RecordRefused("A correction carries a reason, or it is an edit with extra steps.");
  }
  const [before] = await db
    .select()
    .from(schema.weekRecords)
    .where(eq(schema.weekRecords.id, input.recordId));
  if (!before) throw new RecordRefused("There is no such record to supersede.");

  const { id: _drop, ...carried } = before;
  const id = uid();
  await db.insert(schema.weekRecords).values({
    ...carried,
    ...input.patch,
    id,
    supersedesId: input.recordId,
    supersededReason: input.reason,
    writtenAt: now,
  });
  return id;
}

/** Which rows are current — a row nothing supersedes. */
export function currentRows<T extends { id: string; supersedesId: string | null }>(
  rows: T[],
): T[] {
  const superseded = new Set(rows.map((r) => r.supersedesId).filter(Boolean) as string[]);
  return rows.filter((r) => !superseded.has(r.id));
}

// ── Reading it back. Nothing here recalculates anything. ────────────────────

/**
 * 05 §6 rule 3 — **nothing on these pages is recalculated.** A figure that
 * disagrees with `server_payouts` is a defect to alert on, never a number to
 * quietly recompute. So the reads below are reads.
 */
export async function weekRecordsFor(db: DB, weekStart: Date) {
  const rows = await db
    .select()
    .from(schema.weekRecords)
    .where(eq(schema.weekRecords.weekStart, weekStart))
    .orderBy(asc(schema.weekRecords.rank), asc(schema.weekRecords.guildName));
  return currentRows(rows);
}

export async function weekRecordsForGuild(db: DB, guildId: string) {
  const rows = await db
    .select()
    .from(schema.weekRecords)
    .where(eq(schema.weekRecords.guildId, guildId))
    .orderBy(desc(schema.weekRecords.weekStart));
  return currentRows(rows);
}

export async function weekCreditsFor(db: DB, weekStart: Date, guildId: string) {
  return db
    .select()
    .from(schema.weekCredits)
    .where(
      and(
        eq(schema.weekCredits.weekStart, weekStart),
        eq(schema.weekCredits.guildId, guildId),
      ),
    )
    .orderBy(desc(schema.weekCredits.entrantsCredited));
}

export type WeekSummary = {
  weekStart: Date;
  poolCents: number;
  /** W3 — `Σ totalCents`. Compared, never substituted. */
  sharesTotalCents: number;
  allocatedCents: number;
  reconciles: boolean;
  serversPaid: number;
  serversDropped: number;
  entrants: number;
};

/**
 * Every closed week, newest first — and **whether it still reconciles**.
 *
 * W3 is checked here rather than assumed, and the answer is carried onto the
 * page. A history page that silently displayed a total not equal to the pool
 * would be the most convincing wrong number on the platform.
 */
export async function weekSummaries(db: DB): Promise<WeekSummary[]> {
  const rows = currentRows(await db.select().from(schema.weekRecords));
  const allocations = await db.select().from(schema.poolAllocations);
  const allocatedByWeek = new Map<number, number>();
  for (const a of allocations) {
    allocatedByWeek.set(
      a.weekStart.getTime(),
      (allocatedByWeek.get(a.weekStart.getTime()) ?? 0) + a.amountCents,
    );
  }

  const byWeek = new Map<number, typeof rows>();
  for (const row of rows) {
    const key = row.weekStart.getTime();
    byWeek.set(key, [...(byWeek.get(key) ?? []), row]);
  }

  return [...byWeek.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, weekRows]) => {
      const sharesTotalCents = weekRows.reduce((sum, r) => sum + r.totalCents, 0);
      const allocatedCents = allocatedByWeek.get(key) ?? weekRows[0]?.poolCents ?? 0;
      return {
        weekStart: new Date(key),
        poolCents: weekRows[0]?.poolCents ?? 0,
        sharesTotalCents,
        allocatedCents,
        reconciles: sharesTotalCents === allocatedCents,
        serversPaid: weekRows.filter((r) => r.eligible).length,
        serversDropped: weekRows.filter((r) => !r.eligible).length,
        entrants: weekRows.reduce((sum, r) => sum + r.entrants, 0),
      };
    });
}

/**
 * W4, checked — `Σ credits == the record's entrants`, per server.
 *
 * Returned rather than thrown so the page can show a mismatch as the defect it
 * is (05 §6 rule 3). Recomputing on a mismatch would hide exactly the thing
 * this is for.
 */
export async function reconcileCredits(
  db: DB,
  weekStart: Date,
): Promise<{ guildId: string; recorded: number; credited: number; ok: boolean }[]> {
  const records = await weekRecordsFor(db, weekStart);
  const credits = await db
    .select({
      guildId: schema.weekCredits.guildId,
      total: sql<number>`coalesce(sum(${schema.weekCredits.entrantsCredited}), 0)`,
    })
    .from(schema.weekCredits)
    .where(eq(schema.weekCredits.weekStart, weekStart))
    .groupBy(schema.weekCredits.guildId);
  const creditedByGuild = new Map(credits.map((c) => [c.guildId, Number(c.total)]));

  return records
    .filter((r) => r.eligible)
    .map((r) => {
      const credited = creditedByGuild.get(r.guildId) ?? 0;
      return {
        guildId: r.guildId,
        recorded: r.entrants,
        credited,
        // Floating halves, so compared to a tolerance rather than exactly.
        ok: Math.abs(credited - r.entrants) < 0.0001,
      };
    });
}
