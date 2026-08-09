// Who the audience is, in aggregate, and never who anybody is. B89.5.
//
// ===== THE DECISION THIS ENCODES =====
//
// A brand asked to see "the gamers". The answer is a shape, never a list.
// Everything here is a COUNT over a group, every group is checked against a
// floor before it is shown, and there is no export, no drill-down and no row a
// person can be picked out of. That is not a technical limitation we are
// working around — it is the product.
//
// ===== THE FLOOR IS THE WHOLE SAFETY MECHANISM =====
//
// A count of 1 is a person. A count of 3 in a 40-member server is three people
// anybody in that server can name. `COHORT_FLOOR` is the number below which a
// group is suppressed entirely rather than rounded, blurred or shown as "<25" —
// because "fewer than 25 women play Valorant in this server" is still a fact
// about a handful of identifiable people.
//
// Suppressed groups are COUNTED, not hidden: a brand is told how many slices
// were withheld. A silent omission looks like a gap in the market rather than a
// rule, and a brand that does not know a rule exists cannot plan around it.
//
// ===== WHAT IS DELIBERATELY NOT HERE =====
//
// No age slice. We hold an age BAND for legal gating, and slicing an audience
// by it would turn a compliance field into a targeting field — which is exactly
// the profiling of under-18s that nine jurisdictions bar. No per-server
// composition either: "your server's audience is 80% Brazil" is a fact about
// forty people the owner can enumerate.

import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * The smallest group we will describe.
 *
 * 25 is the floor the plan set and it is defensible rather than magic: it is
 * large enough that no single person moves a percentage by more than four
 * points, and small enough that a real games audience still resolves into
 * useful slices.
 */
export const COHORT_FLOOR = 25;

export type Slice = {
  key: string;
  label: string;
  /** How many gamers. Never fewer than COHORT_FLOOR — smaller groups are dropped. */
  gamers: number;
  /** Share of the total this dimension covers, 0–100, rounded to whole points. */
  pct: number;
};

export type Segment = {
  dimension: string;
  /** What this dimension answers, for a brand reading it cold. */
  question: string;
  slices: Slice[];
  /** Gamers in groups too small to describe. Shown, never silently dropped. */
  suppressed: number;
  /** How many groups that was. */
  suppressedGroups: number;
};

/**
 * Apply the floor.
 *
 * Everything below it is folded into a single suppressed count. Percentages are
 * computed against the WHOLE population including the suppressed part, so the
 * visible slices deliberately do not add to 100 — a brand should be able to see
 * that something is missing.
 */
function withFloor(
  rows: { key: string; label: string; n: number }[],
  total: number,
): Pick<Segment, "slices" | "suppressed" | "suppressedGroups"> {
  const kept = rows.filter((r) => r.n >= COHORT_FLOOR);
  const dropped = rows.filter((r) => r.n < COHORT_FLOOR);
  return {
    slices: kept
      .sort((a, b) => b.n - a.n)
      .map((r) => ({
        key: r.key,
        label: r.label,
        gamers: r.n,
        pct: total > 0 ? Math.round((r.n / total) * 100) : 0,
      })),
    suppressed: dropped.reduce((a, r) => a + r.n, 0),
    suppressedGroups: dropped.length,
  };
}

export type Audience = {
  /** Gamers with at least one verified game account. The population every slice is of. */
  total: number;
  segments: Segment[];
  /** Games that overlap: "of the people who play X, this many also play Y". */
  overlaps: { a: string; b: string; gamers: number; pctOfA: number }[];
};

/**
 * The audience, sliced.
 *
 * One query per dimension, all counting DISTINCT gamers rather than rows — a
 * gamer with three linked accounts is one person, and counting rows is how an
 * audience number quietly triples.
 */
export async function audienceSegments(db: DB): Promise<Audience> {
  const empty: Audience = { total: 0, segments: [], overlaps: [] };
  try {
    // The population: gamers who have proved they play something. Anybody who
    // signed up and never linked an account is not an audience a brand can
    // reach through a challenge.
    const [totalRow] = await db.select({
      n: sql<number>`count(distinct ${schema.linkedGameAccounts.userId})`,
    }).from(schema.linkedGameAccounts)
      .where(eq(schema.linkedGameAccounts.verified, true));
    const total = Number(totalRow?.n ?? 0);
    if (!total) return empty;

    // ===== By game =====
    const byGame = await db.select({
      key: schema.linkedGameAccounts.provider,
      n: sql<number>`count(distinct ${schema.linkedGameAccounts.userId})`,
    }).from(schema.linkedGameAccounts)
      .where(eq(schema.linkedGameAccounts.verified, true))
      .groupBy(schema.linkedGameAccounts.provider);

    // ===== By country =====
    //
    // Self-declared, and required since B89.2 — so this is a real distribution
    // rather than a sample of whoever bothered.
    const byCountry = await db.select({
      key: schema.users.country,
      n: sql<number>`count(distinct ${schema.users.id})`,
    }).from(schema.users)
      .innerJoin(schema.linkedGameAccounts, eq(schema.linkedGameAccounts.userId, schema.users.id))
      .where(and(eq(schema.linkedGameAccounts.verified, true), isNotNull(schema.users.country)))
      .groupBy(schema.users.country);

    // ===== By the size of server they are in =====
    //
    // A brand buying reach wants to know whether it is buying one big room or
    // two hundred small ones. This is the honest answer, and it is about
    // SERVERS rather than about people.
    const bySize = await db.select({
      size: sql<string>`case
        when ${schema.discordGuilds.memberCount} >= 5000 then 'huge'
        when ${schema.discordGuilds.memberCount} >= 1000 then 'large'
        when ${schema.discordGuilds.memberCount} >= 200 then 'mid'
        else 'small' end`,
      n: sql<number>`count(distinct ${schema.discordGuildMembers.userId})`,
    }).from(schema.discordGuildMembers)
      .innerJoin(schema.discordGuilds, eq(schema.discordGuilds.guildId, schema.discordGuildMembers.guildId))
      // THE SAME POPULATION AS EVERY OTHER SLICE.
      //
      // Without this join it counts every Discord member we have ever seen,
      // against a total of gamers who have LINKED an account — and the first
      // run of this function reported a size bracket at 291%. A percentage over
      // a hundred is the visible version of the bug; the invisible version is a
      // brand being sold reach that cannot enter a challenge.
      .innerJoin(
        schema.linkedGameAccounts,
        and(
          eq(schema.linkedGameAccounts.userId, schema.discordGuildMembers.userId),
          eq(schema.linkedGameAccounts.verified, true),
        ),
      )
      .groupBy(sql`1`);

    const SIZE_LABEL: Record<string, string> = {
      huge: "Servers over 5,000 members",
      large: "1,000 – 5,000 members",
      mid: "200 – 1,000 members",
      small: "Under 200 members",
    };

    const segments: Segment[] = [
      {
        dimension: "Games",
        question: "What does this audience actually play?",
        ...withFloor(byGame.map((r) => ({ key: r.key, label: r.key, n: Number(r.n) })), total),
      },
      {
        dimension: "Countries",
        question: "Where are they, for a campaign that has to ship a prize?",
        ...withFloor(
          byCountry.map((r) => ({ key: r.key ?? "??", label: r.key ?? "Unknown", n: Number(r.n) })),
          total,
        ),
      },
      {
        dimension: "Community size",
        question: "Is this one big room, or many small ones?",
        ...withFloor(
          bySize.map((r) => ({ key: r.size, label: SIZE_LABEL[r.size] ?? r.size, n: Number(r.n) })),
          total,
        ),
      },
    ];

    return { total, segments, overlaps: await gameOverlaps(db) };
  } catch { return empty; }
}

/**
 * "Of the people who play X, this many also play Y."
 *
 * The most useful thing a games brand can be told and the one most likely to
 * identify somebody, so the floor applies to the INTERSECTION as well as to
 * each side of it — a pair with 200 on each side and 4 in common is four
 * people.
 */
async function gameOverlaps(db: DB): Promise<Audience["overlaps"]> {
  try {
    const a = schema.linkedGameAccounts;
    const rows = await db.select({
      a: sql<string>`x.provider`,
      b: sql<string>`y.provider`,
      n: sql<number>`count(distinct x.user_id)`,
    }).from(sql`${a} as x`)
      .innerJoin(sql`${a} as y`, sql`x.user_id = y.user_id and x.provider < y.provider`)
      .where(sql`x.verified = true and y.verified = true`)
      .groupBy(sql`x.provider, y.provider`);

    const sides = await db.select({
      key: a.provider,
      n: sql<number>`count(distinct ${a.userId})`,
    }).from(a).where(eq(a.verified, true)).groupBy(a.provider);
    const sideOf = new Map(sides.map((s) => [s.key, Number(s.n)]));

    return rows
      .map((r) => ({ a: r.a, b: r.b, gamers: Number(r.n), pctOfA: 0 }))
      .filter((r) =>
        r.gamers >= COHORT_FLOOR
        && (sideOf.get(r.a) ?? 0) >= COHORT_FLOOR
        && (sideOf.get(r.b) ?? 0) >= COHORT_FLOOR)
      .map((r) => ({
        ...r,
        pctOfA: Math.round((r.gamers / Math.max(1, sideOf.get(r.a) ?? 1)) * 100),
      }))
      .sort((x, y) => y.gamers - x.gamers)
      .slice(0, 12);
  } catch { return []; }
}

/**
 * Is there enough of an audience to describe at all?
 *
 * Below the floor the honest answer is "not yet", and saying so beats a page of
 * suppressed rows that reads like a bug.
 */
export const describable = (a: Audience) => a.total >= COHORT_FLOOR;
