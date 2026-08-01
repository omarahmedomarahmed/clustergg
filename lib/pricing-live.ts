import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getContent } from "@/lib/cms";
import { PROVIDERS } from "@/lib/providers/registry";
import { buildPricing, type PricingConfig, PRICING_CMS_KEYS } from "@/lib/pricing";
import { networkStats, type NetworkStats } from "@/lib/network";

// What the pricing page is allowed to claim.
//
// A brand reading a rate card is going to ask two questions: how many places can
// my creative appear, and how many gamers are behind it. Both answers are read
// from production here rather than written into copy, so the page can never
// promise inventory we don't have.

export type SponsorGame = {
  slug: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  /** Verified gamers who have linked an account for this game. Counted, not modelled. */
  gamers: number;
  /** Live challenges on it right now. */
  challenges: number;
};

export type PricingLive = {
  cfg: PricingConfig;
  copy: Record<string, string>;
  network: NetworkStats;
  /** Distinct ad placements the platform serves — web and Discord. */
  placements: number;
  webPlacements: number;
  discordPlacements: number;
  games: SponsorGame[];
};

/**
 * The pricing config as staff have edited it.
 *
 * The cheap half of `pricingLive` for the many callers that need the numbers
 * but not the inventory — a report, a bill, a quote. Falls back to the defaults
 * rather than throwing, because a page that can't reach the CMS should still
 * price a challenge at $250 instead of at nothing.
 */
export async function pricingConfig(): Promise<PricingConfig> {
  try { return buildPricing(await getContent(PRICING_CMS_KEYS)); }
  catch { return buildPricing({}); }
}

export async function pricingLive(): Promise<PricingLive> {
  const copy = await getContent(PRICING_CMS_KEYS);
  const cfg = buildPricing(copy);
  const [network, placements, games] = await Promise.all([
    networkStats().catch((): NetworkStats => ({ servers: 0, reach: 0, gamers: 0, linked: 0, challenges: 0, games: 0 })),
    countPlacements(),
    sponsorGames(cfg.games),
  ]);
  return {
    cfg, copy, network, games,
    placements: placements.total,
    webPlacements: placements.web,
    discordPlacements: placements.discord,
  };
}

async function countPlacements(): Promise<{ total: number; web: number; discord: number }> {
  try {
    const db = await getDb();
    const rows = await db.select({ key: schema.adPlacements.key }).from(schema.adPlacements);
    // Discord placements are the ones the bot posts into servers; everything
    // else renders on the website. The split matters to a brand deciding whether
    // they're buying a website or a network of communities.
    const discord = rows.filter((r) => r.key.startsWith("discord_")).length;
    return { total: rows.length, web: rows.length - discord, discord };
  } catch { return { total: 0, web: 0, discord: 0 }; }
}

/**
 * The games a brand can actually sponsor.
 *
 * Which games are commercialised is a business decision, not a technical one —
 * the catalogue carries far more games than we run weekly challenges on. So an
 * admin names them in `pricing.gameSlugs`; with nothing set we fall back to the
 * active catalogue in its display order, capped at the configured count.
 */
export async function sponsorGames(limit: number): Promise<SponsorGame[]> {
  try {
    const db = await getDb();
    const c = await getContent(["pricing.gameSlugs"]);
    const wanted = (c["pricing.gameSlugs"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

    const all = await db.select({
      slug: schema.games.slug, name: schema.games.name,
      logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl,
      sortOrder: schema.games.sortOrder,
    }).from(schema.games).where(eq(schema.games.isActive, true)).orderBy(schema.games.sortOrder);

    const picked = wanted.length
      // Preserve the admin's order — the first game is the one the slider opens on.
      ? wanted.map((s) => all.find((g) => g.slug === s)).filter((g): g is typeof all[number] => Boolean(g))
      : all.slice(0, Math.max(1, limit));
    if (!picked.length) return [];

    const names = picked.map((g) => g.name);
    const providerIds = PROVIDERS.filter((p) => names.includes(p.game)).map((p) => p.id);

    const [accountRows, challengeRows] = await Promise.all([
      providerIds.length
        ? db.select({
            provider: schema.linkedGameAccounts.provider,
            n: sql<number>`count(distinct ${schema.linkedGameAccounts.userId})`,
          }).from(schema.linkedGameAccounts)
            .where(inArray(schema.linkedGameAccounts.provider, providerIds))
            .groupBy(schema.linkedGameAccounts.provider)
        : Promise.resolve([] as { provider: string; n: number }[]),
      db.select({ game: schema.challenges.game, n: sql<number>`count(*)` })
        .from(schema.challenges).where(eq(schema.challenges.status, "active"))
        .groupBy(schema.challenges.game),
    ]);

    const byProvider = new Map(accountRows.map((r) => [r.provider, Number(r.n ?? 0)]));
    const chByGame = new Map(challengeRows.map((r) => [r.game, Number(r.n ?? 0)]));

    return picked.map((g) => {
      // A game can be played through several providers (Chess is Chess.com AND
      // Lichess). Summing per-provider distinct counts can double-count someone
      // who linked both, which overstates the audience — so this is a ceiling,
      // and it is only ever shown as "gamers on this game", never as a unique
      // reach figure a brand would buy against.
      const ids = PROVIDERS.filter((p) => p.game === g.name).map((p) => p.id);
      const gamers = ids.reduce((sum, id) => sum + (byProvider.get(id) ?? 0), 0);
      return {
        slug: g.slug, name: g.name, logoUrl: g.logoUrl, coverUrl: g.coverUrl,
        gamers, challenges: chByGame.get(g.name) ?? 0,
      };
    });
  } catch { return []; }
}

/** The servers earning the most right now — social proof for the server pitch. */
export async function topEarningServers(limit = 3): Promise<{ name: string; slug: string | null; linked: number; members: number; iconUrl: string | null }[]> {
  try {
    const db = await getDb();
    const rows = await db.select({
      guildId: schema.discordGuilds.guildId,
      slug: schema.discordGuilds.slug,
      name: schema.discordGuilds.name,
      iconUrl: schema.discordGuilds.iconUrl,
      members: schema.discordGuilds.memberCount,
    }).from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active"))
      .orderBy(desc(schema.discordGuilds.memberCount)).limit(50);
    if (!rows.length) return [];
    const linkedRows = await db.select({
      guildId: schema.discordGuildMembers.guildId,
      n: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
    }).from(schema.discordGuildMembers).groupBy(schema.discordGuildMembers.guildId);
    const linkedBy = new Map(linkedRows.map((r) => [r.guildId, Number(r.n ?? 0)]));
    return rows
      .map((r) => ({ name: r.name || r.guildId, slug: r.slug, iconUrl: r.iconUrl, members: r.members ?? 0, linked: linkedBy.get(r.guildId) ?? 0 }))
      .sort((a, b) => b.linked - a.linked || b.members - a.members)
      .slice(0, limit);
  } catch { return []; }
}
