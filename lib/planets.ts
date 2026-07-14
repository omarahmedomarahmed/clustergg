import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PROVIDERS } from "@/lib/providers/registry";
import { REGIONS, toRegion, type RegionStat, type RegionKey } from "@/lib/regions";
import { slimImg } from "@/lib/img";
import type { PlanetData } from "@/components/PlanetHero";

// Palette per skinned game for the interactive hero.
export const PLANET_PALETTE: Record<string, { accent: string; accent2: string }> = {
  "League of Legends": { accent: "#c89b3c", accent2: "#3b82f6" },
  "VALORANT": { accent: "#fd4556", accent2: "#22d3ee" },
};

// Interactive-hero data for every game that has a planet skin: region gamer
// counts + top gamers, from linked accounts mapped to macro-regions.
export async function buildSkinnedPlanets(db: Awaited<ReturnType<typeof getDb>>): Promise<PlanetData[]> {
  const skinned = await db.select().from(schema.games)
    .where(and(eq(schema.games.isActive, true), isNotNull(schema.games.planetImageUrl)));
  if (skinned.length === 0) return [];

  const names = skinned.map((g) => g.name);
  const spaceRows = await db.select({ slug: schema.spaces.slug, game: schema.spaces.game })
    .from(schema.spaces).where(and(eq(schema.spaces.isActive, true), inArray(schema.spaces.game, names)));
  const slugByGame = new Map(spaceRows.filter((s) => s.game).map((s) => [s.game as string, s.slug]));

  const providerToGame = new Map<string, string>();
  for (const g of skinned) for (const p of PROVIDERS.filter((pr) => pr.game === g.name)) providerToGame.set(p.id, g.name);
  const providerIds = [...providerToGame.keys()];

  const accountRows = providerIds.length
    ? await db.selectDistinct({
        provider: schema.linkedGameAccounts.provider,
        region: schema.linkedGameAccounts.region,
        country: schema.users.country,
        name: schema.users.displayName,
        slug: schema.users.slug,
      }).from(schema.linkedGameAccounts)
        .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
        .where(and(inArray(schema.linkedGameAccounts.provider, providerIds), eq(schema.users.status, "active")))
    : [];

  return skinned
    .filter((g) => slugByGame.has(g.name))
    .map((g) => {
      const stats: Record<RegionKey, RegionStat> = Object.fromEntries(
        REGIONS.map((r) => [r.key, { ...r, count: 0, gamers: [] as { name: string; slug: string }[] }]),
      ) as Record<RegionKey, RegionStat>;
      let total = 0;
      for (const a of accountRows) {
        if (providerToGame.get(a.provider) !== g.name) continue;
        const key = toRegion(a.region, a.country);
        if (!key) continue;
        total++;
        const s = stats[key];
        s.count++;
        if (s.gamers.length < 5 && !s.gamers.some((x) => x.slug === a.slug)) s.gamers.push({ name: a.name, slug: a.slug });
      }
      const pal = PLANET_PALETTE[g.name] ?? { accent: "#8b5cf6", accent2: "#22d3ee" };
      return {
        slug: slugByGame.get(g.name)!,
        name: g.name,
        accent: pal.accent,
        accent2: pal.accent2,
        imageUrl: g.planetImageUrl!,
        logoUrl: slimImg(g.logoUrl, 300000),
        coverUrl: slimImg(g.coverUrl, 400000),
        totalGamers: total,
        regions: REGIONS.map((r) => stats[r.key]),
      };
    });
}
