import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// What a server IS, according to the person running it.
//
// A brand buying Discord needs to be able to ask for "PUBG players in MENA"
// and get an answer. Everything else Cluster holds about a server is derived —
// linked accounts, challenge entries — and derived data lags reality by weeks
// and says nothing at all about a server on its first day. The owner knows
// today. So we ask, once, at install, in about twenty seconds.
//
// Three rules make it worth asking:
//
//   1. **Every question is skippable.** A half-answered profile is worth more
//      than an abandoned one, and an owner who feels interrogated at install
//      removes the bot.
//   2. **The answers are the owner's, and they can change them.** They are
//      shown back on the portal and re-editable from `/cluster admin`.
//   3. **They are inventory, and the owner is told so.** A server that says
//      what it plays gets sponsored challenges in those games sooner. Hiding
//      why we're asking is how you get garbage answers.

export type CommunityProfile = {
  /** Games this community actually plays, from our connected catalogue. */
  games: string[];
  /** Where most members are. Region keys from `REGIONS`. */
  regions: string[];
  /** What kind of community it is. Keys from `VIBES`. */
  vibes: string[];
  /** The owner's own description, from the one free-text field. */
  about: string;
  /** ISO timestamp of the last answer, or null while unanswered. */
  answeredAt: string | null;
};

export const EMPTY_PROFILE: CommunityProfile = {
  games: [], regions: [], vibes: [], about: "", answeredAt: null,
};

/**
 * Regions, not countries.
 *
 * A server owner cannot tell you the country split of five thousand members and
 * will guess if asked. They can tell you "mostly MENA, some Europe" accurately.
 * Country-level targeting comes from the gamers' own profiles, which are
 * self-declared per person and far more reliable at the individual level; this
 * is the server-level shape that fills in before there are enough of those.
 */
export const REGIONS: { key: string; label: string }[] = [
  { key: "mena", label: "Middle East & North Africa" },
  { key: "eu", label: "Europe" },
  { key: "na", label: "North America" },
  { key: "latam", label: "Latin America" },
  { key: "sea", label: "Southeast Asia" },
  { key: "sa", label: "South Asia" },
  { key: "ea", label: "East Asia" },
  { key: "oce", label: "Oceania" },
  { key: "ssa", label: "Sub-Saharan Africa" },
  { key: "mixed", label: "Everywhere — no main region" },
];

export const VIBES: { key: string; label: string }[] = [
  { key: "competitive", label: "Competitive — ranked, scrims, tryhards" },
  { key: "casual", label: "Casual — playing for fun after work" },
  { key: "creator", label: "Built around a creator or streamer" },
  { key: "esports", label: "An esports team or org" },
  { key: "clan", label: "A clan or guild that plays together" },
  { key: "local", label: "A local or language community" },
  { key: "trading", label: "Trading, skins or in-game economy" },
  { key: "lfg", label: "Looking-for-group / matchmaking" },
];

const label = (list: { key: string; label: string }[], key: string) =>
  list.find((r) => r.key === key)?.label ?? key;

export const regionLabel = (key: string) => label(REGIONS, key);
export const vibeLabel = (key: string) => label(VIBES, key);

/** Parse whatever is stored into a profile that is always safe to render. */
export function parseCommunity(raw: unknown): CommunityProfile {
  const o = (raw ?? {}) as Partial<Record<keyof CommunityProfile, unknown>>;
  const list = (v: unknown, allowed: Set<string> | null, max: number): string[] => {
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of v) {
      const s = typeof item === "string" ? item.trim().slice(0, 60) : "";
      if (!s || seen.has(s) || (allowed && !allowed.has(s))) continue;
      seen.add(s);
      out.push(s);
      if (out.length >= max) break;
    }
    return out;
  };
  return {
    // Games are NOT validated against a fixed set here: the catalogue is live
    // and a game removed from it shouldn't erase what a server told us.
    games: list(o.games, null, 8),
    regions: list(o.regions, new Set(REGIONS.map((r) => r.key)), 4),
    vibes: list(o.vibes, new Set(VIBES.map((v) => v.key)), 4),
    about: typeof o.about === "string" ? o.about.trim().slice(0, 400) : "",
    answeredAt: typeof o.answeredAt === "string" ? o.answeredAt : null,
  };
}

export async function getCommunity(guildId: string): Promise<CommunityProfile> {
  try {
    const db = await getDb();
    const [row] = await db.select({ community: schema.discordGuilds.community })
      .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
    return parseCommunity(row?.community);
  } catch { return EMPTY_PROFILE; }
}

/**
 * Merge one answer into a server's profile.
 *
 * Merged rather than replaced, because the questions are answered one at a time
 * from separate select menus and an owner who picks their games and then their
 * region must not lose the games.
 */
export async function saveCommunity(
  guildId: string,
  patch: Partial<CommunityProfile>,
): Promise<CommunityProfile> {
  const current = await getCommunity(guildId);
  const merged = parseCommunity({
    ...current,
    ...patch,
    // Only stamp "answered" once something real is in it — an owner who opened
    // the card and closed it has not described their community.
    answeredAt:
      (patch.games ?? current.games).length || (patch.regions ?? current.regions).length
        || (patch.vibes ?? current.vibes).length || (patch.about ?? current.about)
        ? new Date().toISOString()
        : current.answeredAt,
  });
  try {
    const db = await getDb();
    await db.update(schema.discordGuilds).set({ community: merged })
      .where(eq(schema.discordGuilds.guildId, guildId));
  } catch { /* the owner sees their answer either way; the next save retries */ }
  return merged;
}

/** How much of the profile is filled in, 0–100. Drives the nudge to finish it. */
export function completeness(p: CommunityProfile): number {
  const done = [p.games.length > 0, p.regions.length > 0, p.vibes.length > 0, p.about.length > 0];
  return Math.round((done.filter(Boolean).length / done.length) * 100);
}

// ===== The other side: what a brand can buy =====

export type GameAudience = {
  game: string;
  /** Servers whose owner named this game. */
  servers: number;
  /** Linked gamers in those servers — the reachable audience. */
  gamers: number;
  /** Servers that have crossed the unlock threshold. */
  unlockedServers: number;
};

export type RegionAudience = {
  region: string;
  label: string;
  servers: number;
  gamers: number;
};

export type TargetingInventory = {
  /** Servers with the bot, and how many have described themselves. */
  servers: number;
  described: number;
  /** Every linked gamer the network reaches. */
  gamers: number;
  byGame: GameAudience[];
  byRegion: RegionAudience[];
};

/**
 * The audience a brand is choosing from, rolled up from what owners told us.
 *
 * This is the whole reason the questions exist: it turns "we have some Discord
 * servers" into a line a media buyer can act on — this many gamers, in this
 * game, in this region, across this many communities. Every number is counted,
 * never projected; a game nobody named simply isn't listed.
 */
export async function targetingInventory(): Promise<TargetingInventory> {
  const empty: TargetingInventory = { servers: 0, described: 0, gamers: 0, byGame: [], byRegion: [] };
  try {
    const db = await getDb();
    const guilds = await db.select({
      guildId: schema.discordGuilds.guildId,
      community: schema.discordGuilds.community,
      unlockedAt: schema.discordGuilds.adUnlockedAt,
    }).from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active"));
    if (!guilds.length) return empty;

    const { sql } = await import("drizzle-orm");
    const counts = await db.select({
      guildId: schema.discordGuildMembers.guildId,
      linked: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
    }).from(schema.discordGuildMembers).groupBy(schema.discordGuildMembers.guildId);
    const linkedBy = new Map(counts.map((c) => [c.guildId, Number(c.linked ?? 0)]));

    const games = new Map<string, GameAudience>();
    const regions = new Map<string, RegionAudience>();
    let described = 0;
    let gamers = 0;

    for (const g of guilds) {
      const profile = parseCommunity(g.community);
      const linked = linkedBy.get(g.guildId) ?? 0;
      gamers += linked;
      if (profile.answeredAt) described++;

      for (const game of profile.games) {
        const row = games.get(game) ?? { game, servers: 0, gamers: 0, unlockedServers: 0 };
        row.servers++;
        row.gamers += linked;
        if (g.unlockedAt) row.unlockedServers++;
        games.set(game, row);
      }
      for (const key of profile.regions) {
        const row = regions.get(key) ?? { region: key, label: regionLabel(key), servers: 0, gamers: 0 };
        row.servers++;
        row.gamers += linked;
        regions.set(key, row);
      }
    }

    return {
      servers: guilds.length,
      described,
      gamers,
      byGame: [...games.values()].sort((a, b) => b.gamers - a.gamers || b.servers - a.servers),
      byRegion: [...regions.values()].sort((a, b) => b.gamers - a.gamers || b.servers - a.servers),
    };
  } catch { return empty; }
}
