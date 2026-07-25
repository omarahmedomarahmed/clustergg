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

  const theme = (user.theme ?? {}) as { accent?: string; accent2?: string; bgImage?: string | null };
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
    votes: user.voteCount ?? 0,
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
    theme: {
      accent: theme.accent || BRAND.accent,
      accent2: theme.accent2 || BRAND.accent2,
      // The gamer's OWN art, in the order they'd expect to see it: the page
      // background they picked in the profile builder, then their banner, then
      // the platform default. A shared card should look like their profile.
      bgUrl: slimImg(theme.bgImage ?? null, 800000)
        || slimImg(user.bannerUrl, 800000)
        || bg.bgUrl,
      dim: bg.dim,
    },
  };
}

// One linked game's stats for a gamer — the same snapshot the public profile
// shows: rank and metrics, who they main, and how the last few games went.
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
    db.select({ logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl, planetBgUrl: schema.games.planetBgUrl, accent: schema.games.accent, accent2: schema.games.accent2 })
      .from(schema.games).where(eq(schema.games.name, p?.game ?? game)).limit(1),
    cardBg("bot_game"),
  ]);

  const rich = await richAccountBits(acc);
  const theme = (user.theme ?? {}) as { accent?: string; accent2?: string };

  return {
    kind: "game-stats",
    displayName: user.displayName,
    slug: user.slug,
    avatarUrl: slimImg(user.avatarUrl, 300000),
    game: p?.game ?? game,
    logoUrl: slimImg(g?.logoUrl ?? null, 300000),
    tag: acc.inGameName,
    region: acc.region,
    stats: stats.slice(0, 6).map((s) => ({
      label: caps.find((c) => c.key === s.metricKey)?.label ?? s.metricKey.replace(/_/g, " "),
      value: s.rankLabel ?? String(Math.round(s.metricValue * 100) / 100),
    })),
    rank: null,
    ...rich,
    theme: {
      accent: g?.accent || theme.accent || BRAND.accent,
      accent2: g?.accent2 || theme.accent2 || BRAND.accent2,
      bgUrl: slimImg(g?.planetBgUrl ?? g?.coverUrl ?? null, 800000) || bg.bgUrl,
      dim: bg.dim,
    },
  };
}

// Champions/heroes and recent matches, from whatever the provider persisted at
// sync time. Read from `providerData` rather than calling the game API live —
// a Discord interaction has three seconds, and a Riot round-trip does not fit.
async function richAccountBits(acc: typeof schema.linkedGameAccounts.$inferSelect): Promise<{
  champions?: { name: string; iconUrl?: string | null; level?: number; points?: number }[];
  matches?: { champion: string; iconUrl?: string | null; win: boolean; kda: string; queue?: string | null; when?: string | null }[];
  gameAvatarUrl?: string | null;
}> {
  const data = (acc.providerData ?? {}) as Record<string, unknown>;
  const out: Awaited<ReturnType<typeof richAccountBits>> = {};

  const gameAvatar = typeof data.gameAvatar === "string" ? data.gameAvatar : null;
  if (gameAvatar) out.gameAvatarUrl = slimImg(gameAvatar, 300000);

  // League persists mastery at sync. Other providers can populate the same
  // shapes under `champions` / `matches` and this picks them up for free.
  const champs = (data.lolChampions ?? data.champions) as unknown;
  if (Array.isArray(champs)) {
    out.champions = champs.slice(0, 5).map((c) => {
      const o = c as Record<string, unknown>;
      return {
        name: String(o.name ?? o.champion ?? ""),
        iconUrl: slimImg(typeof o.iconUrl === "string" ? o.iconUrl : null, 200000),
        level: Number(o.level ?? 0) || undefined,
        points: Number(o.points ?? 0) || undefined,
      };
    }).filter((c) => c.name);
  }

  const matches = data.matches as unknown;
  if (Array.isArray(matches)) {
    out.matches = matches.slice(0, 5).map((m) => {
      const o = m as Record<string, unknown>;
      return {
        champion: String(o.champion ?? ""),
        iconUrl: slimImg(typeof o.championIconUrl === "string" ? o.championIconUrl : (typeof o.iconUrl === "string" ? o.iconUrl : null), 200000),
        win: !!o.win,
        kda: String(o.kda ?? `${o.kills ?? 0}/${o.deaths ?? 0}/${o.assists ?? 0}`),
        queue: typeof o.queue === "string" ? o.queue : null,
        when: typeof o.gameEndMs === "number" ? relTime(o.gameEndMs) : null,
      };
    }).filter((m) => m.champion);
  }

  return out;
}

function relTime(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
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

// A game planet: what's live there right now.
export async function planetCard(game: string): Promise<CardData | null> {
  const db = await getDb();
  const [g] = await db.select().from(schema.games).where(eq(schema.games.name, game)).limit(1);
  if (!g) return null;

  const [challenges, ranked, bg] = await Promise.all([
    db.select({ id: schema.challenges.id }).from(schema.challenges)
      .where(and(eq(schema.challenges.game, game), eq(schema.challenges.status, "active"))),
    db.select({ id: schema.statCurrent.id }).from(schema.statCurrent).where(eq(schema.statCurrent.game, game)),
    cardBg("bot_planet"),
  ]);

  // Top gamer on the game's primary board — the social proof on the card.
  let topGamer: { name: string; value: string } | null = null;
  try {
    const [board] = await db.select().from(schema.leaderboards)
      .where(and(eq(schema.leaderboards.game, game), eq(schema.leaderboards.isActive, true))).limit(1);
    if (board) {
      const rows = await db.select({
        value: schema.statCurrent.metricValue, rankLabel: schema.statCurrent.rankLabel,
        name: schema.users.displayName,
      }).from(schema.statCurrent)
        .innerJoin(schema.linkedGameAccounts, eq(schema.statCurrent.linkedAccountId, schema.linkedGameAccounts.id))
        .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
        .where(and(eq(schema.statCurrent.game, game), eq(schema.statCurrent.metricKey, board.metricKey)));
      const sorted = [...rows].sort((a, b) => board.sortDir === "asc" ? a.value - b.value : b.value - a.value);
      if (sorted[0]) topGamer = { name: sorted[0].name, value: sorted[0].rankLabel ?? String(Math.round(sorted[0].value * 100) / 100) };
    }
  } catch { /* a card without a top gamer is still a good card */ }

  return {
    kind: "planet",
    game: g.name,
    logoUrl: slimImg(g.logoUrl, 300000),
    description: g.description || null,
    challenges: challenges.length,
    ranked: ranked.length,
    serverGamers: null,
    topGamer,
    theme: {
      accent: g.accent || BRAND.accent,
      accent2: g.accent2 || BRAND.accent2,
      bgUrl: slimImg(g.planetBgUrl ?? g.coverUrl, 800000) || bg.bgUrl,
      dim: bg.dim,
    },
  };
}

// Every game as a logo tile — what the START HERE button opens.
export async function planetsCard(): Promise<CardData | null> {
  const db = await getDb();
  const [games, bg] = await Promise.all([
    db.select({ name: schema.games.name, logoUrl: schema.games.logoUrl, accent: schema.games.accent })
      .from(schema.games).where(eq(schema.games.isActive, true)).orderBy(schema.games.sortOrder),
    cardBg("bot_planets"),
  ]);
  if (!games.length) return null;
  return {
    kind: "planets",
    title: "The Game Galaxy",
    subtitle: `${games.length} worlds · pick yours below`,
    games: games.slice(0, 12).map((g) => ({
      name: g.name,
      logoUrl: slimImg(g.logoUrl, 300000),
      accent: g.accent,
    })),
    theme: { ...BRAND, bgUrl: bg.bgUrl, dim: bg.dim },
  };
}

// One challenge, with its podium trophies and their dollar values.
export async function challengeCard(challengeId: string): Promise<CardData | null> {
  const db = await getDb();
  const [ch] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!ch) return null;

  const [participants, [g], bg] = await Promise.all([
    db.select({ id: schema.challengeParticipants.id }).from(schema.challengeParticipants)
      .where(eq(schema.challengeParticipants.challengeId, ch.id)),
    db.select({ logoUrl: schema.games.logoUrl, accent: schema.games.accent, accent2: schema.games.accent2 })
      .from(schema.games).where(eq(schema.games.name, ch.game)).limit(1),
    cardBg("bot_challenge"),
  ]);

  // Podium prizes are trophy-id lists per place; resolve them to art + value.
  const prizes = ch.prizes ?? {};
  const wanted: { id: string; place: number }[] = [
    ...(prizes.first ?? []).map((id) => ({ id, place: 1 })),
    ...(prizes.second ?? []).map((id) => ({ id, place: 2 })),
    ...(prizes.third ?? []).map((id) => ({ id, place: 3 })),
  ];
  let trophies: { name: string; imageUrl: string; value: number; place: number }[] = [];
  if (wanted.length) {
    const rows = await db.select().from(schema.trophies)
      .where(inArray(schema.trophies.id, wanted.map((w) => w.id)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    trophies = wanted
      .map((w) => {
        const t = byId.get(w.id);
        return t ? { name: t.name, imageUrl: slimImg(t.imageUrl, 300000) ?? "", value: t.value ?? 0, place: w.place } : null;
      })
      .filter((t): t is NonNullable<typeof t> => !!t && !!t.imageUrl)
      .slice(0, 3);
  }

  // Live standings turn a poster into a scoreboard — the reason to keep
  // re-opening the card while a challenge is running.
  const { challengeStandings } = await import("@/lib/challenges");
  const standings = await challengeStandings(ch.id, 5).catch(() => []);

  let serverName: string | null = null;
  if (ch.guildId) {
    const [guild] = await db.select({ name: schema.discordGuilds.name })
      .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, ch.guildId)).limit(1);
    serverName = guild?.name || null;
  }

  return {
    kind: "challenge",
    title: ch.title,
    game: ch.game,
    logoUrl: slimImg(g?.logoUrl ?? null, 300000),
    description: ch.description || null,
    startsAt: ch.startAt.toISOString(),
    endsAt: ch.endAt.toISOString(),
    ended: ch.status === "completed",
    participants: participants.length,
    prize: ch.prizeDescription || null,
    isPrivate: ch.visibility === "private" && !!ch.accessKey,
    serverName,
    standings: standings.map((s) => ({ place: s.place, name: s.displayName, points: s.points })),
    trophies,
    theme: {
      accent: g?.accent || BRAND.accent,
      accent2: g?.accent2 || BRAND.accent2,
      bgUrl: slimImg(ch.coverUrl ?? ch.heroUrl, 800000) || bg.bgUrl,
      dim: bg.dim,
    },
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
