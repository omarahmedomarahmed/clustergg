import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getProvider, PROVIDERS } from "@/lib/providers/registry";
import { getUserQuests, getTotalCp } from "@/lib/quests";
import { levelFromCp } from "@/lib/level";
import { getContent } from "@/lib/cms";
import { buildCardBgMap, cardBgCmsKeys } from "@/lib/card-bg";
import type { CardData, CardTheme } from "@/lib/cards/types";

// Server-side loaders that turn platform data into card payloads. Shared by the
// card API route and (later) the Discord bot screens, so a card looks identical
// wherever it is rendered.

const BRAND: CardTheme = { accent: "#8b5cf6", accent2: "#22d3ee" };

// Admin-controlled background art for a bot/card surface, from the existing
// Card-backgrounds editor (Admin → Card backgrounds).
//
// Only the art. How dark the veil over it sits is part of the card's LAYOUT
// (Admin → Card layouts), not part of the image — one number, edited in the one
// place that shows you the result, instead of two that quietly disagree.
export async function cardBg(type: string): Promise<{ bgUrl: string | null }> {
  try {
    const map = buildCardBgMap(await getContent(cardBgCmsKeys));
    return { bgUrl: map[type]?.url || null };
  } catch { return { bgUrl: null }; }
}

// A gamer's full profile snapshot.
export async function profileCard(slug: string): Promise<CardData | null> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user) return null;

  const [accounts, totalCp, bg, won, entered] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    getTotalCp(db, user.id),
    cardBg("bot_profile"),
    // Trophies they hold, newest first. A redeemed trophy still counts as won —
    // cashing out a prize isn't the same as never having earned it.
    db.select({ name: schema.trophies.name, imageUrl: schema.trophies.imageUrl, awardedAt: schema.userTrophies.awardedAt })
      .from(schema.userTrophies)
      .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
      .where(eq(schema.userTrophies.userId, user.id)),
    db.select({
      title: schema.challenges.title,
      status: schema.challenges.status,
      points: schema.challengeParticipants.currentPoints,
      place: schema.challengeParticipants.finalPlacement,
      joinedAt: schema.challengeParticipants.joinedAt,
    })
      .from(schema.challengeParticipants)
      .innerJoin(schema.challenges, eq(schema.challengeParticipants.challengeId, schema.challenges.id))
      .where(eq(schema.challengeParticipants.userId, user.id)),
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

  // A live challenge outranks a finished one whatever the score: the card is
  // an invitation, and only a live one can be joined.
  const challenges = [...entered]
    .sort((a, b) => {
      const live = Number(b.status === "active") - Number(a.status === "active");
      return live !== 0 ? live : b.joinedAt.getTime() - a.joinedAt.getTime();
    })
    .map((c) => ({ title: c.title, live: c.status === "active", points: c.points, place: c.place }));

  return {
    kind: "profile",
    displayName: user.displayName,
    slug: user.slug,
    avatarUrl: user.avatarUrl,
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
        logoUrl: logoByGame.get(game) ?? null,
        tag: a.inGameName,
        headline: s ? (s.rankLabel ?? `${s.metricKey.replace(/_/g, " ")}: ${s.metricValue}`) : game,
      };
    }),
    trophies: [...won]
      .sort((a, b) => b.awardedAt.getTime() - a.awardedAt.getTime())
      .map((t) => ({ name: t.name, imageUrl: t.imageUrl })),
    trophyCount: won.length,
    challenges,
    theme: {
      accent: theme.accent || BRAND.accent,
      accent2: theme.accent2 || BRAND.accent2,
      // The gamer's OWN art, in the order they'd expect to see it: the page
      // background they picked in the profile builder, then their banner, then
      // the platform default. A shared card should look like their profile.
      //
      // Deliberately NOT run through `slimImg`. That guard exists to keep
      // megabyte data URLs out of page HTML, and a real uploaded background is
      // 2-10 MB — so it silently discarded the art of every gamer who had
      // actually customised their profile, which is exactly the group whose
      // card is worth sharing. The renderer decodes and downscales this to the
      // 1200px the card uses, so size is its problem to solve, not ours.
      bgUrl: theme.bgImage || user.bannerUrl || bg.bgUrl,
      // If their own upload can't be fetched (slow host, dead Blob URL), the
      // card falls back down this list rather than rendering bare.
      bgFallbacks: [user.bannerUrl, bg.bgUrl],
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
    avatarUrl: user.avatarUrl,
    game: p?.game ?? game,
    logoUrl: g?.logoUrl ?? null,
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
      bgUrl: g?.planetBgUrl || g?.coverUrl || bg.bgUrl,
      bgFallbacks: [g?.coverUrl, bg.bgUrl],
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
  if (gameAvatar) out.gameAvatarUrl = gameAvatar;

  // League persists mastery at sync. Other providers can populate the same
  // shapes under `champions` / `matches` and this picks them up for free.
  const champs = (data.lolChampions ?? data.champions) as unknown;
  if (Array.isArray(champs)) {
    out.champions = champs.slice(0, 5).map((c) => {
      const o = c as Record<string, unknown>;
      return {
        name: String(o.name ?? o.champion ?? ""),
        iconUrl: typeof o.iconUrl === "string" ? o.iconUrl : null,
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
        iconUrl: typeof o.championIconUrl === "string" ? o.championIconUrl : (typeof o.iconUrl === "string" ? o.iconUrl : null),
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
    logoUrl: q.logoUrl,
    cp: q.qp,
    nextThreshold: q.nextTier?.thresholdQp ?? null,
    currentTier: q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].name : null,
    nextTier: q.nextTier?.name ?? null,
    tiers: q.tiers.map((t) => ({ name: t.name, threshold: t.thresholdQp, earned: t.earned })),
    theme: { accent: q.color, accent2: q.accent2, bgUrl: q.cardBgUrl || q.mapArtUrl || bg.bgUrl, bgFallbacks: [q.mapArtUrl, bg.bgUrl] },
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
    theme: { ...BRAND, bgUrl: bg.bgUrl },
  };
}

// A game planet: what's live there right now.
export async function planetCard(game: string): Promise<CardData | null> {
  const db = await getDb();
  const [g] = await db.select().from(schema.games).where(eq(schema.games.name, game)).limit(1);
  if (!g) return null;

  // A game is played through one or more providers (Chess is Chess.com AND
  // Lichess), and a linked account records the provider, not the game.
  const providerIds = PROVIDERS.filter((p) => p.game === g.name).map((p) => p.id);

  const [live, accounts, boardRows, bg] = await Promise.all([
    // The actual challenges, not a count of them — soonest deadline first,
    // because the one closing tonight is the one worth entering now.
    db.select({
      id: schema.challenges.id, title: schema.challenges.title, endAt: schema.challenges.endAt,
      prizes: schema.challenges.prizes, prizeDescription: schema.challenges.prizeDescription,
    }).from(schema.challenges)
      .where(and(eq(schema.challenges.game, game), eq(schema.challenges.status, "active")))
      .orderBy(schema.challenges.endAt).limit(6),
    // Distinct gamers. The old number counted rows in stat_current — one per
    // metric per account — so a game tracking six metrics reported six times
    // the players it had.
    providerIds.length
      ? db.selectDistinct({ userId: schema.linkedGameAccounts.userId })
          .from(schema.linkedGameAccounts).where(inArray(schema.linkedGameAccounts.provider, providerIds))
      : Promise.resolve([] as { userId: string }[]),
    db.select().from(schema.leaderboards)
      .where(and(eq(schema.leaderboards.game, game), eq(schema.leaderboards.isActive, true)))
      .limit(4),
    cardBg("bot_planet"),
  ]);

  const entrants = await Promise.all(live.map(async (c) => {
    try {
      const rows = await db.select({ id: schema.challengeParticipants.id })
        .from(schema.challengeParticipants).where(eq(schema.challengeParticipants.challengeId, c.id));
      return rows.length;
    } catch { return 0; }
  }));

  // What first place is worth, resolved in one query across every challenge on
  // the card rather than one per challenge.
  const firstTrophyIds = [...new Set(live.flatMap((c) => c.prizes?.first ?? []))];
  let valueOf = new Map<string, number>();
  if (firstTrophyIds.length) {
    try {
      const rows = await db.select({ id: schema.trophies.id, value: schema.trophies.value })
        .from(schema.trophies).where(inArray(schema.trophies.id, firstTrophyIds));
      valueOf = new Map(rows.map((r) => [r.id, Number(r.value)]));
    } catch { /* a challenge with no priced prize just shows no prize */ }
  }
  const prizeOf = (c: (typeof live)[number]): string | null => {
    if (c.prizeDescription?.trim()) return c.prizeDescription.trim();
    const total = (c.prizes?.first ?? []).reduce((n, id) => n + (valueOf.get(id) ?? 0), 0);
    return total > 0 ? `$${Math.round(total).toLocaleString()}` : null;
  };

  // Every board this game runs, each with whoever currently leads it. A board
  // with no name on it is still worth listing — it's a board you could top.
  const boards = await Promise.all(boardRows.map(async (board) => {
    let leader: string | null = null;
    let value: string | null = null;
    let entries = 0;
    try {
      const rows = await db.select({
        value: schema.statCurrent.metricValue, rankLabel: schema.statCurrent.rankLabel,
        name: schema.users.displayName,
      }).from(schema.statCurrent)
        .innerJoin(schema.linkedGameAccounts, eq(schema.statCurrent.linkedAccountId, schema.linkedGameAccounts.id))
        .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
        .where(and(eq(schema.statCurrent.game, game), eq(schema.statCurrent.metricKey, board.metricKey)));
      entries = rows.length;
      const sorted = [...rows].sort((a, b) => board.sortDir === "asc" ? a.value - b.value : b.value - a.value);
      if (sorted[0]) {
        leader = sorted[0].name;
        value = sorted[0].rankLabel ?? String(Math.round(sorted[0].value * 100) / 100);
      }
    } catch { /* a board we can't read is still a board that exists */ }
    return { title: board.title, leader, value, entries };
  }));

  return {
    kind: "planet",
    game: g.name,
    logoUrl: g.logoUrl,
    description: g.description || null,
    challenges: live.map((c, i) => ({
      title: c.title,
      endsAt: c.endAt.toISOString(),
      participants: entrants[i],
      prize: prizeOf(c),
    })),
    boards,
    gamers: accounts.length,
    serverGamers: null,
    theme: {
      accent: g.accent || BRAND.accent,
      accent2: g.accent2 || BRAND.accent2,
      bgUrl: g.planetBgUrl || g.coverUrl || bg.bgUrl,
      bgFallbacks: [g.coverUrl, bg.bgUrl],
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
      logoUrl: g.logoUrl,
      accent: g.accent,
    })),
    theme: { ...BRAND, bgUrl: bg.bgUrl },
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
        return t ? { name: t.name, imageUrl: t.imageUrl ?? "", value: t.value ?? 0, place: w.place } : null;
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
    logoUrl: g?.logoUrl ?? null,
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
      bgUrl: ch.coverUrl || ch.heroUrl || bg.bgUrl,
      bgFallbacks: [ch.heroUrl, bg.bgUrl],
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
    logoUrl: g[0]?.logoUrl ?? null,
    subtitle: `${game} · live standings`,
    rows: sorted.map((r, i) => ({
      rank: i + 1, name: r.name,
      value: r.rankLabel ?? String(Math.round(r.value * 100) / 100),
      avatarUrl: r.avatarUrl,
    })),
    theme: { ...BRAND, bgUrl: g[0]?.coverUrl || bg.bgUrl, bgFallbacks: [bg.bgUrl] },
  };
}

// Profile of the Week, as a card the bot can post.
//
// `mode` decides which story it tells. During the week it's the race — the
// standings and the clock. Once a week is called it's the result, and the
// placements carry the trophy each of them was actually handed, because a
// podium that doesn't show the prize is just a list of names.
export async function weekCard(opts: { weekKey?: string; mode?: "race" | "result" } = {}): Promise<CardData | null> {
  const { weekBoard, currentWeek } = await import("@/lib/profile-week");
  const week = opts.weekKey ? undefined : await currentWeek();
  const board = await weekBoard({ weekKey: opts.weekKey ?? week?.key, limit: 6 });
  const bg = await cardBg("bot_week");

  const called = !!board.result?.podium.length;
  const mode = opts.mode ?? (called && board.week.phase === "announcement" ? "result" : "race");

  const db = await getDb();
  const running = board.entries.filter((e) => !e.disqualified);
  const totalVotes = running.reduce((n, e) => n + e.weekVotes, 0);

  // Avatars, so the card shows people rather than rows of text.
  const names = mode === "result"
    ? (board.result?.podium ?? []).map((p) => p.slug)
    : running.slice(0, 4).map((e) => e.slug);
  let avatars = new Map<string, string | null>();
  if (names.length) {
    try {
      const rows = await db.select({ slug: schema.users.slug, avatarUrl: schema.users.avatarUrl })
        .from(schema.users).where(inArray(schema.users.slug, names));
      avatars = new Map(rows.map((r) => [r.slug, r.avatarUrl]));
    } catch { /* a card without faces still reads */ }
  }

  const trophy = board.result?.trophy
    ? { name: board.result.trophy.name, imageUrl: board.result.trophy.imageUrl, value: board.result.trophy.value }
    : null;

  const msLeft = board.week.votingEndsAt.getTime() - Date.now();
  const daysLeft = board.week.phase === "voting" ? Math.max(0, Math.ceil(msLeft / 86400000)) : 0;

  const entries = mode === "result"
    ? (board.result?.podium ?? []).slice(0, 3).map((p, i) => ({
        rank: i + 1,
        name: p.displayName,
        avatarUrl: avatars.get(p.slug) ?? null,
        weekVotes: p.votes,
        lifetimeVotes: running.find((e) => e.slug === p.slug)?.lifetimeVotes ?? 0,
        trophyUrl: trophy?.imageUrl ?? null,
      }))
    : running.slice(0, 4).map((e, i) => ({
        rank: i + 1,
        name: e.displayName,
        avatarUrl: avatars.get(e.slug) ?? null,
        weekVotes: e.weekVotes,
        lifetimeVotes: e.lifetimeVotes,
      }));

  return {
    kind: "week",
    mode,
    weekKey: board.week.key,
    title: mode === "result" ? "Profile of the Week" : "Profile of the Week",
    subtitle: mode === "result"
      ? "The votes are in — here's your podium"
      : daysLeft > 0
        ? `Voting closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"} · every profile is entered`
        : "Voting is closed — winners are being called",
    daysLeft,
    entries,
    totalVotes,
    contenders: running.filter((e) => e.weekVotes > 0).length,
    trophy,
    theme: { ...BRAND, accent: "#fbbf24", accent2: "#f472b6", bgUrl: bg.bgUrl },
  };
}
