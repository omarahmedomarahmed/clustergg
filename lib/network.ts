import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// The numbers the platform is actually judged on now.
//
// The product moved from "a gamer identity site" to "the engagement layer for
// Discord communities", and the headline number moved with it. Reach is the
// combined membership of every server running ClusterBot — that's the audience
// a brand is buying and the number an owner joins for. Registered accounts are
// a conversion metric underneath it, not the story.

export type NetworkStats = {
  servers: number;        // servers running the bot
  reach: number;          // combined Discord membership across them
  gamers: number;         // people with a Cluster profile
  linked: number;         // …who linked a game account
  challenges: number;     // live competitions
  games: number;          // games we sync
};

export async function networkStats(): Promise<NetworkStats> {
  const empty: NetworkStats = { servers: 0, reach: 0, gamers: 0, linked: 0, challenges: 0, games: 0 };
  try {
    const db = await getDb();
    const [guilds, counts] = await Promise.all([
      db.select({
        servers: sql<number>`count(*)`,
        reach: sql<number>`coalesce(sum(${schema.discordGuilds.memberCount}), 0)`,
      }).from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active")),
      db.select({
        gamers: sql<number>`(SELECT COUNT(*) FROM users)`,
        linked: sql<number>`(SELECT COUNT(DISTINCT user_id) FROM linked_game_accounts)`,
        challenges: sql<number>`(SELECT COUNT(*) FROM challenges WHERE status = 'active')`,
        games: sql<number>`(SELECT COUNT(*) FROM games WHERE is_active = true)`,
      }).from(schema.users).limit(1),
    ]);
    const n = (v: unknown) => Math.max(0, Math.round(Number(v ?? 0)));
    return {
      servers: n(guilds[0]?.servers),
      reach: n(guilds[0]?.reach),
      gamers: n(counts[0]?.gamers),
      linked: n(counts[0]?.linked),
      challenges: n(counts[0]?.challenges),
      games: n(counts[0]?.games),
    };
  } catch { return empty; }
}

export type PublicServer = {
  guildId: string;
  slug: string | null;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  inviteUrl: string | null;
  linked: number;
  challenges: number;
};

// Every server running the bot, for the public directory. Ranked by the number
// that reflects effort rather than luck: gamers they brought to Cluster.
export async function publicServers(limit = 60): Promise<PublicServer[]> {
  try {
    const db = await getDb();
    const [guilds, linkedRows, challengeRows] = await Promise.all([
      db.select({
        guildId: schema.discordGuilds.guildId,
        slug: schema.discordGuilds.slug,
        name: schema.discordGuilds.name,
        iconUrl: schema.discordGuilds.iconUrl,
        memberCount: schema.discordGuilds.memberCount,
        inviteUrl: schema.discordGuilds.inviteUrl,
      }).from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active")).limit(limit),
      db.select({
        guildId: schema.discordGuildMembers.guildId,
        n: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
      }).from(schema.discordGuildMembers).groupBy(schema.discordGuildMembers.guildId),
      db.select({ guildId: schema.challenges.guildId, n: sql<number>`count(*)` })
        .from(schema.challenges).groupBy(schema.challenges.guildId),
    ]);
    const linkedBy = new Map(linkedRows.map((r) => [r.guildId, Number(r.n ?? 0)]));
    const chBy = new Map(challengeRows.map((r) => [r.guildId ?? "", Number(r.n ?? 0)]));
    return guilds
      .map((g) => ({
        ...g,
        name: g.name || g.guildId,
        linked: linkedBy.get(g.guildId) ?? 0,
        challenges: chBy.get(g.guildId) ?? 0,
      }))
      .sort((a, b) => b.linked - a.linked || b.memberCount - a.memberCount);
  } catch { return []; }
}
