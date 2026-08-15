// How a weekly pool divides.
//
// ===== ONE FUNCTION, READ BY FIVE SURFACES =====
//
// docs/01-CYCLE.md is explicit: `/pool` shows what each server *would* be paid
// if the week ended now, **computed by the same function that writes Friday's
// placements** — never by a second implementation that could drift. The public
// pool page, the owner portal, the bot's standings card, Saturday's
// announcement and the actual payout all call `dividePool`.
//
// That matters more here than anywhere else on the platform, because the pool
// being public IS the innovation. An owner watching their number climb all
// week and receiving a different one on Saturday would be the end of the only
// thing that makes this model work.
//
// ===== THE THREE KPIs, AND WHY THEY ARE THESE THREE =====
//
//   1. Exclusive entrants (40) — volume. A gamer in two servers is worth ½ to
//      each, so shares can never sum past the true entrant count.
//   2. Conversion (30) — entrants ÷ linked members. Efficiency.
//   3. Activation (30) — entrants who scored above zero ÷ entrants. Quality,
//      and the one that kills the fake-entrant attack: a member who joins and
//      never plays *lowers* the ratio.
//
// K1 — **no KPI may measure Discord activity.** Not commands, not card opens,
// not messages. Rewarding activity inside somebody else's product is a
// standing incentive to manufacture it, it was the ToS violation in the old
// model, and all three of these measure outcomes on our own platform instead.
//
// K6 — winning a challenge earns a server nothing directly. Entrants do.

import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { KPI_WEIGHTS, POOL_FLAT_BPS, POOL_SCORED_BPS, BPS } from "../money/amounts.ts";
import { standingsOf } from "../challenges/scoring.ts";
import { weekFor } from "../challenges/week.ts";

export type ServerKpis = {
  guildId: string;
  name: string;
  /** Split volume: a gamer in two servers counts ½ to each. */
  entrants: number;
  linkedMembers: number;
  /** entrants ÷ linked members. */
  conversion: number;
  /** entrants who scored above zero ÷ entrants. */
  activation: number;
};

export type PoolShare = ServerKpis & {
  /** 0–100, the weighted percentile score. */
  score: number;
  flatCents: number;
  scoredCents: number;
  totalCents: number;
};

export type PoolDivision = {
  weekStart: Date;
  poolCents: number;
  flatPoolCents: number;
  scoredPoolCents: number;
  shares: PoolShare[];
  /** Servers dropped from the run, and why — K7. */
  dropped: { guildId: string; reason: string }[];
  /** Which challenges fed this week's pool. M12 — the page names them. */
  contributingChallengeIds: string[];
};

/**
 * Gather the three KPIs for a week.
 *
 * C4/K8 — **community challenges never contribute to a weekly pool.** They are
 * excluded here rather than filtered by a caller, because a caller that
 * forgets is a server credited for entrants its own money paid for.
 */
export async function kpisForWeek(
  db: DB,
  weekStart: Date,
  now = new Date(),
): Promise<{ kpis: ServerKpis[]; dropped: { guildId: string; reason: string }[]; challengeIds: string[] }> {
  const week = weekFor(weekStart);

  const challenges = await db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.startAt, week.start),
        eq(schema.challenges.visibility, "sponsored"),
        or(
          eq(schema.challenges.state, "announced"),
          eq(schema.challenges.state, "live"),
          eq(schema.challenges.state, "ended"),
        ),
      ),
    );
  const challengeIds = challenges.map((c) => c.id);
  if (challengeIds.length === 0) {
    return { kpis: [], dropped: [], challengeIds: [] };
  }

  const participants = await db
    .select()
    .from(schema.challengeParticipants)
    .where(
      and(
        inArray(schema.challengeParticipants.challengeId, challengeIds),
        isNotNull(schema.challengeParticipants.guildId),
      ),
    );

  // ===== THE HALF-SPLIT. K1, K5, and G2 in the data model =====
  //
  // A gamer who belongs to three servers that all carried the same challenge
  // is worth a third to each, not one to each. Without it, ten overlapping
  // servers turn 100 entrants into 1,000 and the pool pays for members who do
  // not exist.
  //
  // The split reads **membership**, not the participant row. A participant row
  // is unique on (challenge, gamer) — P4 — so it records the one server they
  // clicked Join in and cannot express the three they are in. Reading it would
  // quietly turn the ½ rule into "whole credit to wherever they happened to
  // click".
  //
  // Restricted to servers that actually **carried** the challenge. "Every
  // server a gamer belongs to" cannot mean a server the challenge was never
  // announced to: that server did nothing for this entrant and would be taking
  // a share from one that did.
  //
  // The denominator is per (gamer, challenge). Entering two challenges is
  // genuinely two entrants — that double counting is deliberate, §8 — while
  // being in two servers is one gamer.
  const announcements = await db
    .select()
    .from(schema.challengeAnnouncements)
    .where(inArray(schema.challengeAnnouncements.challengeId, challengeIds));
  const carriedBy = new Map<string, Set<string>>();
  for (const a of announcements) {
    const set = carriedBy.get(a.challengeId) ?? new Set<string>();
    set.add(a.guildId);
    carriedBy.set(a.challengeId, set);
  }

  const memberships = await db
    .select()
    .from(schema.guildMembers)
    .where(isNull(schema.guildMembers.leftAt));
  const guildsOf = new Map<string, string[]>();
  for (const m of memberships) {
    guildsOf.set(m.userId, [...(guildsOf.get(m.userId) ?? []), m.guildId]);
  }

  const byGamerChallenge = new Map<string, string[]>();
  for (const p of participants) {
    const carried = carriedBy.get(p.challengeId);
    const member = guildsOf.get(p.userId) ?? [];
    const eligible = carried ? member.filter((g) => carried.has(g)) : member;
    // Fall back to the server they joined from. A gamer whose memberships we
    // have not seen yet still earned their server the credit, and crediting
    // nobody would quietly shrink the pool's denominator.
    const guilds = eligible.length > 0 ? eligible : [p.guildId as string];
    byGamerChallenge.set(`${p.challengeId}:${p.userId}`, guilds);
  }

  const entrantShare = new Map<string, number>();
  const activeShare = new Map<string, number>();

  // Whether each participant scored above zero — the activation numerator.
  const scoredAbove = new Set<string>();
  for (const challengeId of challengeIds) {
    for (const s of await standingsOf(db, challengeId, now)) {
      if (s.points > 0) scoredAbove.add(`${challengeId}:${s.participant.userId}`);
    }
  }

  for (const [key, guildIds] of byGamerChallenge) {
    const share = 1 / guildIds.length;
    const active = scoredAbove.has(key);
    for (const guildId of guildIds) {
      entrantShare.set(guildId, (entrantShare.get(guildId) ?? 0) + share);
      if (active) activeShare.set(guildId, (activeShare.get(guildId) ?? 0) + share);
    }
  }

  const guilds = await db.select().from(schema.guilds);
  const snapshots = await db
    .select()
    .from(schema.guildSnapshots)
    .where(eq(schema.guildSnapshots.weekStart, week.start));
  const linkedByGuild = new Map(snapshots.map((s) => [s.guildId, s.linkedCount]));

  const kpis: ServerKpis[] = [];
  const dropped: { guildId: string; reason: string }[] = [];

  for (const guild of guilds) {
    const entrants = entrantShare.get(guild.guildId) ?? 0;
    if (entrants === 0) continue;

    // K7 — a server that never described itself is **dropped from the run**,
    // not scored zero. Scored zero it would still occupy a percentile position
    // and take money from servers that did the work.
    if (!guild.community) {
      dropped.push({
        guildId: guild.guildId,
        reason:
          "This server has no community profile yet, so it is not scored. " +
          "Describe the community in the portal to join the pool.",
      });
      continue;
    }

    const linkedMembers = linkedByGuild.get(guild.guildId) ?? 0;
    const active = activeShare.get(guild.guildId) ?? 0;
    kpis.push({
      guildId: guild.guildId,
      name: guild.name,
      entrants,
      linkedMembers,
      // A server with no linked members and entrants anyway is a data problem,
      // not a perfect conversion rate. Zero is the honest answer.
      conversion: linkedMembers > 0 ? entrants / linkedMembers : 0,
      activation: entrants > 0 ? active / entrants : 0,
    });
  }

  return { kpis, dropped, challengeIds };
}

/**
 * Percentile-rank a set of values, 0–100.
 *
 * Ranked rather than absolute, because the KPIs are on different scales — an
 * entrant count and a ratio cannot be added. Ranking also does what K4 asks
 * for: a large server cannot out-mass a small one, because being twice as big
 * is worth one position, not twice the score.
 *
 * With one server the answer is 100: they are top of every list, and the
 * alternative — zero, from `(n-1)` denominators — would pay a lone server
 * nothing for a week it carried alone.
 */
export function percentileRank(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [100];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    // Ties share the midpoint, so two identical servers get identical money.
    const below = sorted.filter((s) => s < v).length;
    const equal = sorted.filter((s) => s === v).length;
    return ((below + (equal - 1) / 2) / (values.length - 1)) * 100;
  });
}

/**
 * Divide a pool. **The one implementation.**
 *
 * Pure, taking the KPIs and the money rather than reading a database, so the
 * live page, the close and the tests all exercise the same arithmetic with no
 * setup between them.
 */
export function dividePool(
  poolCents: number,
  kpis: ServerKpis[],
  weekStart: Date,
  extras: { dropped?: { guildId: string; reason: string }[]; challengeIds?: string[] } = {},
): PoolDivision {
  const flatPoolCents = Math.floor((poolCents * POOL_FLAT_BPS) / BPS);
  const scoredPoolCents = poolCents - flatPoolCents;

  if (kpis.length === 0) {
    return {
      weekStart,
      poolCents,
      flatPoolCents,
      scoredPoolCents,
      shares: [],
      dropped: extras.dropped ?? [],
      contributingChallengeIds: extras.challengeIds ?? [],
    };
  }

  const entrantRank = percentileRank(kpis.map((k) => k.entrants));
  const conversionRank = percentileRank(kpis.map((k) => k.conversion));
  const activationRank = percentileRank(kpis.map((k) => k.activation));

  const scores = kpis.map(
    (_, i) =>
      (entrantRank[i] * KPI_WEIGHTS.entrants +
        conversionRank[i] * KPI_WEIGHTS.conversion +
        activationRank[i] * KPI_WEIGHTS.activation) /
      100,
  );
  const totalScore = scores.reduce((a, b) => a + b, 0);

  // The flat share: split evenly among every server that carried an entrant.
  // Turning up is worth something — without it a small server that brought two
  // genuine players earns approximately nothing and stops bothering.
  const flatEach = Math.floor(flatPoolCents / kpis.length);

  const shares: PoolShare[] = kpis.map((k, i) => {
    const scoredCents =
      totalScore > 0 ? Math.floor((scoredPoolCents * scores[i]) / totalScore) : 0;
    return {
      ...k,
      score: scores[i],
      flatCents: flatEach,
      scoredCents,
      totalCents: flatEach + scoredCents,
    };
  });

  // ===== THE REMAINDER GOES TO THE TOP SERVER, NOT NOWHERE =====
  //
  // Flooring every share leaves up to a few cents unallocated, and a pool that
  // does not add up to what was allocated is a pool an owner can catch us on.
  // It goes to the highest-scoring server because somebody has to have it and
  // that is the least arbitrary rule available.
  const allocated = shares.reduce((sum, s) => sum + s.totalCents, 0);
  const remainder = poolCents - allocated;
  if (remainder > 0 && shares.length > 0) {
    const top = shares.reduce((best, s) => (s.score > best.score ? s : best), shares[0]);
    top.scoredCents += remainder;
    top.totalCents += remainder;
  }

  shares.sort((a, b) => b.totalCents - a.totalCents || b.score - a.score);

  return {
    weekStart,
    poolCents,
    flatPoolCents,
    scoredPoolCents,
    shares,
    dropped: extras.dropped ?? [],
    contributingChallengeIds: extras.challengeIds ?? [],
  };
}

/**
 * What each server would be paid if the week ended now.
 *
 * This is what `/pool` renders live, and what the weekly close reads on
 * Friday. Same function, same numbers, no second implementation.
 */
export async function poolDivisionFor(
  db: DB,
  weekStart: Date,
  now = new Date(),
): Promise<PoolDivision> {
  const { poolForWeek } = await import("../money/pool.ts");
  const poolCents = await poolForWeek(db, weekStart);
  const { kpis, dropped, challengeIds } = await kpisForWeek(db, weekStart, now);
  return dividePool(poolCents, kpis, weekStart, { dropped, challengeIds });
}

/**
 * The weekly close: turn the division into draft payouts.
 *
 * A3 — drafts. This computes; a human releases. `draftPayout` is idempotent
 * per (guild, week), so running the close twice is safe.
 */
export async function closeWeek(
  db: DB,
  weekStart: Date,
  now = new Date(),
): Promise<{ division: PoolDivision; drafted: number }> {
  const { draftPayout } = await import("../money/payouts.ts");
  const division = await poolDivisionFor(db, weekStart, now);

  let drafted = 0;
  for (const share of division.shares) {
    if (share.totalCents <= 0) continue;
    await draftPayout(db, {
      guildId: share.guildId,
      weekStart,
      lines: [
        {
          kind: "flat",
          description: "Flat participation share — carried at least one entrant",
          amountCents: share.flatCents,
        },
        {
          kind: "scored",
          description:
            `Scored share — ${share.entrants.toFixed(1)} entrants, ` +
            `${(share.conversion * 100).toFixed(1)}% conversion, ` +
            `${(share.activation * 100).toFixed(0)}% activation`,
          amountCents: share.scoredCents,
        },
      ],
    });
    drafted++;
  }

  return { division, drafted };
}

/** The denominator for conversion, snapshotted weekly. */
export async function snapshotGuilds(db: DB, weekStart: Date): Promise<number> {
  const { uid } = await import("../core/utils.ts");
  const guilds = await db
    .select()
    .from(schema.guilds)
    .where(isNull(schema.guilds.removedAt));

  for (const guild of guilds) {
    const [row] = await db
      .select({ n: sql<number>`count(distinct ${schema.users.id})::int` })
      .from(schema.users)
      .innerJoin(
        schema.linkedGameAccounts,
        eq(schema.linkedGameAccounts.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.users.parentGuildId, guild.guildId),
          ne(schema.users.status, "deleted"),
        ),
      );

    await db
      .insert(schema.guildSnapshots)
      .values({
        id: uid(),
        guildId: guild.guildId,
        weekStart,
        memberCount: guild.memberCount,
        linkedCount: row?.n ?? 0,
      })
      .onConflictDoNothing();
  }
  return guilds.length;
}
