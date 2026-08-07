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
  SCORE_WEIGHTS, exclusiveEntrants, percentile, decayFor, weekPayouts,
  PARTICIPATION_SHARE, type Payout,
} from "@/lib/server-score";
import { createPayout } from "@/lib/payouts";

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
 * Size tiers. LABELS, not rates.
 *
 * A tier decides who a server competes against, and nothing else. The old model
 * paid a percentage per tier, which is the thing v2 replaced with this pool —
 * see C3. Thresholds are qualified linked members, the same count the snapshot
 * records and the same one an owner is shown.
 */
export const TIERS = [
  { key: "small", floor: 0 },
  { key: "mid", floor: 500 },
  { key: "large", floor: 5000 },
] as const;
export type TierKey = (typeof TIERS)[number]["key"];

export const tierOf = (qualified: number): TierKey => {
  let k: TierKey = "small";
  for (const t of TIERS) if (qualified >= t.floor) k = t.key;
  return k;
};

/**
 * How the competition half of a tier's pool is cut into places.
 *
 * Slots are proportional to how many servers are in the tier — pay the top 20%
 * — because a fixed count creates the boundary problem the model names: a
 * 499-member server competing with twenty peers for six slots against a
 * 501-member one competing with three for two bigger ones. Crossing a boundary
 * would beat any amount of in-tier effort.
 *
 * The shares are front-loaded but not winner-take-all. First place taking
 * everything makes second place worthless to chase.
 */
export function slotsFor(entrants: number): { share: number }[] {
  const n = Math.max(1, Math.round(entrants * 0.2));
  // Weight 1/(i+1), normalised. Simple, monotonic, and it never sums to
  // anything but 100 no matter how many slots there are.
  const raw = Array.from({ length: n }, (_, i) => 1 / (i + 1));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => ({ share: w / sum }));
}

export type ScoredServer = {
  guildId: string;
  name: string;
  tier: TierKey;
  exclusiveEntrants: number;
  newlyQualified: number;
  entrants: number;
  linked: number;
  score: number;
  decay: number;
  final: number;
};

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
    const pool = Math.round((Number(inflow?.n ?? 0) - Number(committed?.n ?? 0)) * 100) / 100;
    if (!(pool > 0)) {
      return EMPTY(key, `Week of ${key}: nothing in the server pool to divide.`);
    }

    // ===== Who took part =====
    //
    // Entrants ATTRIBUTED to a server, which is `guildId` on the join and not
    // guild membership. A null guildId is a pre-B86 row and is excluded rather
    // than guessed at — guessing is the defect that column exists to remove.
    const joins = await db.select({
      userId: schema.challengeParticipants.userId,
      guildId: schema.challengeParticipants.guildId,
    }).from(schema.challengeParticipants)
      .where(and(
        isNotNull(schema.challengeParticipants.guildId),
        gte(schema.challengeParticipants.joinedAt, weekStart),
        lt(schema.challengeParticipants.joinedAt, weekEnd),
      ));
    const rows = joins.map((j) => ({ userId: j.userId, guildId: String(j.guildId) }));
    if (!rows.length) {
      return EMPTY(key, `Week of ${key}: no server carried an entrant, so there is nobody to pay.`);
    }

    const exclusive = exclusiveEntrants(rows);
    const entrantsBy = new Map<string, number>();
    for (const r of rows) entrantsBy.set(r.guildId, (entrantsBy.get(r.guildId) ?? 0) + 1);
    const guildIds = [...exclusive.keys()];

    // ===== The snapshots that make "newly qualified" a real number =====
    const snaps = await db.select({
      guildId: schema.guildSnapshots.guildId,
      weekStart: schema.guildSnapshots.weekStart,
      linked: schema.guildSnapshots.linked,
      qualifiedLinked: schema.guildSnapshots.qualifiedLinked,
    }).from(schema.guildSnapshots)
      .where(and(
        inArray(schema.guildSnapshots.guildId, guildIds),
        inArray(schema.guildSnapshots.weekStart, [weekStart, new Date(weekStart.getTime() - 7 * 86400_000)]),
      ));
    const thisSnap = new Map(snaps.filter((s) => +s.weekStart === +weekStart).map((s) => [s.guildId, s]));
    const prevSnap = new Map(snaps.filter((s) => +s.weekStart !== +weekStart).map((s) => [s.guildId, s]));

    const names = new Map(
      (await db.select({ guildId: schema.discordGuilds.guildId, name: schema.discordGuilds.name })
        .from(schema.discordGuilds).where(inArray(schema.discordGuilds.guildId, guildIds)))
        .map((g) => [g.guildId, g.name ?? g.guildId]),
    );

    // Wins in the last eight weeks, for decay. A dominant server keeps winning,
    // declining — no cliff, because a cliff is itself a thing to game.
    const eightWeeksAgo = new Date(weekStart.getTime() - 8 * 7 * 86400_000);
    const priorWins = await db.select({
      guildId: schema.serverPayouts.guildId,
      n: sql<number>`count(*)`,
    }).from(schema.serverPayouts)
      .where(and(
        inArray(schema.serverPayouts.guildId, guildIds),
        isNotNull(schema.serverPayouts.periodStart),
        gte(schema.serverPayouts.periodStart, eightWeeksAgo),
      )).groupBy(schema.serverPayouts.guildId);
    const winsBy = new Map(priorWins.map((r) => [r.guildId, Number(r.n ?? 0)]));

    const base = guildIds.map((guildId) => {
      const now_ = thisSnap.get(guildId);
      const before = prevSnap.get(guildId);
      const qualified = Number(now_?.qualifiedLinked ?? 0);
      return {
        guildId,
        name: names.get(guildId) ?? guildId,
        tier: tierOf(qualified),
        exclusiveEntrants: exclusive.get(guildId) ?? 0,
        // A first-ever week has no "before", so everyone qualified in it is
        // newly qualified. Treating an absent prior week as zero growth would
        // punish a server for being new.
        newlyQualified: Math.max(0, qualified - Number(before?.qualifiedLinked ?? 0)),
        entrants: entrantsBy.get(guildId) ?? 0,
        linked: Number(now_?.linked ?? 0),
      };
    });

    // ===== Which terms have anything to say =====
    const TERM_VALUE: Record<string, (s: typeof base[number]) => number> = {
      exclusiveEntrants: (s) => s.exclusiveEntrants,
      newlyQualified: (s) => s.newlyQualified,
      // No per-guild card-open source exists. Left here, reading zero, so the
      // redistribution below drops it visibly instead of it being absent from
      // the file and forgotten.
      engagedOpens: () => 0,
      conversion: (s) => (s.linked > 0 ? s.entrants / s.linked : 0),
    };
    const live = Object.keys(SCORE_WEIGHTS).filter((k) => base.some((s) => TERM_VALUE[k](s) > 0));
    const liveWeight = live.reduce((a, k) => a + SCORE_WEIGHTS[k as keyof typeof SCORE_WEIGHTS], 0);
    const terms: Record<string, number> = {};
    for (const k of live) {
      terms[k] = Math.round((SCORE_WEIGHTS[k as keyof typeof SCORE_WEIGHTS] / liveWeight) * 10000) / 100;
    }
    if (!live.length) return EMPTY(key, `Week of ${key}: no term had any data to score on.`);

    // ===== Score, within tier =====
    const servers: ScoredServer[] = base.map((s) => {
      const peers = base.filter((p) => p.tier === s.tier);
      const score = Math.round(live.reduce((a, k) =>
        a + percentile(TERM_VALUE[k](s), peers.map(TERM_VALUE[k])) * terms[k], 0) * 100) / 100;
      const decay = decayFor(winsBy.get(s.guildId) ?? 0);
      return { ...s, score, decay, final: Math.round(score * decay * 100) / 100 };
    });

    // ===== Divide, per tier, proportionally to who is in it =====
    const payouts: Payout[] = [];
    let carried = 0;
    for (const t of TIERS) {
      const inTier = servers.filter((s) => s.tier === t.key);
      if (!inTier.length) continue;
      // A tier's share of the pool is its share of the PARTICIPANTS. A tier with
      // three servers in it cannot hold a third of the money because there are
      // three tiers.
      const tierPool = Math.round(pool * (inTier.length / servers.length) * 100) / 100;
      const r = weekPayouts(
        tierPool,
        inTier.map((s) => ({ guildId: s.guildId, score: s.final })),
        slotsFor(inTier.length),
      );
      payouts.push(...r.payouts);
      carried += r.carried;
    }

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
        + `. Scored on ${live.length} of ${Object.keys(SCORE_WEIGHTS).length} terms `
        + `(${live.join(", ")}) — ${PARTICIPATION_SHARE}% of the pool was paid flat to everyone who took part.`,
    };
  } catch (e) {
    return EMPTY(weekKey(weekStart), `Week close failed: ${String(e).slice(0, 160)}`);
  }
}
