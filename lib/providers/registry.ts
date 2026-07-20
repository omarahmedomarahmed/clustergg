export type MetricDef = {
  key: string;
  label: string;
  unit?: string;
  higherIsBetter?: boolean;
  rankLabels?: string[];
};

export type ProviderDef = {
  id: string;
  name: string;
  game: string;
  glyph: string;
  color: string;
  authType: "public" | "apikey" | "oauth" | "openid" | "vc";
  envVars: string[];
  identifierLabel: string;
  identifierHint?: string;
  capabilities: MetricDef[];
  phase: 1 | 2 | 3;
  docsUrl?: string;
  legalFlag?: string;
  identityOnly?: boolean;
  // Special two-step in-game verification-code link flow (Mobile Legends).
  linkFlow?: "vc";
};

export const PROVIDERS: ProviderDef[] = [
  // ===== Live with zero configuration (public APIs) =====
  {
    id: "chesscom", name: "Chess.com", game: "Chess", glyph: "♞", color: "#7fa650",
    authType: "public", envVars: [], identifierLabel: "Chess.com username",
    identifierHint: "e.g. hikaru", phase: 1, docsUrl: "https://www.chess.com/news/view/published-data-api",
    capabilities: [
      { key: "rapid_rating", label: "Rapid rating", higherIsBetter: true },
      { key: "blitz_rating", label: "Blitz rating", higherIsBetter: true },
      { key: "bullet_rating", label: "Bullet rating", higherIsBetter: true },
      { key: "puzzle_rating", label: "Puzzle rating", higherIsBetter: true },
      { key: "wins", label: "Total wins", higherIsBetter: true },
      { key: "losses", label: "Total losses" },
      { key: "games", label: "Games played", higherIsBetter: true },
    ],
  },
  {
    id: "lichess", name: "Lichess", game: "Chess", glyph: "♘", color: "#f0f0f0",
    authType: "public", envVars: [], identifierLabel: "Lichess username",
    identifierHint: "e.g. DrNykterstein", phase: 1, docsUrl: "https://lichess.org/api",
    capabilities: [
      { key: "blitz_rating", label: "Blitz rating", higherIsBetter: true },
      { key: "rapid_rating", label: "Rapid rating", higherIsBetter: true },
      { key: "bullet_rating", label: "Bullet rating", higherIsBetter: true },
      { key: "puzzle_rating", label: "Puzzle rating", higherIsBetter: true },
      { key: "games", label: "Games played", higherIsBetter: true },
      { key: "wins", label: "Total wins", higherIsBetter: true },
    ],
  },
  {
    id: "opendota", name: "Dota 2 (OpenDota)", game: "Dota 2", glyph: "⚔", color: "#c23c2a",
    authType: "public", envVars: [], identifierLabel: "Dota 2 Friend ID (account ID)",
    identifierHint: "e.g. 105248644 — find it in your Dota profile", phase: 1, docsUrl: "https://docs.opendota.com",
    capabilities: [
      { key: "wins", label: "Wins", higherIsBetter: true },
      { key: "losses", label: "Losses" },
      { key: "win_rate", label: "Win rate %", unit: "%", higherIsBetter: true },
      { key: "rank_tier", label: "Rank tier", higherIsBetter: true },
    ],
  },
  {
    id: "speedruncom", name: "Speedrun.com", game: "Speedrunning", glyph: "⏱", color: "#f9b234",
    authType: "public", envVars: [], identifierLabel: "Speedrun.com username",
    identifierHint: "e.g. Niftski", phase: 1, docsUrl: "https://github.com/speedruncomorg/api",
    capabilities: [
      { key: "personal_bests", label: "Personal bests", higherIsBetter: true },
      { key: "world_records", label: "World records (1st places)", higherIsBetter: true },
      { key: "podiums", label: "Podium finishes", higherIsBetter: true },
    ],
  },
  {
    id: "roblox", name: "Roblox", game: "Roblox", glyph: "◼", color: "#e2231a",
    authType: "public", envVars: [], identifierLabel: "Roblox username",
    identifierHint: "e.g. builderman", phase: 1, docsUrl: "https://users.roblox.com/docs",
    capabilities: [
      { key: "followers", label: "Followers", higherIsBetter: true },
      { key: "friends", label: "Friends", higherIsBetter: true },
      { key: "account_age_days", label: "Account age (days)", higherIsBetter: true },
    ],
  },
  // ===== Unlock with a single API key =====
  {
    id: "steam", name: "Steam", game: "Steam", glyph: "🎮", color: "#66c0f4",
    authType: "apikey", envVars: ["STEAM_API_KEY"], identifierLabel: "SteamID64 or vanity URL name",
    identifierHint: "e.g. 76561197960435530 or gabelogannewell", phase: 2,
    docsUrl: "https://steamcommunity.com/dev",
    capabilities: [
      { key: "steam_level", label: "Steam level", higherIsBetter: true },
      { key: "games_owned", label: "Games owned", higherIsBetter: true },
      { key: "playtime_hours", label: "Total playtime (h)", unit: "h", higherIsBetter: true },
    ],
  },
  {
    id: "riot-lol", name: "League of Legends", game: "League of Legends", glyph: "⚡", color: "#c89b3c",
    authType: "apikey", envVars: ["RIOT_API_KEY"], identifierLabel: "Riot ID",
    identifierHint: "GameName#TAG — e.g. Faker#KR1 (region in provider settings)", phase: 1,
    docsUrl: "https://developer.riotgames.com",
    capabilities: [
      { key: "solo_lp", label: "Solo/Duo LP", higherIsBetter: true },
      { key: "solo_tier", label: "Solo/Duo tier", higherIsBetter: true, rankLabels: ["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER"] },
      { key: "flex_tier", label: "Flex 5v5 tier", higherIsBetter: true, rankLabels: ["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER"] },
      { key: "wins", label: "Ranked wins", higherIsBetter: true },
      { key: "losses", label: "Ranked losses" },
      { key: "win_rate", label: "Win rate %", unit: "%", higherIsBetter: true },
      { key: "summoner_level", label: "Summoner level", higherIsBetter: true },
    ],
  },
  {
    id: "riot-valorant", name: "VALORANT", game: "VALORANT", glyph: "▲", color: "#fd4556",
    authType: "apikey", envVars: ["RIOT_API_KEY"], identifierLabel: "Riot ID",
    identifierHint: "GameName#TAG — VALORANT API requires production key approval", phase: 1,
    docsUrl: "https://developer.riotgames.com",
    legalFlag: "VAL-* endpoints require Riot production API approval (RSO). Identity resolution works with a dev key.",
    capabilities: [
      { key: "account_level", label: "Account level", higherIsBetter: true },
    ],
    identityOnly: true,
  },
  {
    id: "fortnite", name: "Fortnite", game: "Fortnite", glyph: "🪂", color: "#9d4dff",
    authType: "apikey", envVars: ["FORTNITE_API_KEY"], identifierLabel: "Epic display name",
    identifierHint: "Public stats must be enabled in Fortnite settings", phase: 1,
    docsUrl: "https://fortnite-api.com",
    capabilities: [
      { key: "wins", label: "Victory Royales", higherIsBetter: true },
      { key: "kills", label: "Eliminations", higherIsBetter: true },
      { key: "kd_ratio", label: "K/D ratio", higherIsBetter: true },
      { key: "matches", label: "Matches played", higherIsBetter: true },
      { key: "win_rate", label: "Win rate %", unit: "%", higherIsBetter: true },
      { key: "battle_pass_level", label: "Battle pass level", higherIsBetter: true },
    ],
  },
  {
    id: "hypixel", name: "Hypixel (Minecraft)", game: "Minecraft", glyph: "⛏", color: "#ffaa00",
    authType: "apikey", envVars: ["HYPIXEL_API_KEY"], identifierLabel: "Minecraft username",
    phase: 2, docsUrl: "https://api.hypixel.net",
    capabilities: [
      { key: "network_level", label: "Network level", higherIsBetter: true },
      { key: "karma", label: "Karma", higherIsBetter: true },
      { key: "achievement_points", label: "Achievement points", higherIsBetter: true },
    ],
  },
  {
    id: "pubg", name: "PUBG", game: "PUBG: Battlegrounds", glyph: "🍳", color: "#f2a900",
    authType: "apikey", envVars: ["PUBG_API_KEY"], identifierLabel: "PUBG player name (case-sensitive)",
    phase: 2, docsUrl: "https://developer.pubg.com",
    capabilities: [
      { key: "wins", label: "Wins", higherIsBetter: true },
      { key: "kills", label: "Kills", higherIsBetter: true },
      { key: "kd_ratio", label: "K/D ratio", higherIsBetter: true },
      { key: "top10s", label: "Top 10 finishes", higherIsBetter: true },
    ],
  },
  {
    id: "faceit", name: "CS2 (FACEIT)", game: "Counter-Strike 2", glyph: "🔫", color: "#ff5500",
    authType: "apikey", envVars: ["FACEIT_API_KEY"], identifierLabel: "FACEIT nickname",
    phase: 2, docsUrl: "https://developers.faceit.com",
    capabilities: [
      { key: "elo", label: "FACEIT Elo", higherIsBetter: true },
      { key: "skill_level", label: "Skill level", higherIsBetter: true },
    ],
  },
  {
    id: "clashofclans", name: "Clash of Clans", game: "Clash of Clans", glyph: "🏰", color: "#f5a623",
    authType: "apikey", envVars: ["SUPERCELL_COC_TOKEN"], identifierLabel: "Player tag",
    identifierHint: "e.g. #2PP", phase: 3, docsUrl: "https://developer.clashofclans.com",
    capabilities: [
      { key: "trophies", label: "Trophies", higherIsBetter: true },
      { key: "town_hall", label: "Town Hall level", higherIsBetter: true },
      { key: "war_stars", label: "War stars", higherIsBetter: true },
    ],
  },
  {
    id: "clashroyale", name: "Clash Royale", game: "Clash Royale", glyph: "👑", color: "#3b6ff7",
    authType: "apikey", envVars: ["SUPERCELL_CR_TOKEN"], identifierLabel: "Player tag",
    identifierHint: "e.g. #8L9L9GL", phase: 3, docsUrl: "https://developer.clashroyale.com",
    capabilities: [
      { key: "trophies", label: "Trophies", higherIsBetter: true },
      { key: "wins", label: "Wins", higherIsBetter: true },
      { key: "best_trophies", label: "Best trophies", higherIsBetter: true },
    ],
  },
  {
    id: "brawlstars", name: "Brawl Stars", game: "Brawl Stars", glyph: "⭐", color: "#ffcd00",
    authType: "apikey", envVars: ["SUPERCELL_BRAWL_TOKEN"], identifierLabel: "Player tag",
    phase: 3, docsUrl: "https://developer.brawlstars.com",
    capabilities: [
      { key: "trophies", label: "Trophies", higherIsBetter: true },
      { key: "highest_trophies", label: "Highest trophies", higherIsBetter: true },
      { key: "victories_3v3", label: "3v3 victories", higherIsBetter: true },
    ],
  },
  {
    id: "xbox", name: "Xbox Live", game: "Xbox", glyph: "🟢", color: "#107c10",
    authType: "apikey", envVars: ["OPENXBL_API_KEY"], identifierLabel: "Xbox gamertag",
    phase: 2, docsUrl: "https://xbl.io",
    legalFlag: "Uses OpenXBL community wrapper — review its ToS before production use.",
    capabilities: [
      { key: "gamerscore", label: "Gamerscore", higherIsBetter: true },
      { key: "followers", label: "Followers", higherIsBetter: true },
    ],
  },
  {
    id: "osu", name: "osu!", game: "osu!", glyph: "🎯", color: "#ff66aa",
    authType: "apikey", envVars: ["OSU_CLIENT_ID", "OSU_CLIENT_SECRET"], identifierLabel: "osu! username",
    phase: 2, docsUrl: "https://osu.ppy.sh/docs/index.html",
    capabilities: [
      { key: "pp", label: "Performance points", higherIsBetter: true },
      { key: "global_rank", label: "Global rank" },
      { key: "accuracy", label: "Hit accuracy %", unit: "%", higherIsBetter: true },
      { key: "play_count", label: "Play count", higherIsBetter: true },
    ],
  },
  {
    id: "apex", name: "Apex Legends (TRN)", game: "Apex Legends", glyph: "🔺", color: "#da292a",
    authType: "apikey", envVars: ["TRN_API_KEY"], identifierLabel: "Origin/EA name",
    phase: 2, docsUrl: "https://tracker.gg/developers",
    capabilities: [
      { key: "rank_score", label: "Rank score (RP)", higherIsBetter: true },
      { key: "level", label: "Level", higherIsBetter: true },
      { key: "kills", label: "Lifetime kills", higherIsBetter: true },
    ],
  },
  {
    id: "battlenet", name: "Battle.net", game: "Blizzard", glyph: "❄", color: "#00aeff",
    authType: "oauth", envVars: ["BATTLENET_CLIENT_ID", "BATTLENET_CLIENT_SECRET"],
    identifierLabel: "BattleTag", identifierHint: "e.g. Player#1234", phase: 2,
    docsUrl: "https://develop.battle.net", identityOnly: true,
    capabilities: [{ key: "connected", label: "Account connected" }],
  },
  {
    id: "epic", name: "Epic Games", game: "Epic", glyph: "🛸", color: "#ffffff",
    authType: "oauth", envVars: ["EPIC_CLIENT_ID", "EPIC_CLIENT_SECRET"],
    identifierLabel: "Epic account ID", phase: 1, docsUrl: "https://dev.epicgames.com",
    identityOnly: true,
    legalFlag: "EOS provides identity; Fortnite stats come via the Fortnite provider.",
    capabilities: [{ key: "connected", label: "Account connected" }],
  },
  {
    id: "discord", name: "Discord", game: "Social", glyph: "💬", color: "#5865f2",
    authType: "oauth", envVars: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
    identifierLabel: "Discord account", phase: 1, docsUrl: "https://discord.com/developers",
    identityOnly: true,
    capabilities: [{ key: "connected", label: "Account connected" }],
  },
  {
    id: "mobile-legends", name: "Mobile Legends", game: "Mobile Legends", glyph: "🛡", color: "#f0a500",
    authType: "vc", envVars: ["MLBB_API_BASE"], linkFlow: "vc",
    identifierLabel: "Player ID + Server (Zone) ID",
    identifierHint: "Found in-game under Profile — e.g. ID 12345678 (1234)", phase: 3,
    docsUrl: "https://github.com/ridwaanhall/api-mobilelegends",
    legalFlag: "Unofficial community API (self-hosted). Uses Moonton's in-game verification code — no password shared. May break if Moonton changes their systems; previously synced stats are always preserved.",
    capabilities: [
      { key: "level", label: "Account level", higherIsBetter: true },
      { key: "wins", label: "Total wins", higherIsBetter: true },
      { key: "matches", label: "Matches played", higherIsBetter: true },
      { key: "win_rate", label: "Win rate %", unit: "%", higherIsBetter: true },
      { key: "mvp", label: "MVP count", higherIsBetter: true },
    ],
  },
  // ===== Phase 3 — flagged, not built (legal risk per plan §15) =====
  {
    id: "psn", name: "PlayStation Network", game: "PlayStation", glyph: "🔷", color: "#0070d1",
    authType: "apikey", envVars: ["PSN_NPSSO_PROXY_KEY"], identifierLabel: "PSN online ID",
    phase: 3, identityOnly: true,
    legalFlag: "No official public API. Unofficial wrappers risk account suspension — requires legal sign-off before enabling. Manual proof-based challenges recommended instead.",
    capabilities: [],
  },
  {
    id: "activision", name: "Call of Duty", game: "Call of Duty", glyph: "🎖", color: "#8aff60",
    authType: "apikey", envVars: ["ACTIVISION_UNOFFICIAL_KEY"], identifierLabel: "Activision ID",
    phase: 3, identityOnly: true,
    legalFlag: "Unofficial API only — requires legal sign-off before enabling. Manual proof-based challenges recommended instead.",
    capabilities: [],
  },
];

export function getProvider(providerId: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === providerId);
}

export function isProviderLive(p: ProviderDef): boolean {
  if (p.legalFlag && p.phase === 3 && (p.id === "psn" || p.id === "activision")) return false;
  if (p.authType === "public") return true;
  return p.envVars.every((v) => !!process.env[v]);
}

export function liveProviders(): ProviderDef[] {
  return PROVIDERS.filter(isProviderLive);
}

export const GAMES = Array.from(new Set(PROVIDERS.filter((p) => !p.identityOnly).map((p) => p.game)));
