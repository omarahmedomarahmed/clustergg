import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getProvider } from "@/lib/providers/registry";
import { getUserQuests, getTotalCp } from "@/lib/quests";
import { levelFromCp } from "@/lib/level";
import { getContent } from "@/lib/cms";
import { buildCardBgMap, cardBgCmsKeys } from "@/lib/card-bg";
import { slimImg } from "@/lib/img";
import type { CardData, CardTheme } from "@/lib/cards/types";

// Server-side loaders that turn platform data into card payloads. Shared by the
// card API route and (later) the Discord bot screens, so a card looks identical
// wherever it is rendered.

const BRAND: CardTheme = { accent: "#8b5cf6", accent2: "#22d3ee" };

// Admin-controlled background art for a bot/card surface, from the existing
// Card-backgrounds editor (Admin → Card backgrounds).
export async function cardBg(type: string): Promise<{ bgUrl: string | null; dim: number }> {
  try {
    const map = buildCardBgMap(await getContent(cardBgCmsKeys));
    const e = map[type];
    return { bgUrl: e?.url || null, dim: e?.dim ?? 62 };
  } catch { return { bgUrl: null, dim: 62 }; }
}

// A gamer's full profile snapshot.
export async function profileCard(slug: string): Promise<CardData | null> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user) return null;

  const [accounts, totalCp, bg] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    getTotalCp(db, user.id),
    cardBg("bot_profile"),
  ]);

  // Headline stat per account (first tracked metric) for a richer card.
  const accIds = accounts.map((a) => a.id);
  const stats = accIds.length
    ? await db.select().from(schema.statCurrent).where(inArray(schema.statCurrent.linkedAccountId, accIds))
    : [];
  const games = accounts.length
    ? await db.select({ name: schema.games.name, logoUrl: schema.games.logoUrl }).from(schema.games)
    : [];
  const logoByGame = new Map(games.map((g) => [g.name, g.logoUrl]));

  const theme = (user.theme ?? {}) as { accent?: string; accent2?: string };
  return {
    kind: "profile",
    displayName: user.displayName,
    slug: user.slug,
    avatarUrl: slimImg(user.avatarUrl, 300000),
    title: user.title,
    country: user.country,
    totalCp,
    level: levelFromCp(totalCp).level,
    views: user.profileViews ?? 0,
    votes: 0, // wired to profile_votes in the identity phase
    award: null,
    accounts: accounts.map((a) => {
      const p = getProvider(a.provider);
      const game = p?.game ?? a.provider;
      const s = stats.find((x) => x.linkedAccountId === a.id);
      return {
        game,
        logoUrl: slimImg(logoByGame.get(game) ?? null, 300000),
        tag: a.inGameName,
        headline: s ? (s.rankLabel ?? `${s.metricKey.replace(/_/g, " ")}: ${s.metricValue}`) : game,
      };
    }),
    theme: { accent: theme.accent || BRAND.accent, accent2: theme.accent2 || BRAND.accent2, bgUrl: slimImg(user.bannerUrl, 800000) || bg.bgUrl, dim: bg.dim },
  };
}

// One linked game's stats for a gamer.
export async function gameStatsCard(slug: string, game: string): Promise<CardData | null> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user) return null;
  const accounts = await db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id));
  const acc = accounts.find((a) => (getProvider(a.provider)?.game ?? "").toLowerCase() === game.toLowerCase());
  if (!acc) return null;

  const p = getProvider(acc.provider);
  const caps = p?.capabilities ?? [];
  const [stats, [g], bg] = await Promise.all([
    db.select().from(schema.statCurrent).where(eq(schema.statCurrent.linkedAccountId, acc.id)),
    db.select({ logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl, planetBgUrl: schema.games.planetBgUrl })
      .from(schema.games).where(eq(schema.games.name, p?.game ?? game)).limit(1),
    cardBg("bot_game"),
  ]);

  return {
    kind: "game-stats",
    displayName: user.displayName,
    game: p?.game ?? game,
    logoUrl: slimImg(g?.logoUrl ?? null, 300000),
    tag: acc.inGameName,
    region: acc.region,
    stats: stats.slice(0, 6).map((s) => ({
      label: caps.find((c) => c.key === s.metricKey)?.label ?? s.metricKey.replace(/_/g, " "),
      value: s.rankLabel ?? String(Math.round(s.metricValue * 100) / 100),
    })),
    rank: null,
    theme: { ...BRAND, bgUrl: slimImg(g?.planetBgUrl ?? g?.coverUrl ?? null, 800000) || bg.bgUrl, dim: bg.dim },
  };
}

// A quest's progress for a gamer (or the quest itself when signed out).
export async function questCard(slug: string | null, questKey: string): Promise<CardData | null> {
  const db = await getDb();
  const user = slug ? (await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1))[0] : null;
  const quests = await getUserQuests(db, user?.id ?? null);
  const q = quests.find((x) => x.key.toLowerCase() === questKey.toLowerCase() || x.name.toLowerCase() === questKey.toLowerCase());
  if (!q) return null;
  const bg = await cardBg("bot_quest");
  return {
    kind: "quest",
    displayName: user?.displayName ?? null,
    questName: q.name,
    tagline: q.tagline,
    logoUrl: slimImg(q.logoUrl, 300000),
    cp: q.qp,
    nextThreshold: q.nextTier?.thresholdQp ?? null,
    currentTier: q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].name : null,
    nextTier: q.nextTier?.name ?? null,
    tiers: q.tiers.map((t) => ({ name: t.name, threshold: t.thresholdQp, earned: t.earned })),
    theme: { accent: q.color, accent2: q.accent2, bgUrl: slimImg(q.cardBgUrl ?? q.mapArtUrl, 800000) || bg.bgUrl, dim: bg.dim },
  };
}

// All quests + CP totals for a gamer.
export async function cpSummaryCard(slug: string): Promise<CardData | null> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user) return null;
  const [quests, totalCp, bg] = await Promise.all([
    getUserQuests(db, user.id), getTotalCp(db, user.id), cardBg("bot_quest"),
  ]);
  return {
    kind: "cp-summary",
    displayName: user.displayName,
    totalCp,
    level: levelFromCp(totalCp).level,
    quests: quests.slice(0, 4).map((q) => ({
      name: q.name,
      cp: q.qp,
      target: q.nextTier?.thresholdQp ?? q.tiers[q.tiers.length - 1]?.thresholdQp ?? 1,
      tier: q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].name : "Just starting",
      accent: q.color,
    })),
    theme: { ...BRAND, bgUrl: bg.bgUrl, dim: bg.dim },
  };
}

// A game's leaderboard (top N).
export async function leaderboardCard(game: string, metricKey?: string | null): Promise<CardData | null> {
  const db = await getDb();
  const boards = await db.select().from(schema.leaderboards)
    .where(and(eq(schema.leaderboards.game, game), eq(schema.leaderboards.isActive, true)));
  const board = metricKey ? boards.find((b) => b.metricKey === metricKey) : boards[0];
  if (!board) return null;

  const rows = await db.select({
    value: schema.statCurrent.metricValue, rankLabel: schema.statCurrent.rankLabel,
    name: schema.users.displayName, avatarUrl: schema.users.avatarUrl,
  }).from(schema.statCurrent)
    .innerJoin(schema.linkedGameAccounts, eq(schema.statCurrent.linkedAccountId, schema.linkedGameAccounts.id))
    .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
    .where(and(eq(schema.statCurrent.game, game), eq(schema.statCurrent.metricKey, board.metricKey)))
    .orderBy(board.sortDir === "asc" ? schema.statCurrent.metricValue : schema.statCurrent.metricValue)
    .limit(8);

  const sorted = [...rows].sort((a, b) => board.sortDir === "asc" ? a.value - b.value : b.value - a.value);
  const [g, bg] = await Promise.all([
    db.select({ logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl }).from(schema.games).where(eq(schema.games.name, game)).limit(1),
    cardBg("bot_leaderboard"),
  ]);

  return {
    kind: "leaderboard",
    title: board.title,
    game,
    logoUrl: slimImg(g[0]?.logoUrl ?? null, 300000),
    subtitle: `${game} · live standings`,
    rows: sorted.map((r, i) => ({
      rank: i + 1, name: r.name,
      value: r.rankLabel ?? String(Math.round(r.value * 100) / 100),
      avatarUrl: slimImg(r.avatarUrl, 200000),
    })),
    theme: { ...BRAND, bgUrl: slimImg(g[0]?.coverUrl ?? null, 800000) || bg.bgUrl, dim: bg.dim },
  };
}
