// A server's public page. B100.
//
// ===== WHAT IT WAS, AND WHY THAT WAS NOT ENOUGH =====
//
// The public half of a server's route showed three things: a badge row, a list
// of live challenges, and a form asking whether you were the owner. It was the
// locked-out screen with some decoration, not a page anybody would send to
// anybody.
//
// It has two real readers and it was serving neither:
//
//   a gamer  who followed a challenge link and wants to know what this
//            community is and whether to join it.
//   an owner  looking at a rival server and deciding whether this is worth
//            doing — which is the single most valuable page we have for
//            growth, because owners are recruited by other owners.
//
// ===== WHAT IT SHOWS, AND WHAT IT REFUSES TO =====
//
// Aggregates and the owner's own words. Linked gamers, trophies their members
// have won, challenges run, this week's standing, and the profile the owner
// wrote for brands — games, regions, what kind of community it is.
//
// It never lists members, never names one, and never shows a count small enough
// to identify anybody. That is the same rule `lib/segments.ts` runs on: the
// audience is a shape, never a list. An owner is entitled to show off their
// community; nobody is entitled to a roster of the gamers inside it.
//
// The money it shows is what the SERVER earned. Never what a member earned —
// that is the gamer's own business, and a leaderboard of who won what inside
// somebody's Discord is a thing that gets people harassed.

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Below this, a count is shown as "a few" rather than as a number.
 *
 * The same floor `lib/segments.ts` uses, for the same reason and deliberately
 * the same constant would be better — but that one is about what a BRAND may
 * slice, and this is about what a passer-by may read off a public page. They
 * move for different reasons, so they are separate numbers that happen to
 * agree today.
 */
export const PUBLIC_FLOOR = 5;

export type PublicTrophy = {
  name: string;
  imageUrl: string;
  /** How many of this trophy members of this server hold. Never who. */
  count: number;
};

export type PublicServerProfile = {
  guildId: string;
  /** Gamers from this server with a linked game account. */
  linked: number;
  /** Whether that number is big enough to print. See PUBLIC_FLOOR. */
  showLinked: boolean;
  /** Sponsored challenges that have run here. */
  challengesRun: number;
  /** Trophies won by members, by trophy. Never by person. */
  trophies: PublicTrophy[];
  trophyCount: number;
  /** What the SERVER has been paid, all time. Never what a member earned. */
  earnedAllTime: number;
  /** Members who entered a sponsored challenge in the last 30 days. */
  activeLast30: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

export async function publicServerProfile(db: DB, guildId: string): Promise<PublicServerProfile> {
  const empty: PublicServerProfile = {
    guildId, linked: 0, showLinked: false, challengesRun: 0,
    trophies: [], trophyCount: 0, earnedAllTime: 0, activeLast30: 0,
  };
  try {
    const thirtyDays = new Date(Date.now() - 30 * 86400_000);

    // Members of this guild who hold a VERIFIED linked account. Verified, not
    // merely claimed — an unverified row is somebody who typed a name, and
    // counting it would inflate the one number an owner is judged on.
    const memberIds = (await db.select({ userId: schema.discordGuildMembers.userId })
      .from(schema.discordGuildMembers)
      .where(eq(schema.discordGuildMembers.guildId, guildId)))
      .map((m) => m.userId)
      .filter((x): x is string => !!x);

    if (memberIds.length === 0) return empty;

    const [linkedRows, runRows, paidRows, activeRows] = await Promise.all([
      db.select({ n: sql<number>`count(distinct ${schema.linkedGameAccounts.userId})` })
        .from(schema.linkedGameAccounts)
        .where(and(
          inArray(schema.linkedGameAccounts.userId, memberIds),
          eq(schema.linkedGameAccounts.verified, true),
        )),
      db.select({ n: sql<number>`count(*)` })
        .from(schema.challenges)
        .where(eq(schema.challenges.guildId, guildId)),
      // A payout has no amount of its own — it is the sum of its LINES, which
      // is what makes a cheque auditable line by line. Summed here rather than
      // read off a denormalised total for the same reason the vaults are.
      db.select({ n: sql<number>`coalesce(sum(${schema.serverPayoutLines.amount}), 0)` })
        .from(schema.serverPayoutLines)
        .innerJoin(schema.serverPayouts, eq(schema.serverPayouts.id, schema.serverPayoutLines.payoutId))
        .where(and(
          eq(schema.serverPayouts.guildId, guildId),
          eq(schema.serverPayouts.status, "paid"),
        )),
      db.select({ n: sql<number>`count(distinct ${schema.challengeParticipants.userId})` })
        .from(schema.challengeParticipants)
        .where(and(
          eq(schema.challengeParticipants.guildId, guildId),
          gte(schema.challengeParticipants.joinedAt, thirtyDays),
        )),
    ]);

    // Trophies held by members, grouped by TROPHY. The group-by is what makes
    // this safe to show: "four gamers here hold the Ramadan Cup" says something
    // about the community, and names nobody.
    const trophyRows = await db.select({
      name: schema.trophies.name,
      imageUrl: schema.trophies.imageUrl,
      n: sql<number>`count(*)`,
    }).from(schema.userTrophies)
      .innerJoin(schema.trophies, eq(schema.trophies.id, schema.userTrophies.trophyId))
      .where(inArray(schema.userTrophies.userId, memberIds))
      .groupBy(schema.trophies.name, schema.trophies.imageUrl)
      .orderBy(desc(sql`count(*)`))
      .limit(12);

    const linked = Number(linkedRows[0]?.n ?? 0);
    const trophies = trophyRows.map((t) => ({
      name: t.name, imageUrl: t.imageUrl, count: Number(t.n ?? 0),
    }));

    return {
      guildId,
      linked,
      showLinked: linked >= PUBLIC_FLOOR,
      challengesRun: Number(runRows[0]?.n ?? 0),
      trophies,
      trophyCount: trophies.reduce((a, t) => a + t.count, 0),
      earnedAllTime: money(Number(paidRows[0]?.n ?? 0)),
      activeLast30: Number(activeRows[0]?.n ?? 0),
    };
  } catch { return empty; }
}
