import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import { PROVIDERS } from "@/lib/providers/registry";
import { gameAvatarOf, championsOf } from "@/lib/game-identity";
import { toRegion, REGIONS } from "@/lib/regions";

// Everything the planet-explorer hero needs for one planet, in one call:
// game leaderboards (with entries), auto-derived champion mastery boards,
// active challenges + their top standings, and players bucketed by region —
// every gamer carrying their game-specific avatar. Structured so ANY game can
// fill it; modules with no data are simply returned empty and hidden by the UI.

export type ExploreEntry = { rank: number; slug: string; name: string; avatar: string | null; accountId: string | null; provider: string | null; value: number; rankLabel: string | null };
export type ExploreBoard = { metricKey: string; title: string; unit: string | null; sortDir: string; entries: ExploreEntry[] };
export type ChampBoard = { championId: number; ddId: string; name: string; iconUrl: string; splashUrl: string; entries: { rank: number; slug: string; name: string; avatar: string | null; accountId: string; points: number; level: number }[] };
export type ExploreChallenge = { id: string; title: string; coverUrl: string | null; endAt: string; status: string; top: { slug: string; name: string; avatar: string | null; points: number }[] };
export type ExploreRegion = { key: string; label: string; short: string; color: string; count: number; gamers: { slug: string; name: string; avatar: string | null; ign: string }[] };
export type PlanetExplore = {
  slug: string; name: string; game: string | null; hasChampions: boolean;
  boards: ExploreBoard[]; championBoards: ChampBoard[]; challenges: ExploreChallenge[]; regions: ExploreRegion[];
};

const splashUrl = (ddId: string) => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${ddId}_0.jpg`;

export async function getPlanetExplore(db: DB, slug: string): Promise<PlanetExplore | null> {
  const [space] = await db.select().from(schema.spaces).where(eq(schema.spaces.slug, slug)).limit(1);
  if (!space) return null;
  const game = space.game ?? null;
  const providerIds = game ? PROVIDERS.filter((p) => p.game === game).map((p) => p.id) : [];

  // All connected accounts for this game (base for avatars, regions, champions).
  const accounts = providerIds.length
    ? await db.select({
        id: schema.linkedGameAccounts.id, provider: schema.linkedGameAccounts.provider,
        region: schema.linkedGameAccounts.region, providerData: schema.linkedGameAccounts.providerData,
        ign: schema.linkedGameAccounts.inGameName,
        slug: schema.users.slug, name: schema.users.displayName, avatarUrl: schema.users.avatarUrl,
      })
        .from(schema.linkedGameAccounts)
        .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
        .where(and(inArray(schema.linkedGameAccounts.provider, providerIds), eq(schema.users.status, "active")))
    : [];
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const gameAvatar = (a: typeof accounts[number]) => gameAvatarOf(a.providerData) ?? a.avatarUrl ?? null;

  // ---- Leaderboards (one per metric we track for this game) ----
  const boardDefs = game
    ? await db.select().from(schema.leaderboards).where(and(eq(schema.leaderboards.game, game), eq(schema.leaderboards.isActive, true)))
    : [];
  const metricKeys = boardDefs.map((b) => b.metricKey);
  const statRows = game && metricKeys.length
    ? await db.select({ accountId: schema.statCurrent.linkedAccountId, metricKey: schema.statCurrent.metricKey, value: schema.statCurrent.metricValue, rankLabel: schema.statCurrent.rankLabel })
        .from(schema.statCurrent)
        .where(and(eq(schema.statCurrent.game, game), inArray(schema.statCurrent.metricKey, metricKeys)))
    : [];
  const byMetric = new Map<string, typeof statRows>();
  for (const r of statRows) { if (!byMetric.has(r.metricKey)) byMetric.set(r.metricKey, []); byMetric.get(r.metricKey)!.push(r); }
  const boards: ExploreBoard[] = boardDefs.map((b) => {
    const rows = (byMetric.get(b.metricKey) ?? []).slice();
    rows.sort((x, y) => b.sortDir === "asc" ? x.value - y.value : y.value - x.value);
    const entries: ExploreEntry[] = rows.slice(0, 15).map((r, i) => {
      const a = accById.get(r.accountId);
      return { rank: i + 1, slug: a?.slug ?? "", name: a?.name ?? "Gamer", avatar: a ? gameAvatar(a) : null, accountId: r.accountId, provider: a?.provider ?? null, value: r.value, rankLabel: r.rankLabel };
    }).filter((e) => e.slug);
    return { metricKey: b.metricKey, title: b.title, unit: b.unit ?? null, sortDir: b.sortDir, entries };
  }).filter((b) => b.entries.length > 0);

  // ---- Champion mastery boards (auto-derived from connected accounts) ----
  const champMap = new Map<number, { ddId: string; name: string; iconUrl: string; rows: { slug: string; name: string; avatar: string | null; accountId: string; points: number; level: number }[] }>();
  for (const a of accounts) {
    for (const ch of championsOf(a.providerData)) {
      if (!champMap.has(ch.championId)) champMap.set(ch.championId, { ddId: ch.ddId, name: ch.name, iconUrl: ch.iconUrl, rows: [] });
      champMap.get(ch.championId)!.rows.push({ slug: a.slug, name: a.name, avatar: gameAvatar(a), accountId: a.id, points: ch.points, level: ch.level });
    }
  }
  const championBoards: ChampBoard[] = [...champMap.entries()].map(([championId, v]) => ({
    championId, ddId: v.ddId, name: v.name, iconUrl: v.iconUrl, splashUrl: splashUrl(v.ddId),
    entries: v.rows.sort((x, y) => y.points - x.points).slice(0, 15).map((r, i) => ({ rank: i + 1, ...r })),
  })).sort((x, y) => (y.entries[0]?.points ?? 0) - (x.entries[0]?.points ?? 0));

  // ---- Active/recent challenges + their top standings ----
  const challengeRows = await db.select().from(schema.challenges)
    .where(and(eq(schema.challenges.spaceId, space.id), inArray(schema.challenges.status, ["active", "completed"])))
    .orderBy(desc(schema.challenges.startAt)).limit(6);
  const chIds = challengeRows.map((c) => c.id);
  const parts = chIds.length
    ? await db.select({ challengeId: schema.challengeParticipants.challengeId, points: schema.challengeParticipants.currentPoints, name: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl })
        .from(schema.challengeParticipants)
        .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
        .where(and(inArray(schema.challengeParticipants.challengeId, chIds), eq(schema.challengeParticipants.status, "active")))
        .orderBy(desc(schema.challengeParticipants.currentPoints)).limit(200)
    : [];
  const topByCh = new Map<string, ExploreChallenge["top"]>();
  const acctBySlug = new Map(accounts.map((a) => [a.slug, a]));
  for (const p of parts) {
    const arr = topByCh.get(p.challengeId) ?? [];
    if (arr.length < 5) { const a = acctBySlug.get(p.slug); arr.push({ slug: p.slug, name: p.name, avatar: a ? gameAvatar(a) : p.avatarUrl, points: p.points }); topByCh.set(p.challengeId, arr); }
  }
  const challenges: ExploreChallenge[] = challengeRows.map((c) => ({
    id: c.id, title: c.title, coverUrl: c.coverUrl, endAt: c.endAt.toISOString(), status: c.status, top: topByCh.get(c.id) ?? [],
  }));

  // ---- Players by region (game-specific avatars) ----
  const regionMap = new Map<string, ExploreRegion>();
  for (const r of REGIONS) regionMap.set(r.key, { key: r.key, label: r.label, short: r.short, color: r.color, count: 0, gamers: [] });
  const seen = new Set<string>();
  for (const a of accounts) {
    const rk = toRegion(a.region, null);
    if (!rk) continue;
    const reg = regionMap.get(rk)!;
    reg.count++;
    if (!seen.has(a.slug) && reg.gamers.length < 8) { seen.add(a.slug); reg.gamers.push({ slug: a.slug, name: a.name, avatar: gameAvatar(a), ign: a.ign }); }
  }
  const regions = [...regionMap.values()];

  return { slug: space.slug, name: space.name, game, hasChampions: championBoards.length > 0, boards, championBoards, challenges, regions };
}
