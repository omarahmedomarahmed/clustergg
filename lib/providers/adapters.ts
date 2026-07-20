// Provider adapters: verify(identifier) resolves an account; fetchStats(account)
// pulls normalized metrics. Every fetch is time-boxed and failure-isolated so a
// slow provider can never take a page down.

export type VerifyResult =
  | { ok: true; accountId: string; name: string; avatarUrl?: string; region?: string; data?: Record<string, unknown> }
  | { ok: false; error: string };

export type Metric = { value: number; rankLabel?: string };
export type StatsResult =
  | { ok: true; metrics: Record<string, Metric>; providerDataPatch?: Record<string, unknown> }
  | { ok: false; error: string; authExpired?: boolean };

export type AccountRef = {
  providerAccountId: string;
  inGameName: string;
  region?: string | null;
  providerData?: Record<string, unknown> | null;
};

const UA = { "User-Agent": "ClusterGG/1.0 (clustergg.com stat sync)" };

async function j<T = any>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...UA, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return res.json() as Promise<T>;
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

function metricsOf(pairs: Record<string, number | undefined | { value?: number; rankLabel?: string }>): Record<string, Metric> {
  const out: Record<string, Metric> = {};
  for (const [k, v] of Object.entries(pairs)) {
    if (v == null) continue;
    if (typeof v === "number") { if (Number.isFinite(v)) out[k] = { value: v }; }
    else if (v.value != null && Number.isFinite(v.value)) out[k] = { value: v.value, rankLabel: v.rankLabel };
  }
  return out;
}

// ============ Chess.com (public) ============
const chesscom = {
  async verify(username: string): Promise<VerifyResult> {
    try {
      const u = username.trim().toLowerCase();
      const p = await j<any>(`https://api.chess.com/pub/player/${encodeURIComponent(u)}`);
      return { ok: true, accountId: u, name: p.username ?? u, avatarUrl: p.avatar };
    } catch { return { ok: false, error: "Chess.com player not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    try {
      const s = await j<any>(`https://api.chess.com/pub/player/${encodeURIComponent(a.providerAccountId)}/stats`);
      const rec = (m: any) => ({ w: num(m?.record?.win) ?? 0, l: num(m?.record?.loss) ?? 0, d: num(m?.record?.draw) ?? 0 });
      const rr = rec(s.chess_rapid), bb = rec(s.chess_blitz), uu = rec(s.chess_bullet);
      const wins = rr.w + bb.w + uu.w, losses = rr.l + bb.l + uu.l;
      const games = wins + losses + rr.d + bb.d + uu.d;
      return {
        ok: true,
        metrics: metricsOf({
          rapid_rating: num(s.chess_rapid?.last?.rating),
          blitz_rating: num(s.chess_blitz?.last?.rating),
          bullet_rating: num(s.chess_bullet?.last?.rating),
          puzzle_rating: num(s.tactics?.highest?.rating),
          wins, losses, games,
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ Lichess (public) ============
const lichess = {
  async verify(username: string): Promise<VerifyResult> {
    try {
      const u = username.trim();
      const p = await j<any>(`https://lichess.org/api/user/${encodeURIComponent(u)}`);
      return { ok: true, accountId: p.id, name: p.username ?? u };
    } catch { return { ok: false, error: "Lichess player not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    try {
      const p = await j<any>(`https://lichess.org/api/user/${encodeURIComponent(a.providerAccountId)}`);
      const perf = p.perfs ?? {};
      return {
        ok: true,
        metrics: metricsOf({
          blitz_rating: num(perf.blitz?.rating),
          rapid_rating: num(perf.rapid?.rating),
          bullet_rating: num(perf.bullet?.rating),
          puzzle_rating: num(perf.puzzle?.rating),
          games: num(p.count?.all),
          wins: num(p.count?.win),
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ OpenDota — Dota 2 (public) ============
const DOTA_RANKS = ["Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"];
const opendota = {
  async verify(accountId: string): Promise<VerifyResult> {
    try {
      const idNum = accountId.trim().replace(/\D/g, "");
      if (!idNum) return { ok: false, error: "Enter your numeric Dota 2 Friend ID" };
      const p = await j<any>(`https://api.opendota.com/api/players/${idNum}`);
      if (!p?.profile) return { ok: false, error: "Dota 2 player not found (profile may be private)" };
      return { ok: true, accountId: idNum, name: p.profile.personaname ?? idNum, avatarUrl: p.profile.avatarfull };
    } catch { return { ok: false, error: "Dota 2 player not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    try {
      const [p, wl] = await Promise.all([
        j<any>(`https://api.opendota.com/api/players/${a.providerAccountId}`),
        j<any>(`https://api.opendota.com/api/players/${a.providerAccountId}/wl`),
      ]);
      const wins = num(wl?.win) ?? 0, losses = num(wl?.lose) ?? 0;
      const total = wins + losses;
      const rankTier = num(p?.rank_tier);
      const rankLabel = rankTier
        ? `${DOTA_RANKS[Math.floor(rankTier / 10) - 1] ?? "Unranked"} ${rankTier % 10 || ""}`.trim()
        : undefined;
      return {
        ok: true,
        metrics: metricsOf({
          wins, losses,
          win_rate: total > 0 ? Math.round((wins / total) * 1000) / 10 : undefined,
          rank_tier: rankTier != null ? { value: rankTier, rankLabel } : undefined,
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ Speedrun.com (public) ============
const speedruncom = {
  async verify(username: string): Promise<VerifyResult> {
    try {
      const r = await j<any>(`https://www.speedrun.com/api/v1/users?lookup=${encodeURIComponent(username.trim())}`);
      const u = r?.data?.[0];
      if (!u) return { ok: false, error: "Speedrun.com user not found" };
      return { ok: true, accountId: u.id, name: u.names?.international ?? username };
    } catch { return { ok: false, error: "Speedrun.com user not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    try {
      const r = await j<any>(`https://www.speedrun.com/api/v1/users/${a.providerAccountId}/personal-bests`);
      const runs: any[] = r?.data ?? [];
      const wr = runs.filter((x) => x.place === 1).length;
      const podium = runs.filter((x) => x.place >= 1 && x.place <= 3).length;
      return { ok: true, metrics: metricsOf({ personal_bests: runs.length, world_records: wr, podiums: podium }) };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ Roblox (public) ============
const roblox = {
  async verify(username: string): Promise<VerifyResult> {
    try {
      const r = await j<any>("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username.trim()], excludeBannedUsers: true }),
      });
      const u = r?.data?.[0];
      if (!u) return { ok: false, error: "Roblox user not found" };
      return { ok: true, accountId: String(u.id), name: u.displayName ?? u.name };
    } catch { return { ok: false, error: "Roblox user not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    try {
      const id = a.providerAccountId;
      const [info, friends, followers] = await Promise.all([
        j<any>(`https://users.roblox.com/v1/users/${id}`),
        j<any>(`https://friends.roblox.com/v1/users/${id}/friends/count`),
        j<any>(`https://friends.roblox.com/v1/users/${id}/followers/count`),
      ]);
      const created = info?.created ? Date.now() - new Date(info.created).getTime() : undefined;
      return {
        ok: true,
        metrics: metricsOf({
          friends: num(friends?.count),
          followers: num(followers?.count),
          account_age_days: created != null ? Math.floor(created / 86400000) : undefined,
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ Steam (STEAM_API_KEY) ============
const steam = {
  async verify(identifier: string): Promise<VerifyResult> {
    const key = process.env.STEAM_API_KEY;
    if (!key) return { ok: false, error: "STEAM_API_KEY not configured" };
    try {
      let steamId = identifier.trim();
      if (!/^\d{17}$/.test(steamId)) {
        const rv = await j<any>(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(steamId)}`);
        if (rv?.response?.success !== 1) return { ok: false, error: "Steam vanity URL not found" };
        steamId = rv.response.steamid;
      }
      const ps = await j<any>(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`);
      const p = ps?.response?.players?.[0];
      if (!p) return { ok: false, error: "Steam profile not found" };
      return { ok: true, accountId: steamId, name: p.personaname ?? steamId, avatarUrl: p.avatarfull };
    } catch (e) { return { ok: false, error: `Steam lookup failed: ${e}` }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    const key = process.env.STEAM_API_KEY;
    if (!key) return { ok: false, error: "STEAM_API_KEY not configured" };
    try {
      const id = a.providerAccountId;
      const [level, games] = await Promise.all([
        j<any>(`https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${key}&steamid=${id}`),
        j<any>(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${id}&include_played_free_games=1`),
      ]);
      const owned: any[] = games?.response?.games ?? [];
      const minutes = owned.reduce((acc, g) => acc + (num(g.playtime_forever) ?? 0), 0);
      return {
        ok: true,
        metrics: metricsOf({
          steam_level: num(level?.response?.player_level),
          games_owned: num(games?.response?.game_count) ?? owned.length,
          playtime_hours: Math.round(minutes / 60),
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ Riot — League of Legends (RIOT_API_KEY) ============
const RIOT_REGION_TO_PLATFORM: Record<string, string> = {
  na: "na1", euw: "euw1", eune: "eun1", kr: "kr", br: "br1", jp: "jp1",
  lan: "la1", las: "la2", oce: "oc1", tr: "tr1", ru: "ru", me: "me1",
};
function riotCluster(platform: string): string {
  if (["na1", "br1", "la1", "la2", "oc1"].includes(platform)) return "americas";
  if (["kr", "jp1"].includes(platform)) return "asia";
  return "europe";
}
const riotLol = {
  async verify(identifier: string, region = "euw"): Promise<VerifyResult> {
    const key = process.env.RIOT_API_KEY;
    if (!key) return { ok: false, error: "RIOT_API_KEY not configured" };
    const [gameName, tagLine] = identifier.split("#").map((s) => s.trim());
    if (!gameName || !tagLine) return { ok: false, error: "Use the GameName#TAG format" };
    try {
      const platform = RIOT_REGION_TO_PLATFORM[region.toLowerCase()] ?? region.toLowerCase();
      const cluster = riotCluster(platform);
      const acct = await j<any>(
        `https://${cluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
        { headers: { "X-Riot-Token": key } }
      );
      return { ok: true, accountId: acct.puuid, name: `${acct.gameName}#${acct.tagLine}`, region: platform };
    } catch { return { ok: false, error: "Riot ID not found (check region + GameName#TAG)" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    const key = process.env.RIOT_API_KEY;
    if (!key) return { ok: false, error: "RIOT_API_KEY not configured" };
    try {
      const platform = a.region ?? "euw1";
      const headers = { "X-Riot-Token": key };
      // Summoner + ranked entries + top champion mastery in parallel (mastery
      // isolated so a mastery hiccup never fails the rank sync).
      const [summoner, entries, masteryRaw] = await Promise.all([
        j<any>(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${a.providerAccountId}`, { headers }),
        j<any[]>(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${a.providerAccountId}`, { headers }),
        j<any[]>(`https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${a.providerAccountId}/top?count=8`, { headers }).catch(() => []),
      ]);
      const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
      const flex = entries.find((e) => e.queueType === "RANKED_FLEX_SR");
      const TIERS = ["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER"];
      const tierVal = (e: any) => e?.tier ? TIERS.indexOf(e.tier) * 400 + (num(e.leaguePoints) ?? 0) : undefined;
      const wins = num(solo?.wins), losses = num(solo?.losses);
      // Persist game-specific avatar (profile icon) + champion mastery so the
      // planet page / leaderboards read them without any live Riot call.
      let providerDataPatch: Record<string, unknown> | undefined;
      try {
        const { lolPersistBits } = await import("@/lib/providers/riot-lol-rich");
        const bits = await lolPersistBits(summoner?.profileIconId != null ? Number(summoner.profileIconId) : null, masteryRaw ?? []);
        providerDataPatch = { gameAvatar: bits.gameAvatar, profileIconId: bits.profileIconId, lolChampions: bits.champions };
      } catch { /* non-fatal — stats still sync */ }
      return {
        ok: true,
        providerDataPatch,
        metrics: metricsOf({
          summoner_level: num(summoner?.summonerLevel),
          solo_lp: num(solo?.leaguePoints),
          solo_tier: solo?.tier
            ? { value: tierVal(solo)!, rankLabel: `${solo.tier} ${solo.rank ?? ""}`.trim() }
            : undefined,
          flex_tier: flex?.tier
            ? { value: tierVal(flex)!, rankLabel: `${flex.tier} ${flex.rank ?? ""}`.trim() }
            : undefined,
          wins, losses,
          win_rate: wins != null && losses != null && wins + losses > 0
            ? Math.round((wins / (wins + losses)) * 1000) / 10 : undefined,
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ Riot — VALORANT (identity via account-v1) ============
const riotValorant = {
  async verify(identifier: string, region = "euw"): Promise<VerifyResult> {
    return riotLol.verify(identifier, region);
  },
  async fetchStats(): Promise<StatsResult> {
    return { ok: false, error: "VALORANT stat endpoints require Riot production key approval" };
  },
};

// ============ Fortnite via fortnite-api.com (FORTNITE_API_KEY) ============
const fortnite = {
  async verify(name: string): Promise<VerifyResult> {
    const key = process.env.FORTNITE_API_KEY;
    if (!key) return { ok: false, error: "FORTNITE_API_KEY not configured" };
    try {
      const r = await j<any>(
        `https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(name.trim())}`,
        { headers: { Authorization: key } });
      const acct = r?.data?.account;
      if (!acct) return { ok: false, error: "Fortnite player not found or stats private" };
      return { ok: true, accountId: acct.id, name: acct.name };
    } catch { return { ok: false, error: "Fortnite player not found or stats private" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    const key = process.env.FORTNITE_API_KEY;
    if (!key) return { ok: false, error: "FORTNITE_API_KEY not configured" };
    try {
      const r = await j<any>(
        `https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(a.inGameName)}`,
        { headers: { Authorization: key } });
      const o = r?.data?.stats?.all?.overall;
      return {
        ok: true,
        metrics: metricsOf({
          wins: num(o?.wins), kills: num(o?.kills), kd_ratio: num(o?.kd),
          matches: num(o?.matches), win_rate: num(o?.winRate),
          battle_pass_level: num(r?.data?.battlePass?.level),
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ Hypixel (HYPIXEL_API_KEY) ============
const hypixel = {
  async verify(mcName: string): Promise<VerifyResult> {
    try {
      const m = await j<any>(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(mcName.trim())}`);
      if (!m?.id) return { ok: false, error: "Minecraft account not found" };
      return { ok: true, accountId: m.id, name: m.name };
    } catch { return { ok: false, error: "Minecraft account not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    const key = process.env.HYPIXEL_API_KEY;
    if (!key) return { ok: false, error: "HYPIXEL_API_KEY not configured" };
    try {
      const r = await j<any>(`https://api.hypixel.net/v2/player?uuid=${a.providerAccountId}`, { headers: { "API-Key": key } });
      const p = r?.player;
      if (!p) return { ok: false, error: "Player has not joined Hypixel" };
      const exp = num(p.networkExp) ?? 0;
      const level = Math.floor((Math.sqrt(exp + 15312.5) - 125 / Math.sqrt(2)) / (25 * Math.sqrt(2)));
      return {
        ok: true,
        metrics: metricsOf({
          network_level: Math.max(1, level),
          karma: num(p.karma),
          achievement_points: num(p.achievementPoints),
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ PUBG (PUBG_API_KEY) ============
const pubg = {
  async verify(name: string): Promise<VerifyResult> {
    const key = process.env.PUBG_API_KEY;
    if (!key) return { ok: false, error: "PUBG_API_KEY not configured" };
    try {
      const r = await j<any>(
        `https://api.pubg.com/shards/steam/players?filter[playerNames]=${encodeURIComponent(name.trim())}`,
        { headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.api+json" } });
      const p = r?.data?.[0];
      if (!p) return { ok: false, error: "PUBG player not found" };
      return { ok: true, accountId: p.id, name: p.attributes?.name ?? name, region: "steam" };
    } catch { return { ok: false, error: "PUBG player not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    const key = process.env.PUBG_API_KEY;
    if (!key) return { ok: false, error: "PUBG_API_KEY not configured" };
    try {
      const r = await j<any>(
        `https://api.pubg.com/shards/${a.region ?? "steam"}/players/${a.providerAccountId}/seasons/lifetime?filter[gamepad]=false`,
        { headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.api+json" } });
      const modes = r?.data?.attributes?.gameModeStats ?? {};
      let wins = 0, kills = 0, losses = 0, top10s = 0;
      for (const m of Object.values<any>(modes)) {
        wins += num(m.wins) ?? 0; kills += num(m.kills) ?? 0;
        losses += num(m.losses) ?? 0; top10s += num(m.top10s) ?? 0;
      }
      return {
        ok: true,
        metrics: metricsOf({
          wins, kills, top10s,
          kd_ratio: losses > 0 ? Math.round((kills / losses) * 100) / 100 : kills,
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ FACEIT — CS2 (FACEIT_API_KEY) ============
const faceit = {
  async verify(nickname: string): Promise<VerifyResult> {
    const key = process.env.FACEIT_API_KEY;
    if (!key) return { ok: false, error: "FACEIT_API_KEY not configured" };
    try {
      const p = await j<any>(
        `https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(nickname.trim())}`,
        { headers: { Authorization: `Bearer ${key}` } });
      return { ok: true, accountId: p.player_id, name: p.nickname, avatarUrl: p.avatar };
    } catch { return { ok: false, error: "FACEIT player not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    const key = process.env.FACEIT_API_KEY;
    if (!key) return { ok: false, error: "FACEIT_API_KEY not configured" };
    try {
      const p = await j<any>(`https://open.faceit.com/data/v4/players/${a.providerAccountId}`,
        { headers: { Authorization: `Bearer ${key}` } });
      const cs = p?.games?.cs2 ?? p?.games?.csgo;
      return {
        ok: true,
        metrics: metricsOf({ elo: num(cs?.faceit_elo), skill_level: num(cs?.skill_level) }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ Supercell (Clash of Clans / Clash Royale / Brawl Stars) ============
function supercell(host: string, envVar: string, mapStats: (p: any) => Record<string, number | undefined>) {
  return {
    async verify(tag: string): Promise<VerifyResult> {
      const token = process.env[envVar];
      if (!token) return { ok: false, error: `${envVar} not configured` };
      try {
        const t = encodeURIComponent(tag.trim().toUpperCase().replace(/^#?/, "#"));
        const p = await j<any>(`https://${host}/v1/players/${t}`, { headers: { Authorization: `Bearer ${token}` } });
        return { ok: true, accountId: p.tag, name: p.name ?? tag };
      } catch { return { ok: false, error: "Player tag not found" }; }
    },
    async fetchStats(a: AccountRef): Promise<StatsResult> {
      const token = process.env[envVar];
      if (!token) return { ok: false, error: `${envVar} not configured` };
      try {
        const p = await j<any>(`https://${host}/v1/players/${encodeURIComponent(a.providerAccountId)}`,
          { headers: { Authorization: `Bearer ${token}` } });
        return { ok: true, metrics: metricsOf(mapStats(p)) };
      } catch (e) { return { ok: false, error: String(e) }; }
    },
  };
}
const clashofclans = supercell("api.clashofclans.com", "SUPERCELL_COC_TOKEN", (p) => ({
  trophies: num(p.trophies), town_hall: num(p.townHallLevel), war_stars: num(p.warStars),
}));
const clashroyale = supercell("api.clashroyale.com", "SUPERCELL_CR_TOKEN", (p) => ({
  trophies: num(p.trophies), wins: num(p.wins), best_trophies: num(p.bestTrophies),
}));
const brawlstars = supercell("api.brawlstars.com", "SUPERCELL_BRAWL_TOKEN", (p) => ({
  trophies: num(p.trophies), highest_trophies: num(p.highestTrophies), victories_3v3: num(p["3vs3Victories"]),
}));

// ============ Xbox via OpenXBL (OPENXBL_API_KEY) ============
const xbox = {
  async verify(gamertag: string): Promise<VerifyResult> {
    const key = process.env.OPENXBL_API_KEY;
    if (!key) return { ok: false, error: "OPENXBL_API_KEY not configured" };
    try {
      const r = await j<any>(`https://xbl.io/api/v2/search/${encodeURIComponent(gamertag.trim())}`,
        { headers: { "X-Authorization": key } });
      const p = r?.people?.[0];
      if (!p) return { ok: false, error: "Gamertag not found" };
      return { ok: true, accountId: p.xuid, name: p.gamertag ?? gamertag, avatarUrl: p.displayPicRaw };
    } catch { return { ok: false, error: "Gamertag not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    const key = process.env.OPENXBL_API_KEY;
    if (!key) return { ok: false, error: "OPENXBL_API_KEY not configured" };
    try {
      const r = await j<any>(`https://xbl.io/api/v2/player/summary/${a.providerAccountId}`,
        { headers: { "X-Authorization": key } });
      const p = r?.people?.[0];
      return {
        ok: true,
        metrics: metricsOf({
          gamerscore: num(Number(p?.gamerScore)),
          followers: num(p?.detail?.followerCount),
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ osu! (OSU_CLIENT_ID / OSU_CLIENT_SECRET) ============
let osuToken: { token: string; exp: number } | null = null;
async function getOsuToken(): Promise<string> {
  if (osuToken && osuToken.exp > Date.now()) return osuToken.token;
  const r = await j<any>("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.OSU_CLIENT_ID,
      client_secret: process.env.OSU_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "public",
    }),
  });
  osuToken = { token: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000 };
  return osuToken.token;
}
const osu = {
  async verify(username: string): Promise<VerifyResult> {
    if (!process.env.OSU_CLIENT_ID) return { ok: false, error: "OSU_CLIENT_ID not configured" };
    try {
      const token = await getOsuToken();
      const p = await j<any>(`https://osu.ppy.sh/api/v2/users/${encodeURIComponent(username.trim())}/osu?key=username`,
        { headers: { Authorization: `Bearer ${token}` } });
      return { ok: true, accountId: String(p.id), name: p.username, avatarUrl: p.avatar_url };
    } catch { return { ok: false, error: "osu! player not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    if (!process.env.OSU_CLIENT_ID) return { ok: false, error: "OSU_CLIENT_ID not configured" };
    try {
      const token = await getOsuToken();
      const p = await j<any>(`https://osu.ppy.sh/api/v2/users/${a.providerAccountId}/osu`,
        { headers: { Authorization: `Bearer ${token}` } });
      const s = p?.statistics;
      return {
        ok: true,
        metrics: metricsOf({
          pp: num(s?.pp), global_rank: num(s?.global_rank),
          accuracy: num(s?.hit_accuracy), play_count: num(s?.play_count),
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ Apex Legends via Tracker Network (TRN_API_KEY) ============
const apex = {
  async verify(name: string): Promise<VerifyResult> {
    const key = process.env.TRN_API_KEY;
    if (!key) return { ok: false, error: "TRN_API_KEY not configured" };
    try {
      const r = await j<any>(
        `https://public-api.tracker.gg/v2/apex/standard/profile/origin/${encodeURIComponent(name.trim())}`,
        { headers: { "TRN-Api-Key": key } });
      const p = r?.data?.platformInfo;
      return { ok: true, accountId: p?.platformUserIdentifier ?? name, name: p?.platformUserHandle ?? name };
    } catch { return { ok: false, error: "Apex player not found" }; }
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    const key = process.env.TRN_API_KEY;
    if (!key) return { ok: false, error: "TRN_API_KEY not configured" };
    try {
      const r = await j<any>(
        `https://public-api.tracker.gg/v2/apex/standard/profile/origin/${encodeURIComponent(a.providerAccountId)}`,
        { headers: { "TRN-Api-Key": key } });
      const stats = r?.data?.segments?.[0]?.stats;
      return {
        ok: true,
        metrics: metricsOf({
          rank_score: num(stats?.rankScore?.value),
          level: num(stats?.level?.value),
          kills: num(stats?.kills?.value),
        }),
      };
    } catch (e) { return { ok: false, error: String(e) }; }
  },
};

// ============ Mobile Legends (self-hosted wrapper via MLBB_API_BASE) ============
// Linking happens through dedicated verification-code server actions, not verify().
// fetchStats reads the stored encrypted token; on token expiry it reports
// authExpired so the sync engine can flag the account WITHOUT deleting stats.
const mobileLegends = {
  async verify(): Promise<VerifyResult> {
    return { ok: false, error: "Mobile Legends links via an in-game verification code (see the link form)" };
  },
  async fetchStats(a: AccountRef): Promise<StatsResult> {
    const { decryptSecret } = await import("@/lib/crypto");
    const { fetchMlbbStats } = await import("@/lib/providers/mlbb");
    const enc = (a.providerData?.token as string) ?? "";
    const token = enc ? decryptSecret(enc) : null;
    if (!token) return { ok: false, error: "Reconnect needed — no saved session", authExpired: true };
    const r = await fetchMlbbStats(token);
    if (!r.ok) return { ok: false, error: r.error, authExpired: r.authExpired };
    const metrics: Record<string, Metric> = {};
    for (const [k, v] of Object.entries(r.stats.metrics)) {
      metrics[k] = { value: v, rankLabel: k === "level" ? undefined : undefined };
    }
    if (r.stats.rankLabel && metrics.level) metrics.level.rankLabel = undefined;
    return { ok: true, metrics, providerDataPatch: { lastRank: r.stats.rankLabel ?? null } };
  },
};

// ============ Identity-only providers ============
const identityOnly = (label: string) => ({
  async verify(): Promise<VerifyResult> {
    return { ok: false, error: `${label} connects via OAuth from Settings → Connections` };
  },
  async fetchStats(): Promise<StatsResult> {
    return { ok: true, metrics: metricsOf({ connected: 1 }) };
  },
});

export type Adapter = {
  verify(identifier: string, region?: string): Promise<VerifyResult>;
  fetchStats(account: AccountRef): Promise<StatsResult>;
};

export const ADAPTERS: Record<string, Adapter> = {
  chesscom, lichess, opendota, speedruncom, roblox, steam,
  "riot-lol": riotLol, "riot-valorant": riotValorant,
  fortnite, hypixel, pubg, faceit, clashofclans, clashroyale, brawlstars,
  xbox, osu, apex, "mobile-legends": mobileLegends,
  battlenet: identityOnly("Battle.net"),
  epic: identityOnly("Epic Games"),
  discord: identityOnly("Discord"),
};
