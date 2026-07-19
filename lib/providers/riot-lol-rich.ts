// Rich League of Legends data beyond the basic rank sync: champion mastery
// (CHAMPION-MASTERY-V4), recent match history + per-match detail (MATCH-V5), and
// live-game presence (SPECTATOR-V5), enriched with free Data Dragon static art
// (champion icons/splash, profile icons). Everything is cached in-process and
// failure-isolated so a slow Riot call can never take a profile down.

const UA = { "User-Agent": "ClusterGG/1.0 (clustergg.com stat sync)" };

async function rj<T = any>(url: string, key: string, timeoutMs = 7000): Promise<T> {
  const res = await fetch(url, {
    headers: { ...UA, "X-Riot-Token": key },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
async function pj<T = any>(url: string, timeoutMs = 7000): Promise<T> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// platform (na1/euw1/…) → regional match cluster (americas/asia/europe).
export function riotCluster(platform: string): string {
  const p = platform.toLowerCase();
  if (["na1", "br1", "la1", "la2", "oc1"].includes(p)) return "americas";
  if (["kr", "jp1"].includes(p)) return "asia";
  return "europe";
}

// ---------- Data Dragon (free static assets, aggressively cached) ----------
type Champ = { id: string; name: string };
let ddCache: { version: string; byId: Map<number, Champ>; exp: number } | null = null;

async function dataDragon(): Promise<{ version: string; byId: Map<number, Champ> }> {
  if (ddCache && ddCache.exp > Date.now()) return ddCache;
  const versions = await pj<string[]>("https://ddragon.leagueoflegends.com/api/versions.json");
  const version = versions[0] ?? "14.1.1";
  const data = await pj<any>(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`);
  const byId = new Map<number, Champ>();
  for (const c of Object.values<any>(data.data ?? {})) byId.set(Number(c.key), { id: c.id, name: c.name });
  ddCache = { version, byId, exp: Date.now() + 12 * 3600_000 };
  return ddCache;
}
export function champIconUrl(version: string, ddragonId: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${ddragonId}.png`;
}
export function champSplashUrl(ddragonId: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${ddragonId}_0.jpg`;
}
export function profileIconUrl(version: string, iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}

const QUEUE_NAMES: Record<number, string> = {
  400: "Normal Draft", 420: "Ranked Solo/Duo", 430: "Normal Blind", 440: "Ranked Flex",
  450: "ARAM", 480: "Swiftplay", 490: "Quickplay", 700: "Clash", 720: "ARAM Clash",
  900: "URF", 1020: "One for All", 1700: "Arena", 1710: "Arena", 1900: "URF",
};
const MASTERY_TITLE = ["", "", "", "", "", "Honored", "Revered", "Legendary", "Master", "Grandmaster", "The One"];

// ---------- Snapshot ----------
export type LolChampion = {
  championId: number; name: string; iconUrl: string; splashUrl: string;
  level: number; points: number; lastPlayed: number | null; masteryTitle: string;
  tokensEarned?: number; chestGranted?: boolean;
};
export type LolMatchSummary = {
  matchId: string; queue: string; win: boolean; remake: boolean;
  champion: string; championIconUrl: string; champLevel: number;
  kills: number; deaths: number; assists: number; kda: string;
  cs: number; csPerMin: number; goldEarned: number; damage: number; visionScore: number;
  position: string; durationSec: number; gameEndMs: number;
};
export type LolLive = {
  inGame: boolean; gameMode?: string; queue?: string;
  champion?: string; championIconUrl?: string; startMs?: number;
};
export type LolSnapshot = {
  ok: boolean; error?: string;
  profileIconUrl: string | null; summonerLevel: number | null;
  live: LolLive | null; champions: LolChampion[]; matches: LolMatchSummary[];
  totalMasteryChampions?: number;
};

const snapCache = new Map<string, { v: LolSnapshot; exp: number }>();
const matchCache = new Map<string, { v: LolMatchDetail; exp: number }>();

// Full snapshot for one account: profile icon, level, live game, top champions,
// recent matches. Cached ~5 min per puuid.
export async function getLolSnapshot(puuid: string, platform: string): Promise<LolSnapshot> {
  const key = process.env.RIOT_API_KEY;
  if (!key) return emptySnap("Live League data isn't configured yet.");
  const ck = `${platform}:${puuid}`;
  const hit = snapCache.get(ck);
  if (hit && hit.exp > Date.now()) return hit.v;

  const cluster = riotCluster(platform);
  let dd: { version: string; byId: Map<number, Champ> };
  try { dd = await dataDragon(); } catch { dd = { version: "14.1.1", byId: new Map() }; }
  const nameOf = (id: number) => dd.byId.get(id)?.name ?? `Champion ${id}`;
  const ddId = (id: number, fallback?: string) => dd.byId.get(id)?.id ?? fallback ?? "";

  // Summoner (profile icon + level), mastery, and match ids in parallel — each isolated.
  const [summoner, masteryRaw, matchIds] = await Promise.all([
    rj<any>(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`, key).catch(() => null),
    rj<any[]>(`https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=5`, key).catch(() => []),
    rj<string[]>(`https://${cluster}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=5`, key).catch(() => []),
  ]);

  const champions: LolChampion[] = (masteryRaw ?? []).map((m) => {
    const id = Number(m.championId);
    const idStr = ddId(id);
    return {
      championId: id, name: nameOf(id), iconUrl: champIconUrl(dd.version, idStr), splashUrl: champSplashUrl(idStr),
      level: Number(m.championLevel ?? 0), points: Number(m.championPoints ?? 0),
      lastPlayed: m.lastPlayTime ? Number(m.lastPlayTime) : null,
      masteryTitle: MASTERY_TITLE[Number(m.championLevel ?? 0)] ?? "",
      tokensEarned: m.tokensEarned != null ? Number(m.tokensEarned) : undefined,
      chestGranted: m.chestGranted ?? undefined,
    };
  });

  // Match details (last 5) — parallel, each isolated. Immutable, so cache long.
  const matches = (await Promise.all(
    (matchIds ?? []).slice(0, 5).map((mid) => matchSummaryFor(mid, puuid, cluster, key, dd)),
  )).filter((m): m is LolMatchSummary => !!m);

  // Live game (SPECTATOR-V5) — 404 when not in a game.
  const live = await getLolLive(puuid, platform, key, dd);

  const snap: LolSnapshot = {
    ok: true,
    profileIconUrl: summoner?.profileIconId != null ? profileIconUrl(dd.version, Number(summoner.profileIconId)) : null,
    summonerLevel: summoner?.summonerLevel != null ? Number(summoner.summonerLevel) : null,
    live, champions, matches,
  };
  snapCache.set(ck, { v: snap, exp: Date.now() + 5 * 60_000 });
  return snap;
}

async function getLolLive(puuid: string, platform: string, key: string, dd: { version: string; byId: Map<number, Champ> }): Promise<LolLive | null> {
  try {
    const g = await rj<any>(`https://${platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`, key, 5000);
    const me = (g.participants ?? []).find((p: any) => p.puuid === puuid);
    const cid = Number(me?.championId ?? 0);
    return {
      inGame: true,
      gameMode: g.gameMode, queue: QUEUE_NAMES[Number(g.gameQueueConfigId)] ?? g.gameMode,
      champion: dd.byId.get(cid)?.name, championIconUrl: cid ? champIconUrl(dd.version, dd.byId.get(cid)?.id ?? "") : undefined,
      startMs: g.gameStartTime ? Number(g.gameStartTime) : undefined,
    };
  } catch { return { inGame: false }; }
}

async function matchSummaryFor(matchId: string, puuid: string, cluster: string, key: string, dd: { version: string; byId: Map<number, Champ> }): Promise<LolMatchSummary | null> {
  try {
    const detail = await getMatchRaw(matchId, cluster, key);
    const info = detail.info;
    const p = (info.participants ?? []).find((x: any) => x.puuid === puuid);
    if (!p) return null;
    let dur = Number(info.gameDuration ?? 0);
    if (dur > 100000) dur = Math.round(dur / 1000); // legacy ms guard
    const cs = Number(p.totalMinionsKilled ?? 0) + Number(p.neutralMinionsKilled ?? 0);
    const cid = Number(p.championId);
    const deaths = Number(p.deaths ?? 0);
    return {
      matchId, queue: QUEUE_NAMES[Number(info.queueId)] ?? info.gameMode, win: !!p.win,
      remake: !!p.gameEndedInEarlySurrender || dur < 300,
      champion: dd.byId.get(cid)?.name ?? p.championName, championIconUrl: champIconUrl(dd.version, dd.byId.get(cid)?.id ?? p.championName),
      champLevel: Number(p.champLevel ?? 0),
      kills: Number(p.kills ?? 0), deaths, assists: Number(p.assists ?? 0),
      kda: ((Number(p.kills ?? 0) + Number(p.assists ?? 0)) / Math.max(1, deaths)).toFixed(2),
      cs, csPerMin: dur ? Math.round((cs / (dur / 60)) * 10) / 10 : 0,
      goldEarned: Number(p.goldEarned ?? 0), damage: Number(p.totalDamageDealtToChampions ?? 0),
      visionScore: Number(p.visionScore ?? 0), position: p.teamPosition || p.individualPosition || "",
      durationSec: dur, gameEndMs: Number(info.gameEndTimestamp ?? info.gameCreation ?? 0),
    };
  } catch { return null; }
}

// ---------- Match detail (all 10 players) ----------
export type LolMatchPlayer = {
  puuid: string; name: string; champion: string; championIconUrl: string; champLevel: number;
  kills: number; deaths: number; assists: number; cs: number; damage: number; gold: number;
  visionScore: number; win: boolean; team: number; position: string; items: string[]; isSubject: boolean;
};
export type LolMatchDetail = {
  ok: boolean; error?: string; matchId: string; queue: string; gameMode: string;
  durationSec: number; gameEndMs: number; win: boolean;
  teams: { team: number; win: boolean; players: LolMatchPlayer[] }[];
};

async function getMatchRaw(matchId: string, cluster: string, key: string): Promise<any> {
  return rj<any>(`https://${cluster}.api.riotgames.com/lol/match/v5/matches/${matchId}`, key, 8000);
}

// Full breakdown of one match: both teams, every player, items — for the
// click-through detail view. Matches are immutable → cached 6h.
export async function getLolMatchDetail(matchId: string, puuid: string, platform: string): Promise<LolMatchDetail> {
  const key = process.env.RIOT_API_KEY;
  if (!key) return { ok: false, error: "not configured", matchId, queue: "", gameMode: "", durationSec: 0, gameEndMs: 0, win: false, teams: [] };
  const ck = `${matchId}:${puuid}`;
  const hit = matchCache.get(ck);
  if (hit && hit.exp > Date.now()) return hit.v;

  const cluster = riotCluster(platform);
  let dd: { version: string; byId: Map<number, Champ> };
  try { dd = await dataDragon(); } catch { dd = { version: "14.1.1", byId: new Map() }; }
  try {
    const detail = await getMatchRaw(matchId, cluster, key);
    const info = detail.info;
    let dur = Number(info.gameDuration ?? 0);
    if (dur > 100000) dur = Math.round(dur / 1000);
    const version = dd.version;
    const players: LolMatchPlayer[] = (info.participants ?? []).map((p: any) => {
      const cid = Number(p.championId);
      const items: string[] = [];
      for (let i = 0; i < 7; i++) { const it = Number(p[`item${i}`] ?? 0); if (it) items.push(`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${it}.png`); }
      return {
        puuid: p.puuid, name: p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline}` : (p.summonerName || "Player"),
        champion: dd.byId.get(cid)?.name ?? p.championName, championIconUrl: champIconUrl(version, dd.byId.get(cid)?.id ?? p.championName),
        champLevel: Number(p.champLevel ?? 0),
        kills: Number(p.kills ?? 0), deaths: Number(p.deaths ?? 0), assists: Number(p.assists ?? 0),
        cs: Number(p.totalMinionsKilled ?? 0) + Number(p.neutralMinionsKilled ?? 0),
        damage: Number(p.totalDamageDealtToChampions ?? 0), gold: Number(p.goldEarned ?? 0),
        visionScore: Number(p.visionScore ?? 0), win: !!p.win, team: Number(p.teamId ?? 100),
        position: p.teamPosition || "", items, isSubject: p.puuid === puuid,
      };
    });
    const subject = players.find((p) => p.isSubject);
    const teamsMap = new Map<number, LolMatchPlayer[]>();
    for (const p of players) { if (!teamsMap.has(p.team)) teamsMap.set(p.team, []); teamsMap.get(p.team)!.push(p); }
    const out: LolMatchDetail = {
      ok: true, matchId, queue: QUEUE_NAMES[Number(info.queueId)] ?? info.gameMode, gameMode: info.gameMode,
      durationSec: dur, gameEndMs: Number(info.gameEndTimestamp ?? info.gameCreation ?? 0), win: subject?.win ?? false,
      teams: [...teamsMap.entries()].map(([team, ps]) => ({ team, win: ps[0]?.win ?? false, players: ps })),
    };
    matchCache.set(ck, { v: out, exp: Date.now() + 6 * 3600_000 });
    return out;
  } catch (e) {
    return { ok: false, error: String(e), matchId, queue: "", gameMode: "", durationSec: 0, gameEndMs: 0, win: false, teams: [] };
  }
}

function emptySnap(error: string): LolSnapshot {
  return { ok: false, error, profileIconUrl: null, summonerLevel: null, live: null, champions: [], matches: [] };
}
