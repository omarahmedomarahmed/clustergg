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


export type ScoredServer = {
  guildId: string;
  name: string;
  /** The LABEL. Decides nothing about money — see `bracket`. */
  tier: TierKey;
  /** Qualified linked members, the number both the tier and the bracket read. */
  qualified: number;
  exclusiveEntrants: number;
  newlyQualified: number;
  entrants: number;
  linked: number;
  score: number;
  /**
   * Always 1 now. Repeat-winner decay is retired — it punished a server for
   * being good, and score-proportional shares already give everyone below the
   * leader a real slice. Kept on the type so eight weeks of stored results
   * still read, rather than being deleted and leaving a hole in the history.
   */
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

    // ===== Who took part =====
    //
    // Entrants ATTRIBUTED to a server, which is `guildId` on the join and not
    // guild membership. A null guildId is a pre-B86 row and is excluded rather
    // than guessed at — guessing is the defect that column exists to remove.
    //
    // ===== SPONSORED CHALLENGES ONLY =====
    //
    // A PRIVATE challenge is one a server owner bought for their own members.
    // It puts nothing into the server pool — it is not brand inventory — so
    // entering one must not earn a share of it. Counting private entrants would
    // let an owner buy a cheap private challenge, have their own members enter
    // it, and take a slice of money that other servers' sponsored work paid in.
    //
    // The line is `visibility`, which already exists and already means this:
    // `public` is announced to every server and open to anyone, `private` is
    // one server's own. That is the owner's own wording — "the pool counts only
    // the money from the brand's public challenges available for everyone on any
    // server to join" — and it needs no new column.
    //
    // It also correctly excludes a WELCOME challenge, which is private to one
    // guild: a per-server promo we funded is not inventory another server's
    // work paid for.
    //
    // What this does NOT touch is the linked-member terms. Linking a game
    // account is linking a game account whatever prompted it, so a private
    // challenge that brings members onto the platform still earns growth and
    // still raises the denominator of conversion. That asymmetry is deliberate:
    // we want owners buying private challenges, we just will not pay them from
    // the pool for it twice.
    const joins = await db.select({
      userId: schema.challengeParticipants.userId,
      guildId: schema.challengeParticipants.guildId,
    }).from(schema.challengeParticipants)
      .innerJoin(schema.challenges, eq(schema.challenges.id, schema.challengeParticipants.challengeId))
      .where(and(
        isNotNull(schema.challengeParticipants.guildId),
        eq(schema.challenges.visibility, "public"),
        gte(schema.challengeParticipants.joinedAt, weekStart),
        lt(schema.challengeParticipants.joinedAt, weekEnd),
      ));
    const rows = joins.map((j) => ({ userId: j.userId, guildId: String(j.guildId) }));
    if (!rows.length) {
      return EMPTY(key, `Week of ${key}: no server carried an entrant into a sponsored challenge, so there is nobody to pay. Private challenges do not count — they are bought by an owner and put nothing into the pool.`);
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

    // ===== B47's gate, carried over =====
    //
    // A server that has not described itself is not inventory, it is a number:
    // a brand buys "PUBG players in MENA", and we cannot sell a community with
    // no games named, no audience and nobody to email. That gate used to live
    // inside the per-challenge rate (`earningOwnerPct`), and deleting the rate
    // in C3 would have silently deleted the gate with it — so it moves here,
    // where the money is now decided.
    //
    // They are dropped from the RUN, not paid zero: leaving them in would let
    // them take percentile positions off servers that did the work, and a score
    // beaten by a server that cannot be paid is a score that means nothing.
    const guildRows = await db.select({
      guildId: schema.discordGuilds.guildId,
      name: schema.discordGuilds.name,
      community: schema.discordGuilds.community,
      contactEmail: schema.discordGuilds.contactEmail,
    }).from(schema.discordGuilds).where(inArray(schema.discordGuilds.guildId, guildIds));
    const { parseCommunity, profileComplete } = await import("@/lib/discord/community");
    const payable = new Set(guildRows
      .filter((g) => profileComplete(parseCommunity(g.community), g.contactEmail))
      .map((g) => g.guildId));
    const skippedForProfile = guildIds.length - payable.size;

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

    const base = guildIds.filter((g) => payable.has(g)).map((guildId) => {
      const now_ = thisSnap.get(guildId);
      const before = prevSnap.get(guildId);
      const qualified = Number(now_?.qualifiedLinked ?? 0);
      return {
        guildId,
        name: names.get(guildId) ?? guildId,
        tier: tierOf(qualified),
        // Carried so the bracket can be computed from the same number the tier
        // label was. Deriving it twice from different sources is how a server
        // ends up labelled "Small" and paid out of the mid bracket.
        qualified,
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
      // SPONSORED entrants over ALL linked members. The numerator is filtered
      // above; the denominator deliberately is not. A server whose members link
      // accounts but never enter a sponsored challenge should see this fall —
      // that is the term telling them so.
      conversion: (s) => (s.linked > 0 ? s.entrants / s.linked : 0),
    };
    const live = Object.keys(SCORE_WEIGHTS).filter((k) => base.some((s) => TERM_VALUE[k](s) > 0));
    const liveWeight = live.reduce((a, k) => a + SCORE_WEIGHTS[k as keyof typeof SCORE_WEIGHTS], 0);
    const terms: Record<string, number> = {};
    for (const k of live) {
      terms[k] = Math.round((SCORE_WEIGHTS[k as keyof typeof SCORE_WEIGHTS] / liveWeight) * 10000) / 100;
    }
    if (!base.length) {
      return EMPTY(key, `Week of ${key}: ${guildIds.length} server${guildIds.length === 1 ? "" : "s"} carried an entrant, but none has a complete profile, so none can be paid.`);
    }
    if (!live.length) return EMPTY(key, `Week of ${key}: no term had any data to score on.`);

    // ===== Score, within bracket =====
    //
    // Percentile-ranked against the servers you actually compete with, so one
    // enormous server cannot flatten everybody else's terms to zero.
    //
    // NO DECAY. It used to multiply a repeat winner's score down to a floor of
    // 0.5 over eight weeks, which punished a server for being good — the
    // opposite of what a network wants from its best server. Score-proportional
    // shares mean a dominant server is already sharing with everyone below it,
    // so the mechanism decay existed to soften no longer exists.
    const servers: ScoredServer[] = base.map((s) => {
      const peers = base.filter((p) => bracketOf(p.qualified) === bracketOf(s.qualified));
      const score = Math.round(live.reduce((a, k) =>
        a + percentile(TERM_VALUE[k](s), peers.map(TERM_VALUE[k])) * terms[k], 0) * 100) / 100;
      return { ...s, score, decay: 1, final: score };
    });

    // ===== Divide: your share of the pool is your share of the score =====
    //
    // One call. The bracket split, the flat participation share and the
    // score-proportional remainder all live in `weekPayouts`, so there is one
    // place that decides what a server is owed rather than a loop here and a
    // function there.
    const { payouts: paid, carried } = weekPayouts(
      pool,
      servers.map((s) => ({
        guildId: s.guildId, score: s.final, bracket: bracketOf(s.qualified),
      })),
    );
    const payouts: Payout[] = paid;

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
        + `. Scored on ${live.length} of ${Object.keys(SCORE_WEIGHTS).length} terms `
        + `(${live.join(", ")}) — ${PARTICIPATION_SHARE}% of the pool was paid flat to everyone who took part.`,
    };
  } catch (e) {
    return EMPTY(weekKey(weekStart), `Week close failed: ${String(e).slice(0, 160)}`);
  }
}
