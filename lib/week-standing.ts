// Where every server stands in a week, and what that is worth. B99.
//
// ===== WHY THIS WAS PULLED OUT OF `closeWeek` =====
//
// The scoring was written inside the Monday job, which meant the only way to
// find out what a week was worth was to end it and pay it. Owners asked the
// obvious question — "how am I doing right now" — and there was no function
// that could answer without writing payouts.
//
// The fix is not a second implementation. A "live estimate" computed anywhere
// other than the code that decides the money is a number that drifts from the
// cheque, and the first time it drifts an owner is right to say we made it up.
// So the whole computation moved here, `closeWeek` calls it for the week that
// just ended, and `/pool` calls it for the week in progress. Same function,
// same terms, same brackets, same rounding.
//
// ===== IT WRITES NOTHING =====
//
// Not a payout, not a snapshot, not a flag. `closeWeek` still owns every write
// it ever owned; this owns the arithmetic. That separation is what makes it
// safe to call from a public page on every request.

import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  SCORE_WEIGHTS, exclusiveEntrants, percentile, weekPayouts, bracketOf,
  type Payout,
} from "@/lib/server-score";
import { tierOf, type TierKey } from "@/lib/week-tiers";

export type StandingServer = {
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
  decay: number;
  final: number;
};

export type Standing = {
  /** Terms the score actually ran on, and what each was worth after redistribution. */
  terms: Record<string, number>;
  servers: StandingServer[];
  payouts: Payout[];
  /** How many servers carried an entrant but cannot be paid for want of a profile. */
  skippedForProfile: number;
  /** Empty when there is something to divide. Otherwise, why not, in a sentence. */
  reason: string;
};

const NOTHING = (reason: string): Standing => ({
  terms: {}, servers: [], payouts: [], skippedForProfile: 0, reason,
});

/**
 * Score a window and divide a pool over it.
 *
 * `weekStart`/`weekEnd` bound the entrants counted; `pool` is what the caller
 * has decided is available. Both are arguments rather than derived here,
 * because the close and the live page disagree about both — the close scores a
 * finished week against a released allocation, the page scores the week in
 * progress against what has been released so far — and everything downstream of
 * those two facts is identical.
 */
export async function standingFor(
  db: DB,
  opts: { weekStart: Date; weekEnd: Date; pool: number },
): Promise<Standing> {
  const { weekStart, weekEnd, pool } = opts;

  // ===== Who took part =====
  //
  // Entrants ATTRIBUTED to a server, which is `guildId` on the join and not
  // guild membership. A null guildId is a pre-B86 row and is excluded rather
  // than guessed at — guessing is the defect that column exists to remove.
  //
  // SPONSORED CHALLENGES ONLY. A private challenge is one an owner bought for
  // their own members; it puts nothing into the pool, so entering one must not
  // earn a share of it. `visibility` already means exactly this.
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
    return NOTHING("No server has carried an entrant into a sponsored challenge yet. Private challenges do not count — they are bought by an owner and put nothing into the pool.");
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

  // ===== B47's gate =====
  //
  // A server that has not described itself is not inventory. They are dropped
  // from the RUN rather than paid zero: leaving them in would let them take
  // percentile positions off servers that did the work.
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
  const names = new Map(guildRows.map((g) => [g.guildId, g.name ?? g.guildId]));

  const base = guildIds.filter((g) => payable.has(g)).map((guildId) => {
    const now_ = thisSnap.get(guildId);
    const before = prevSnap.get(guildId);
    const qualified = Number(now_?.qualifiedLinked ?? 0);
    return {
      guildId,
      name: names.get(guildId) ?? guildId,
      tier: tierOf(qualified),
      qualified,
      exclusiveEntrants: exclusive.get(guildId) ?? 0,
      // A first-ever week has no "before", so everyone qualified in it is newly
      // qualified. Treating an absent prior week as zero growth would punish a
      // server for being new.
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
    // above; the denominator deliberately is not.
    conversion: (s) => (s.linked > 0 ? s.entrants / s.linked : 0),
  };
  const live = Object.keys(SCORE_WEIGHTS).filter((k) => base.some((s) => TERM_VALUE[k](s) > 0));
  const liveWeight = live.reduce((a, k) => a + SCORE_WEIGHTS[k as keyof typeof SCORE_WEIGHTS], 0);
  const terms: Record<string, number> = {};
  for (const k of live) {
    terms[k] = Math.round((SCORE_WEIGHTS[k as keyof typeof SCORE_WEIGHTS] / liveWeight) * 10000) / 100;
  }
  if (!base.length) {
    return {
      ...NOTHING(`${guildIds.length} server${guildIds.length === 1 ? "" : "s"} carried an entrant, but none has a complete profile, so none can be paid.`),
      skippedForProfile,
    };
  }
  if (!live.length) return { ...NOTHING("No term had any data to score on."), skippedForProfile };

  // ===== Score, within bracket =====
  //
  // Percentile-ranked against the servers you actually compete with, so one
  // enormous server cannot flatten everybody else's terms to zero.
  const servers: StandingServer[] = base.map((s) => {
    const peers = base.filter((p) => bracketOf(p.qualified) === bracketOf(s.qualified));
    const score = Math.round(live.reduce((a, k) =>
      a + percentile(TERM_VALUE[k](s), peers.map(TERM_VALUE[k])) * terms[k], 0) * 100) / 100;
    return { ...s, score, decay: 1, final: score };
  }).sort((a, b) => b.final - a.final || a.name.localeCompare(b.name));

  // ===== Divide: your share of the pool is your share of the score =====
  const { payouts } = weekPayouts(
    pool,
    servers.map((s) => ({ guildId: s.guildId, score: s.final, bracket: bracketOf(s.qualified) })),
  );

  return { terms, servers, payouts, skippedForProfile, reason: "" };
}

/** What one server is owed in a standing, or zero. */
export const shareOf = (s: Standing, guildId: string): number =>
  s.payouts.filter((p) => p.guildId === guildId).reduce((a, p) => a + p.amount, 0);
