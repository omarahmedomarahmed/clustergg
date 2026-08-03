import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// One sponsored challenge, in full, for the brand that paid for it.
//
// The portal showed a cover image and a podium. That is a poster, not a report:
// a brand that has bought four weeks wants to know who turned up in each one,
// how the field actually moved, and what the trophy their logo is on looks like.
// "Who won the week" is the least interesting three rows of the whole thing —
// the other forty are the audience.
//
// Everything here is scoped to `sponsorBrandId`. A brand can name any challenge
// id it likes; if it didn't pay for it, it gets null.

export type BrandTrophy = {
  id: string;
  name: string;
  tier: string;
  imageUrl: string;
  /** Set once staff swap the generic cup for the brand's own. */
  brandId: string | null;
  brandName: string | null;
  /** Which place it's attached to — 1, 2, 3, or 0 for the challenge-wide one. */
  place: number;
  value: number;
};

export type BrandEntrant = {
  userId: string;
  place: number;
  name: string;
  slug: string;
  avatarUrl: string | null;
  country: string | null;
  inGameName: string | null;
  points: number;
  /** web | discord — the funnel metric that shows what the bot is worth. */
  joinedFrom: string;
  joinedAt: string;
  /** The server they came through, when they arrived via Discord. */
  guildName: string | null;
};

export type ScoringEvent = {
  at: string;
  type: string;
  points: number;
  /** Running total after this event, so a chart needs no second pass. */
  total: number;
};

export type BrandChallengeDetail = {
  challengeId: string;
  title: string;
  description: string;
  game: string;
  status: string;
  startAt: string;
  endAt: string;
  coverUrl: string | null;
  prizeDescription: string | null;
  /** The entry rules, in the game's own words. */
  entryRules: string[];
  trophies: BrandTrophy[];
  entrants: BrandEntrant[];
  /** Where the announcement actually landed. */
  servers: { name: string; members: number; linked: number }[];
};

/**
 * The whole of one challenge, or null if this brand didn't pay for it.
 *
 * Written as a handful of set-based queries rather than a loop: a month is four
 * challenges and a challenge can be four hundred entrants, and a page that
 * issues a query per entrant is a page that dies the week it starts working.
 */
export async function brandChallengeDetail(
  brandId: string,
  challengeId: string,
): Promise<BrandChallengeDetail | null> {
  try {
    const db = await getDb();
    const [c] = await db.select().from(schema.challenges).where(and(
      eq(schema.challenges.id, challengeId),
      eq(schema.challenges.sponsorBrandId, brandId),
    )).limit(1);
    if (!c) return null;

    // --- Trophies, including the branded ones staff attach later ------------
    const prizes = (c.prizes ?? {}) as { first?: string[]; second?: string[]; third?: string[] };
    const placeOf = new Map<string, number>();
    for (const id of prizes.first ?? []) placeOf.set(id, 1);
    for (const id of prizes.second ?? []) placeOf.set(id, 2);
    for (const id of prizes.third ?? []) placeOf.set(id, 3);
    if (c.trophyId && !placeOf.has(c.trophyId)) placeOf.set(c.trophyId, 0);
    const trophyIds = [...placeOf.keys()];

    const [trophyRows, participants] = await Promise.all([
      trophyIds.length
        ? db.select({
          id: schema.trophies.id, name: schema.trophies.name, tier: schema.trophies.tier,
          imageUrl: schema.trophies.imageUrl, brandId: schema.trophies.brandId,
          value: schema.trophies.value,
        }).from(schema.trophies).where(inArray(schema.trophies.id, trophyIds))
        : Promise.resolve([]),
      db.select({
        userId: schema.challengeParticipants.userId,
        points: schema.challengeParticipants.currentPoints,
        joinedFrom: schema.challengeParticipants.joinedFrom,
        joinedAt: schema.challengeParticipants.joinedAt,
        finalPlacement: schema.challengeParticipants.finalPlacement,
        name: schema.users.displayName,
        slug: schema.users.slug,
        avatarUrl: schema.users.avatarUrl,
        country: schema.users.country,
        inGameName: schema.linkedGameAccounts.inGameName,
      })
        .from(schema.challengeParticipants)
        .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
        .leftJoin(schema.linkedGameAccounts,
          eq(schema.challengeParticipants.linkedAccountId, schema.linkedGameAccounts.id))
        .where(eq(schema.challengeParticipants.challengeId, challengeId))
        .orderBy(desc(schema.challengeParticipants.currentPoints))
        .limit(500),
    ]);

    // Brand names for the trophies, so "your logo is on this one" is visible.
    const brandIds = [...new Set(trophyRows.map((t) => t.brandId).filter(Boolean))] as string[];
    const brandNames = new Map<string, string>();
    if (brandIds.length) {
      const rows = await db.select({ id: schema.brands.id, name: schema.brands.name })
        .from(schema.brands).where(inArray(schema.brands.id, brandIds));
      for (const b of rows) brandNames.set(b.id, b.name);
    }

    // --- Which server each Discord entrant came through ---------------------
    //
    // One query for the whole field. A gamer can be in several servers running
    // the bot; the earliest membership is the one that introduced them, which
    // is the attribution a brand is actually buying.
    const userIds = participants.map((p) => p.userId);
    const guildOf = new Map<string, string>();
    if (userIds.length) {
      const memberships = await db.select({
        userId: schema.discordGuildMembers.userId,
        guildId: schema.discordGuildMembers.guildId,
        name: schema.discordGuilds.name,
        joinedAt: schema.discordGuildMembers.joinedAt,
      })
        .from(schema.discordGuildMembers)
        .leftJoin(schema.discordGuilds, eq(schema.discordGuilds.guildId, schema.discordGuildMembers.guildId))
        .where(inArray(schema.discordGuildMembers.userId, userIds))
        .orderBy(asc(schema.discordGuildMembers.joinedAt));
      for (const m of memberships) {
        if (!guildOf.has(m.userId)) guildOf.set(m.userId, m.name || "A Discord server");
      }
    }

    const entrants: BrandEntrant[] = participants.map((p, i) => ({
      userId: p.userId,
      // A finished challenge has frozen placements; a live one is ranked by
      // points as it stands. Showing "1st" on a live board that hasn't ended
      // would be a result we haven't got yet.
      place: p.finalPlacement ?? i + 1,
      name: p.name, slug: p.slug, avatarUrl: p.avatarUrl, country: p.country,
      inGameName: p.inGameName ?? null,
      points: p.points,
      joinedFrom: p.joinedFrom ?? "web",
      joinedAt: p.joinedAt.toISOString(),
      guildName: guildOf.get(p.userId) ?? null,
    }));

    const { ruleLines } = await import("@/lib/challenge-rules");
    const { getProvider } = await import("@/lib/providers/registry");

    // Where it landed, from the delivery ledger rather than an estimate.
    const servers = await serversFor(db, challengeId);

    return {
      challengeId: c.id,
      title: c.title,
      description: c.description ?? "",
      game: c.game,
      status: c.status,
      startAt: c.startAt.toISOString(),
      endAt: c.endAt.toISOString(),
      coverUrl: c.coverUrl ?? c.heroUrl ?? null,
      prizeDescription: c.prizeDescription ?? null,
      entryRules: ruleLines(c.rules?.conditions, getProvider(c.provider)?.capabilities ?? []),
      trophies: trophyRows.map((t) => ({
        id: t.id, name: t.name, tier: t.tier, imageUrl: t.imageUrl,
        brandId: t.brandId, brandName: t.brandId ? brandNames.get(t.brandId) ?? null : null,
        place: placeOf.get(t.id) ?? 0,
        value: Number(t.value ?? 0),
      })).sort((a, b) => (a.place || 9) - (b.place || 9)),
      entrants,
      servers,
    };
  } catch { return null; }
}

/** The servers a challenge was actually delivered to. */
async function serversFor(
  db: Awaited<ReturnType<typeof getDb>>,
  challengeId: string,
): Promise<{ name: string; members: number; linked: number }[]> {
  try {
    const rows = await db.select({
      name: schema.discordGuilds.name,
      guildId: schema.discordGuilds.guildId,
      members: schema.discordGuilds.memberCount,
    })
      .from(schema.challengeDeliveries)
      .leftJoin(schema.discordGuilds, eq(schema.discordGuilds.guildId, schema.challengeDeliveries.guildId))
      .where(eq(schema.challengeDeliveries.challengeId, challengeId))
      .limit(200);
    return rows.map((r) => ({
      name: r.name || r.guildId || "A Discord server",
      members: Number(r.members ?? 0),
      linked: 0,
    }));
  } catch { return []; }
}

/**
 * How one gamer earned their points, event by event.
 *
 * This is what turns a leaderboard row into an audience member: a brand can see
 * that somebody played every day of the week they sponsored rather than
 * appearing once at the end. Scoped through the challenge to the brand, so a
 * brand cannot read a gamer's history in somebody else's competition.
 */
export async function brandGamerScoring(
  brandId: string,
  challengeId: string,
  userId: string,
): Promise<{ name: string; slug: string; total: number; events: ScoringEvent[] } | null> {
  try {
    const db = await getDb();
    const [owned] = await db.select({ id: schema.challenges.id }).from(schema.challenges).where(and(
      eq(schema.challenges.id, challengeId),
      eq(schema.challenges.sponsorBrandId, brandId),
    )).limit(1);
    if (!owned) return null;

    const [p] = await db.select({
      id: schema.challengeParticipants.id,
      points: schema.challengeParticipants.currentPoints,
      name: schema.users.displayName,
      slug: schema.users.slug,
    })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .where(and(
        eq(schema.challengeParticipants.challengeId, challengeId),
        eq(schema.challengeParticipants.userId, userId),
      )).limit(1);
    if (!p) return null;

    const rows = await db.select({
      createdAt: schema.challengeEvents.createdAt,
      eventType: schema.challengeEvents.eventType,
      pointsAwarded: schema.challengeEvents.pointsAwarded,
    })
      .from(schema.challengeEvents)
      .where(eq(schema.challengeEvents.participantId, p.id))
      .orderBy(asc(schema.challengeEvents.createdAt))
      .limit(500);

    let total = 0;
    const events: ScoringEvent[] = rows.map((r) => {
      total += r.pointsAwarded;
      return {
        at: r.createdAt.toISOString(),
        type: r.eventType,
        points: r.pointsAwarded,
        total,
      };
    });
    return { name: p.name, slug: p.slug, total: p.points, events };
  } catch { return null; }
}
