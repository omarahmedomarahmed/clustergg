// What the public pages read. One place, so no page invents a query.

import { and, desc, eq, gt, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.ts";
import { weekFor, weekStartPlus, phaseAt } from "../challenges/week.ts";
import { standingsOf } from "../challenges/scoring.ts";
import { poolDivisionFor } from "../pool/score.ts";

export async function liveChallenges(now = new Date()) {
  const db = await getDb();
  return db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.visibility, "sponsored"),
        or(eq(schema.challenges.state, "live"), eq(schema.challenges.state, "announced")),
        gt(schema.challenges.endAt, now),
      ),
    )
    .orderBy(schema.challenges.startAt);
}

export async function nextWeekChallenges(now = new Date()) {
  const db = await getDb();
  return db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.state, "announced"),
        eq(schema.challenges.startAt, weekStartPlus(now, 1)),
      ),
    );
}

export async function endedChallenges(limit = 12) {
  const db = await getDb();
  return db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.state, "ended"))
    .orderBy(desc(schema.challenges.endAt))
    .limit(limit);
}

export async function communityChallenges(now = new Date()) {
  const db = await getDb();
  return db
    .select()
    .from(schema.challenges)
    .where(
      and(eq(schema.challenges.visibility, "community"), gt(schema.challenges.endAt, now)),
    );
}

/** The live pool, from the same function Friday's close uses. */
export async function livePool(now = new Date()) {
  const db = await getDb();
  return poolDivisionFor(db, weekFor(now).start, now);
}

export async function challengeById(id: string) {
  const db = await getDb();
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, id));
  return challenge ?? null;
}

export async function challengeDetail(id: string, now = new Date()) {
  const db = await getDb();
  const challenge = await challengeById(id);
  if (!challenge) return null;

  const standings = await standingsOf(db, id, now);
  const trophies = await db
    .select()
    .from(schema.trophies)
    .where(eq(schema.trophies.challengeId, id))
    .orderBy(schema.trophies.place);

  // Reach: every member of every server it was announced to. Counted from the
  // rows the announcement wrote, never modelled — and deliberately
  // double-counted across challenges (docs/00-TRUTH.md §8).
  const [reach] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.challengeAnnouncements.memberCountAt}), 0)::int`,
    })
    .from(schema.challengeAnnouncements)
    .where(eq(schema.challengeAnnouncements.challengeId, id));

  return { challenge, standings, trophies, reachCount: reach?.total ?? 0 };
}

/**
 * The trophy showcase.
 *
 * T3 — the participation trophy shows **once** with a holder count, never one
 * row per gamer. That is a property of grouping by definition, which is what
 * this does, rather than of how the page chooses to render.
 */
export async function trophyShowcase() {
  const db = await getDb();
  return db
    .select({
      trophy: schema.trophies,
      holders: sql<number>`count(${schema.userTrophies.id})::int`,
    })
    .from(schema.trophies)
    .leftJoin(schema.userTrophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .groupBy(schema.trophies.id)
    .orderBy(desc(schema.trophies.valueCents));
}

export async function trophyDetail(id: string) {
  const db = await getDb();
  const [trophy] = await db.select().from(schema.trophies).where(eq(schema.trophies.id, id));
  if (!trophy) return null;

  const holdings = await db
    .select({ holding: schema.userTrophies, user: schema.users })
    .from(schema.userTrophies)
    .innerJoin(schema.users, eq(schema.userTrophies.userId, schema.users.id))
    .where(eq(schema.userTrophies.trophyId, id));

  return {
    trophy,
    current: holdings.filter((h) => !h.holding.redeemedAt),
    past: holdings.filter((h) => h.holding.redeemedAt),
  };
}

export async function serverBySlug(slug: string) {
  const db = await getDb();
  const [guild] = await db.select().from(schema.guilds).where(eq(schema.guilds.slug, slug));
  if (!guild) return null;
  const community = await db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.guildId, guild.guildId),
        eq(schema.challenges.visibility, "community"),
      ),
    );
  return { guild, community };
}

export async function profileBySlug(slug: string) {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug));
  if (!user || user.status !== "active") return null;

  const holdings = await db
    .select({ holding: schema.userTrophies, trophy: schema.trophies })
    .from(schema.userTrophies)
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .where(eq(schema.userTrophies.userId, user.id));

  const entries = await db
    .select({ participant: schema.challengeParticipants, challenge: schema.challenges })
    .from(schema.challengeParticipants)
    .innerJoin(
      schema.challenges,
      eq(schema.challengeParticipants.challengeId, schema.challenges.id),
    )
    .where(eq(schema.challengeParticipants.userId, user.id));

  return { user, holdings, entries };
}

export { phaseAt, weekFor };
