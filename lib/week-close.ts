// Closing a week: scoring the servers and dividing the pool. C16.
//
// THE FINDING: the whole commercial model is weekly and there was no weekly
// anything. `vercel.json` has hourly, daily and five-minute crons; the pool, the
// scores, the payouts and the announced CP number had no scheduler at all. A
// model whose unit of time nothing runs on is a model that never runs.
//
// It runs on the DAILY job behind a day-of-week check, which is the same answer
// B86 reached for the snapshots and for the same reason: adding a cadence
// nobody has ever watched run is worse than a daily job that is idempotent. If
// Monday's run is missed, Tuesday's closes the same week — because the week is
// identified by its Monday, not by the day the job happened to fire.
//
// ===== What "the pool" is =====
//
// The server pool for a week is NOT the server vault's balance. It is every
// dollar that has arrived in the server vault, minus everything previous weeks
// already committed. That distinction does two things for free:
//
//   * A week where nothing sold pays out whatever earlier weeks left behind —
//     under-floor remainders, unfilled slots — instead of stranding it.
//   * Payout TIMING cannot change what a week was worth. A cheque sitting in
//     "approved" for a fortnight does not inflate the next week's pool.
//
// ===== The term with no data, said out loud =====
//
// `SCORE_WEIGHTS` has four terms and one of them — engaged card opens per
// active member — has no source: nothing records a per-guild card open. Scoring
// it as zero for everybody would not be neutral. Every server would tie, every
// server would take the same percentile, and 20 points of a 100-point score
// would be handed out flat while looking like it had been earned.
//
// So a term with no data anywhere in the week is DROPPED and its weight is
// redistributed across the terms that do have data. The run says which terms it
// scored on, and that sentence is meant to be read.

import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { weekStartOf } from "@/lib/guild-snapshot";
import {
  SCORE_WEIGHTS, exclusiveEntrants, percentile, weekPayouts, bracketOf, BRACKETS,
  PARTICIPATION_SHARE, type Payout,
} from "@/lib/server-score";
import { createPayout } from "@/lib/payouts";
import type { StandingServer } from "@/lib/week-standing";

/**
 * Who opens a pool payout.
 *
 * A marker, not a user. The pool's own accounting nets off exactly the payouts
 * it created, and this string is how it tells those apart from a cheque a human
 * raised for some other reason.
 */
export const WEEK_CLOSE_ACTOR = "system:week-close";

/** A week is named by its Monday. Everything keys off this string. */
export const weekKey = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Size tiers, re-exported.
 *
 * They live in `lib/week-tiers.ts` since B99: the scoring moved to
 * `lib/week-standing.ts`, this file calls it, and a tier constant owned here
 * would have made that import circular. Re-exported rather than moved outright
 * because five call sites and four suites import them from this module, and
 * churning them would have been a rename pretending to be a refactor.
 */
export { TIERS, tierOf, type TierKey } from "@/lib/week-tiers";

// `slotsFor` lived here and is DELETED, not stubbed.
//
// It cut a tier's pool into places on a 1/(rank+1) ladder and paid the top 20%.
// That put a cliff at #21 — twentieth got a cheque and twenty-first got nothing,
// over one entrant — and it needed a second rule, empty-slot redistribution, to
// patch the case where a network had fewer servers than slots.
//
// Every server that scores is now paid in proportion to its score. No cliff, no
// leftovers, and no second rule to keep in step with the first. A stub was
// considered and rejected: an exported function nobody calls is one somebody
// calls again.


/**
 * One scored server.
 *
 * The shape (and the arithmetic behind it) belongs to `lib/week-standing.ts`
 * now. `decay` is always 1: repeat-winner decay is retired — it punished a
 * server for being good, and score-proportional shares already give everyone
 * below the leader a real slice. Kept on the type so eight weeks of stored
 * results still read.
 */
export type ScoredServer = StandingServer;

export type WeekCloseResult = {
  week: string;
  /** Already closed — this run did nothing. */
  skipped: boolean;
  pool: number;
  /** Terms the score actually ran on, and what each was worth after redistribution. */
  terms: Record<string, number>;
  servers: ScoredServer[];
  payouts: Payout[];
  /** Held back because it was under the payout floor. Stays in the vault. */
  carried: number;
  summary: string;
};

const EMPTY = (week: string, summary: string, skipped = false): WeekCloseResult => ({
  week, skipped, pool: 0, terms: {}, servers: [], payouts: [], carried: 0, summary,
});

/**
 * Close the last COMPLETE week.
 *
 * Never the current one. A week in progress has entrants still arriving, and a
 * payout calculated on Wednesday for a week ending Sunday is wrong by
 * construction — which is the kind of wrong an owner notices and never forgets.
 */
export async function closeWeek(now = new Date()): Promise<WeekCloseResult> {
  const db = await getDb();
  const thisWeek = weekStartOf(now);
  const weekStart = new Date(thisWeek.getTime() - 7 * 86400_000);
  const weekEnd = thisWeek;
  const key = weekKey(weekStart);

  try {
    // ===== Idempotency =====
    //
    // Against the PAYOUTS, not a flag. The daily cron runs this seven times a
    // week and a human can run it from Mission Control at any moment; a second
    // close would pay the same week twice, which is the one mistake here that
    // costs real money.
    const [done] = await db.select({ id: schema.serverPayouts.id })
      .from(schema.serverPayouts)
      .where(eq(schema.serverPayouts.periodStart, weekStart)).limit(1);
    if (done) return EMPTY(key, `Week of ${key} was already closed.`, true);

    // ===== The pool =====
    const [inflow] = await db.select({
      n: sql<number>`coalesce(sum(${schema.vaultLedger.amount}), 0)`,
    }).from(schema.vaultLedger)
      .where(and(
        eq(schema.vaultLedger.vault, "server"),
        sql`${schema.vaultLedger.amount} > 0`,
        lt(schema.vaultLedger.createdAt, weekEnd),
      ));
    // Only what THIS process has committed. Scoped to `requestedBy` rather than
    // to "has a period", because a payout opened by hand — a correction, a
    // goodwill cheque, anything from before the pool existed — was never funded
    // out of the server vault, and netting it off here would silently shrink
    // every future week's pool by an amount nobody could trace.
    const [committed] = await db.select({
      n: sql<number>`coalesce(sum(${schema.serverPayoutLines.amount}), 0)`,
    }).from(schema.serverPayoutLines)
      .innerJoin(schema.serverPayouts, eq(schema.serverPayoutLines.payoutId, schema.serverPayouts.id))
      .where(and(
        eq(schema.serverPayouts.requestedBy, WEEK_CLOSE_ACTOR),
        sql`${schema.serverPayouts.status} <> 'cancelled'`,
      ));
    const unpaidVault = Math.round((Number(inflow?.n ?? 0) - Number(committed?.n ?? 0)) * 100) / 100;

    // ===== B88.2: THE POOL IS AN ALLOCATION, NOT THE WHOLE VAULT =====
    //
    // What an admin RELEASED for this week is the pool. What they did not
    // release is the reserve, and the reserve is the point: it is what pays
    // owners through a week when nothing sold.
    //
    // Bounded by the vault as well, always. An allocation can only be released
    // against money that has arrived, but a week closed long after the fact
    // could still name more than is left once earlier weeks were paid — and
    // paying out money that is not there is the one failure this whole ledger
    // exists to make impossible.
    //
    // NO ALLOCATION AT ALL still means the old behaviour: the unpaid vault is
    // the pool. Same migration rule as the CP ceiling — a deploy must not
    // silently stop paying server owners because a screen nobody has seen has
    // not been used yet.
    const { allocationFor } = await import("@/lib/allocations");
    const alloc = await allocationFor(db, "server", key);
    const pool = alloc.exists
      ? Math.min(alloc.amount, unpaidVault)
      : unpaidVault;

    if (!(pool > 0)) {
      return EMPTY(key, alloc.exists && alloc.amount <= 0
        ? `Week of ${key}: nothing was released for the server pool, so there is nothing to divide. The money is still in the vault.`
        : `Week of ${key}: nothing in the server pool to divide.`);
    }

    // ===== Score the week, and divide =====
    //
    // One call, and the SAME call `/pool` makes for the week in progress. The
    // entrant filter, the profile gate, the dropped-term redistribution, the
    // bracket percentiles and the split all live in `lib/week-standing.ts`, so
    // the number an owner watched climb all week is the number that becomes
    // their cheque. A "live estimate" computed anywhere else is a number that
    // drifts from the payment, and the first time it drifts they are right to
    // say we made it up.
    const { standingFor } = await import("@/lib/week-standing");
    const standing = await standingFor(db, { weekStart, weekEnd, pool });
    if (standing.reason) return EMPTY(key, `Week of ${key}: ${standing.reason}`);

    const { servers, terms, payouts, carried, skippedForProfile } = standing;

    // ===== Write them, as DRAFTS =====
    //
    // A calculation, not a transfer. Money leaves the vault when a human
    // releases the payout through the existing path, which is also where the
    // 30-day hold and the provider live. A cron that moved money on its own
    // would be a cron nobody could stop on a Sunday.
    let opened = 0;
    for (const p of payouts) {
      const s = servers.find((x) => x.guildId === p.guildId);
      const res = await createPayout({
        guildId: p.guildId,
        guildName: s?.name,
        periodStart: weekStart,
        periodEnd: weekEnd,
        requestedBy: WEEK_CLOSE_ACTOR,
        note: `Week of ${key} — ${s?.tier ?? "?"} tier, score ${s?.final ?? 0}/100.`,
        lines: [{
          kind: "pool",
          label: `Server pool, week of ${key} — ${(s?.exclusiveEntrants ?? 0).toFixed(2)} exclusive entrants, ${s?.newlyQualified ?? 0} newly qualified`,
          amount: p.amount,
        }],
      });
      if (res.ok) opened++;
    }

    return {
      week: key,
      skipped: false,
      pool,
      terms,
      servers: servers.sort((a, b) => b.final - a.final),
      payouts,
      carried: Math.round(carried * 100) / 100,
      summary:
        `Week of ${key}: $${pool.toFixed(2)} across ${servers.length} server${servers.length === 1 ? "" : "s"}, `
        + `${opened} payout${opened === 1 ? "" : "s"} opened`
        + (carried > 0 ? `, $${carried.toFixed(2)} held under the floor` : "")
        + (skippedForProfile > 0 ? `, ${skippedForProfile} skipped for an incomplete server profile` : "")
        + `. Scored on ${Object.keys(terms).length} of ${Object.keys(SCORE_WEIGHTS).length} terms `
        + `(${Object.keys(terms).join(", ")}) — ${PARTICIPATION_SHARE}% of the pool was paid flat to everyone who took part.`,
    };
  } catch (e) {
    return EMPTY(weekKey(weekStart), `Week close failed: ${String(e).slice(0, 160)}`);
  }
}
