import { and, eq, inArray, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getProvider, PROVIDERS } from "@/lib/providers/registry";
import { getUserQuests, getTotalCp } from "@/lib/quests";
import { levelFromCp } from "@/lib/level";
import { getContent } from "@/lib/cms";
import { buildCardBgMap, cardBgCmsKeys } from "@/lib/card-bg";
import type { CardData, CardTheme } from "@/lib/cards/types";
import { narrow, parseGamerPrefs } from "@/lib/cards/refs";

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
    db.select({ name: schema.trophies.name, imageUrl: schema.trophies.imageUrl, value: schema.trophies.value, awardedAt: schema.userTrophies.awardedAt })
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
    // THE GAMER'S OWN CHOICE (B58), applied as a FILTER over rows already
    // fetched for them — never as a query built from what they picked. An id
    // they do not own therefore selects nothing rather than selecting somebody
    // else's account, and no selection means all of theirs.
    accounts: narrow(accounts, parseGamerPrefs(user.cardPrefs).accounts).map((a) => {
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
    // The three most VALUABLE, not the three most recent.
    //
    // A trophy case is a brag, and what a gamer brags about is the best thing
    // they have won, not the last one. Ties break on recency so the order is
    // stable rather than whatever the query happened to return. The cash value
    // travels with each one: a trophy nobody can price reads as a badge, and
    // the entire point of this economy is that these are worth real money.
    // STACKED (B62): the same trophy held more than once — bought one, won one,
    // earned one at a streak milestone — is ONE entry with a count. Three rows
    // of the same picture read as a bug, and the count is the impressive part.
    // Keyed on name+image rather than on the trophy id, because two rows can be
    // the same prize re-issued, and a gamer does not care which id it was.
    trophies: (() => {
      const by = new Map<string, { name: string; imageUrl: string; value: number; count: number; at: number }>();
      for (const t of won) {
        const key = `${t.name}::${t.imageUrl}`;
        const hit = by.get(key);
        if (hit) { hit.count += 1; hit.at = Math.max(hit.at, t.awardedAt.getTime()); }
        else by.set(key, { name: t.name, imageUrl: t.imageUrl, value: t.value, count: 1, at: t.awardedAt.getTime() });
      }
      return [...by.values()]
        .sort((a, b) => (b.value - a.value) || (b.at - a.at))
        .map(({ name, imageUrl, value, count }) => ({ name, imageUrl, value, count }));
    })(),
    // The TOTAL held, which is still the honest number for the heading — a
    // gamer with three of one trophy and two of another has five.
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
export async function gameStatsCard(slug: string, game: string, accountId?: string | null): Promise<CardData | null> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user) return null;
  const accounts = await db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id));
  const ofGame = accounts.filter((a) => (getProvider(a.provider)?.game ?? "").toLowerCase() === game.toLowerCase());
  // WHICH account, when a gamer has two on one game.
  //
  // A main and a smurf, or one per region, is ordinary — and this used to take
  // whichever row the query returned first, so the second account was
  // unreachable and the card silently showed the wrong player's stats. The id
  // is checked against this user's own accounts, so a guessed or stale id
  // cannot read somebody else's.
  const acc = (accountId ? ofGame.find((a) => a.id === accountId) : null) ?? ofGame[0];
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
    // B56.0: every card's top-left is a picture of the thing it is about, and
    // for a gamer's quest summary that is the gamer.
    avatarUrl: user.avatarUrl,
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
        // The IN-GAME name (B54/B52). This is that game's ladder, and it was
        // printing the Cluster profile name — the same defect the challenge
        // card had, in a third place.
        ign: schema.linkedGameAccounts.inGameName,
      }).from(schema.statCurrent)
        .innerJoin(schema.linkedGameAccounts, eq(schema.statCurrent.linkedAccountId, schema.linkedGameAccounts.id))
        .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
        .where(and(eq(schema.statCurrent.game, game), eq(schema.statCurrent.metricKey, board.metricKey)));
      entries = rows.length;
      const sorted = [...rows].sort((a, b) => board.sortDir === "asc" ? a.value - b.value : b.value - a.value);
      if (sorted[0]) {
        leader = sorted[0].ign || sorted[0].name;
        value = sorted[0].rankLabel ?? String(Math.round(sorted[0].value * 100) / 100);
      }
    } catch { /* a board we can't read is still a board that exists */ }
    return { title: board.title, leader, value, entries };
  }));

  return {
    kind: "planet",
    // The game's own world, from the cached snapshot — never a live fetch on a
    // card render. No snapshot yet means no fourth pane, which is the rule the
    // pane grid is built on: a card with nothing for a pane leaves it empty
    // rather than drawing a box with nothing in it.
    world: await (async () => {
      try {
        const { getCachedEntityList } = await import("@/lib/game-world-cache");
        const all = await getCachedEntityList(g.name);
        // B58: the admin's reference decides WHICH. "These heroes" is the whole
        // reason this exists — a game with two hundred champions needs somebody
        // to choose four, and a slice of whatever the snapshot returned first is
        // not a choice.
        const { refFor } = await import("@/lib/cards/refs");
        const { layoutFor } = await import("@/lib/cards/layout-store");
        const ref = refFor((await layoutFor("planet")).refs, "planet", "world");
        const picked = ref.source === "world.pick" && ref.ids?.length
          // Named order, not snapshot order: an admin who lists three heroes
          // means those three, in that order.
          ? ref.ids.map((id) => all.find((e) => e.id === id)).filter(Boolean) as typeof all
          : all;
        return picked.slice(0, 4)
          .map((e) => ({ name: e.name, imageUrl: e.image || null, role: e.role }));
      } catch { return []; }
    })(),
    
    game: g.name,
    logoUrl: g.logoUrl,
    // B85.2. The globe, at last. Separate from `theme.bgUrl` on purpose: the
    // background is the space behind it and the globe is the subject, and
    // collapsing the two is how the card lost its planet in the first place.
    globeUrl: g.planetImageUrl || null,
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
    // The game's OWN art too (B54). A challenge with no cover of its own used
    // to fall past `bot_challenge` to nothing and render as a flat gradient —
    // a competition on League of Legends looking like a competition on nothing.
    // Its game always has a planet background or a cover.
    db.select({
      logoUrl: schema.games.logoUrl, accent: schema.games.accent, accent2: schema.games.accent2,
      planetBgUrl: schema.games.planetBgUrl, coverUrl: schema.games.coverUrl,
    }).from(schema.games).where(eq(schema.games.name, ch.game)).limit(1),
    cardBg("bot_challenge"),
  ]);

  // Podium prizes are trophy-id lists per place; resolve them to art + value.
  //
  // Falls back to the legacy single `trophyId` as first place, exactly as the
  // challenge page does. Without it, every challenge created before podium
  // prizes existed rendered a card with no prize on it at all — while the same
  // challenge's web page showed the trophy — so the card was quietly hiding
  // the one thing a competition is for.
  const prizes = ch.prizes ?? (ch.trophyId ? { first: [ch.trophyId] } : {});
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

  // The entry rules, resolved through the provider that scores this game so
  // the card says "Gold or above" rather than the stored `solo_tier >= 4`.
  const { ruleLines } = await import("@/lib/challenge-rules");
  const { getProvider } = await import("@/lib/providers/registry");
  const entryRules = ruleLines(ch.rules?.conditions, getProvider(ch.provider)?.capabilities ?? []);

  return {
    kind: "challenge",
    title: ch.title,
    game: ch.game,
    entryRules,
    logoUrl: g?.logoUrl ?? null,
    description: ch.description || null,
    startsAt: ch.startAt.toISOString(),
    endsAt: ch.endAt.toISOString(),
    ended: ch.status === "completed",
    participants: participants.length,
    prize: ch.prizeDescription || null,
    isPrivate: ch.visibility === "private" && !!ch.accessKey,
    serverName,
    // The IN-GAME name leads (B54, consistent with B52).
    //
    // `challengeStandings` has returned `inGameName` all along and this line
    // threw it away. It is that game's challenge, scored on that game's
    // account, so the game identity is the subject — a gamer looking for
    // themselves on a card is looking for the tag they play under. The Cluster
    // name rides along as the secondary line.
    standings: standings.map((s) => ({
      place: s.place,
      name: s.inGameName || s.displayName,
      alt: s.inGameName && s.inGameName !== s.displayName ? s.displayName : null,
      points: s.points,
    })),
    trophies,
    theme: {
      accent: g?.accent || BRAND.accent,
      accent2: g?.accent2 || BRAND.accent2,
      // Its own art first, then the GAME's, then the configured default. The
      // game's art is the addition: a challenge without a cover is common and
      // should still look like the game it is on.
      bgUrl: ch.coverUrl || ch.heroUrl || g?.planetBgUrl || g?.coverUrl || bg.bgUrl,
      bgFallbacks: [ch.heroUrl, g?.planetBgUrl, g?.coverUrl, bg.bgUrl],
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

/**
 * THIS challenge's standings — not the game's leaderboard.
 *
 * The two were the same button for a long time, and they are not the same
 * thing: a game's board ranks everyone who plays it on a lifetime metric, while
 * a challenge's standings rank only the people who entered, on points earned
 * since they entered. Sending somebody who asked "where am I in this
 * competition?" to a lifetime ladder they are not competing on is the wrong
 * answer to the right question.
 *
 * Rendered as a leaderboard card because that is what it is — a ranked list —
 * but titled and scoped to the challenge, with the prize pool named underneath.
 */
export async function challengeStandingsCard(challengeId: string): Promise<CardData | null> {
  const db = await getDb();
  const [ch] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!ch) return null;

  const [rows, g, bg] = await Promise.all([
    db.select({
      points: schema.challengeParticipants.currentPoints,
      status: schema.challengeParticipants.status,
      name: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      account: schema.linkedGameAccounts.inGameName,
    })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .innerJoin(schema.linkedGameAccounts, eq(schema.challengeParticipants.linkedAccountId, schema.linkedGameAccounts.id))
      .where(eq(schema.challengeParticipants.challengeId, challengeId))
      .orderBy(desc(schema.challengeParticipants.currentPoints))
      .limit(10),
    db.select({ logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl })
      .from(schema.games).where(eq(schema.games.name, ch.game)).limit(1),
    cardBg("bot_leaderboard"),
  ]);

  const live = rows.filter((r) => r.status !== "disqualified");
  return {
    kind: "leaderboard",
    title: ch.title,
    game: ch.game,
    logoUrl: g[0]?.logoUrl ?? null,
    // Says what these numbers ARE. "Live standings" on a lifetime board and on
    // a week-old competition would read identically, and they mean opposite
    // things.
    subtitle: live.length
      ? `Points earned in this challenge · ${live.length} entered`
      : "Nobody has scored yet — first point leads",
    rows: live.map((r, i) => ({
      rank: i + 1,
      // The ACCOUNT leads (B54, matching B52).
      //
      // This read `${r.name} · ${r.account}` — the Cluster name first. It is
      // that game's challenge, scored on that game's account, and with two
      // accounts on one game only one of them is entered: the entered one is
      // the subject. The person rides along second.
      name: r.account && r.account !== r.name ? `${r.account} · ${r.name}` : (r.account || r.name),
      value: `${r.points} pts`,
      avatarUrl: r.avatarUrl,
    })),
    theme: { ...BRAND, bgUrl: ch.coverUrl || g[0]?.coverUrl || bg.bgUrl, bgFallbacks: [bg.bgUrl] },
  };
}

// Profile of the Week, as a card the bot can post.
//
// `mode` decides which story it tells. During the week it's the race — the
// standings and the clock. Once a week is called it's the result, and the
// placements carry the trophy each of them was actually handed, because a
// podium that doesn't show the prize is just a list of names.
/**
 * The marketplace shelf, for a specific gamer.
 *
 * Six trophies chosen the way a shop chooses a window: what they can afford
 * first, then the closest things they can't. An all-affordable shelf gives them
 * nothing to play for and an all-unaffordable one gives them nothing to buy.
 */
export async function marketCard(opts: { userId?: string | null } = {}): Promise<CardData | null> {
  const db = await getDb();
  const bg = await cardBg("bot_market");
  const { marketplaceCatalog } = await import("@/lib/marketplace");
  const { trophies, wallet, rate } = await marketplaceCatalog(db, { userId: opts.userId ?? null });

  const afford = trophies.filter((t) => t.affordable);
  const reach = trophies.filter((t) => !t.affordable).sort((a, b) => a.cpPrice - b.cpPrice);
  const six = [...afford.slice(0, 4), ...reach].slice(0, 6);

  return {
    kind: "market",
    title: "Trophy marketplace",
    subtitle: opts.userId
      ? "Your points, in trophies you can keep or cash out"
      : "Earn points by playing — spend them on trophies worth real money",
    balance: wallet.balance,
    earned: wallet.earned,
    cpPerDollar: rate,
    trophies: six.map((t) => ({
      id: t.id, name: t.name, imageUrl: t.imageUrl, tier: t.tier,
      cpPrice: t.cpPrice, value: t.value, affordable: t.affordable,
    })),
    theme: { ...BRAND, accent: "#fbbf24", accent2: "#22d3ee", bgUrl: bg.bgUrl },
  };
}

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

// A game-world entity — a champion, agent, legend, weapon or map.
//
// The splash IS the card. Lore and abilities sit on it, which is the whole
// reason this is a PNG rather than an embed: Discord cannot put text on art.
// `skin` picks which splash, so switching skins re-renders the same card
// instead of opening a different one.
export async function worldCard(game: string, kind: string, id: string, skin?: string | null): Promise<CardData | null> {
  const { getCachedEntityDetail } = await import("@/lib/game-world-cache");
  const e = await getCachedEntityDetail(game, kind, id);
  if (!e) return null;

  const db = await getDb();
  const [[g], bg] = await Promise.all([
    db.select({ logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl, planetBgUrl: schema.games.planetBgUrl, accent: schema.games.accent, accent2: schema.games.accent2 })
      .from(schema.games).where(eq(schema.games.name, game)).limit(1),
    cardBg("bot_world"),
  ]);

  // The chosen skin's art, or the entity's own splash. A skin name that doesn't
  // exist falls back rather than rendering an empty card.
  const picked = skin ? e.skins.find((s) => s.name.toLowerCase() === skin.toLowerCase()) : null;
  const art = picked?.image || e.splash || e.image || null;

  return {
    kind: "world",
    game,
    entityKind: e.kind,
    name: e.name,
    role: e.role,
    lore: e.lore,
    skinName: picked?.name ?? null,
    skinCount: e.skins.length,
    meta: e.meta.slice(0, 4),
    // `a.icon` used to be dropped here — the cache hosts every ability icon and
    // the card then rendered the abilities as plain text.
    abilities: e.abilities.slice(0, 4).map((a) => ({ name: a.name, desc: a.desc, iconUrl: a.icon })),
    // The same image the background uses, carried separately so the renderer
    // can draw it undimmed in the splash panel. Falls back exactly as the
    // background does, so the panel is never empty while the backdrop has art.
    artUrl: art || e.splash || e.image || null,
    logoUrl: g?.logoUrl ?? null,
    theme: {
      accent: g?.accent || BRAND.accent,
      accent2: g?.accent2 || BRAND.accent2,
      bgUrl: art || g?.planetBgUrl || bg.bgUrl,
      bgFallbacks: [e.splash, e.image, g?.planetBgUrl, g?.coverUrl, bg.bgUrl],
    },
  };
}

// "Did you mean…" — the only card a search produces when it can't answer.
export async function searchCard(query: string, results: { label: string; sub: string; kind: string; imageUrl?: string | null }[]): Promise<CardData> {
  const bg = await cardBg("bot_search");
  return {
    kind: "search",
    query: query.slice(0, 60),
    results: results.slice(0, 6),
    theme: { ...BRAND, bgUrl: bg.bgUrl },
  };
}
