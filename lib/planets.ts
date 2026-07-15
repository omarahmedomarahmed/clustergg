import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PROVIDERS } from "@/lib/providers/registry";
import { REGIONS, toRegion, prettyRegion, REGION_PALETTE, type RegionStat, type RegionKey } from "@/lib/regions";
import { slimImg } from "@/lib/img";
import type { PlanetData } from "@/components/PlanetHero";

export type PinMap = Record<string, { x: number; y: number; color: string; label: string }>;
type RegionRow = { region: string | null; name: string; slug: string };

// Build globe regions from the REAL server/region codes providers return
// (account.region), so pins map to actual game servers (EUW1, NA1, KR, …) — not
// generic macro-regions. Positions come from the admin's saved pins; unplaced
// servers are auto-spread around the globe so they're immediately draggable.
export function computeRealRegions(rows: RegionRow[], pins: PinMap): RegionStat[] {
  const byCode = new Map<string, { count: number; gamers: { name: string; slug: string }[] }>();
  for (const a of rows) {
    const code = (a.region ?? "").trim().toLowerCase();
    if (!code) continue;
    let e = byCode.get(code);
    if (!e) { e = { count: 0, gamers: [] }; byCode.set(code, e); }
    e.count++;
    if (e.gamers.length < 5 && !e.gamers.some((x) => x.slug === a.slug)) e.gamers.push({ name: a.name, slug: a.slug });
  }
  // Include any admin-placed pins even if they currently have no gamers.
  for (const code of Object.keys(pins)) if (!byCode.has(code)) byCode.set(code, { count: 0, gamers: [] });

  const codes = [...byCode.keys()];
  const n = codes.length;
  return codes.map((code, i) => {
    const pin = pins[code];
    const angle = (i / Math.max(1, n)) * Math.PI * 2;
    const dx = Math.round(50 + Math.cos(angle) * 26);
    const dy = Math.round(46 + Math.sin(angle) * 26);
    const e = byCode.get(code)!;
    return {
      key: code,
      label: pin?.label || prettyRegion(code),
      short: (pin?.label || code).toUpperCase().slice(0, 5),
      color: pin?.color || REGION_PALETTE[i % REGION_PALETTE.length],
      x: pin?.x ?? dx,
      y: pin?.y ?? dy,
      count: e.count,
      gamers: e.gamers,
    };
  }).sort((a, b) => b.count - a.count);
}

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
      const pins = (g.planetPins ?? {}) as PinMap;
      const gameRows = accountRows.filter((a) => providerToGame.get(a.provider) === g.name);

      // Prefer real API server-regions from account data. Fall back to the
      // macro-regions only when no linked accounts carry a region code yet.
      let regions = computeRealRegions(gameRows, pins);
      if (regions.length === 0) {
        const stats = Object.fromEntries(REGIONS.map((r) => {
          const pin = pins[r.key];
          return [r.key, { ...r, x: pin?.x ?? r.x, y: pin?.y ?? r.y, color: pin?.color || r.color, label: pin?.label || r.label, count: 0, gamers: [] as { name: string; slug: string }[] }];
        })) as Record<RegionKey, RegionStat>;
        for (const a of gameRows) {
          const key = toRegion(a.region, a.country);
          if (!key) continue;
          const s = stats[key];
          s.count++;
          if (s.gamers.length < 5 && !s.gamers.some((x) => x.slug === a.slug)) s.gamers.push({ name: a.name, slug: a.slug });
        }
        regions = REGIONS.map((r) => stats[r.key]);
      }
      const total = regions.reduce((sum, r) => sum + r.count, 0);
      const pal = PLANET_PALETTE[g.name] ?? { accent: "#8b5cf6", accent2: "#22d3ee" };
      return {
        slug: slugByGame.get(g.name)!,
        name: g.name,
        accent: pal.accent,
        accent2: pal.accent2,
        imageUrl: g.planetImageUrl!,
        logoUrl: slimImg(g.logoUrl, 300000),
        coverUrl: slimImg(g.coverUrl, 400000),
        bgUrl: g.planetBgUrl,
        totalGamers: total,
        regions,
      };
    });
}
