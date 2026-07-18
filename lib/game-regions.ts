// Per-game canonical server/region lists — the game's OWN server names (e.g.
// LoL EUW1/NA1/KR, VALORANT AP, PUBG KRJP), used as the starting pins on a
// game's planet before any linked accounts carry a live region code. This
// replaces the generic macro-regions (NA/EU/Asia/…) so pins always read as the
// game's real servers. `x`/`y` are default globe positions (%), draggable by admin.

export type GameRegion = { code: string; label: string; short: string; color: string; x: number; y: number };

const C = { blue: "#38bdf8", green: "#34d399", violet: "#a78bfa", amber: "#fbbf24", pink: "#f472b6", red: "#f87171", cyan: "#22d3ee" };

// Keyed by a normalized game name (lowercase, alphanumerics only).
const BY_GAME: Record<string, GameRegion[]> = {
  leagueoflegends: [
    { code: "na1", label: "North America", short: "NA", color: C.blue, x: 26, y: 34 },
    { code: "br1", label: "Brazil", short: "BR", color: C.green, x: 36, y: 70 },
    { code: "la2", label: "LAS", short: "LAS", color: C.green, x: 32, y: 78 },
    { code: "euw1", label: "EU West", short: "EUW", color: C.violet, x: 50, y: 26 },
    { code: "eun1", label: "EU Nordic & East", short: "EUNE", color: C.violet, x: 57, y: 22 },
    { code: "tr1", label: "Turkey", short: "TR", color: C.amber, x: 62, y: 40 },
    { code: "ru", label: "Russia", short: "RU", color: C.pink, x: 68, y: 24 },
    { code: "kr", label: "Korea", short: "KR", color: C.red, x: 82, y: 38 },
    { code: "jp1", label: "Japan", short: "JP", color: C.red, x: 86, y: 44 },
    { code: "oc1", label: "Oceania", short: "OCE", color: C.cyan, x: 84, y: 74 },
  ],
  valorant: [
    { code: "na", label: "North America", short: "NA", color: C.blue, x: 26, y: 36 },
    { code: "br", label: "Brazil", short: "BR", color: C.green, x: 36, y: 70 },
    { code: "latam", label: "Latin America", short: "LATAM", color: C.green, x: 30, y: 60 },
    { code: "eu", label: "Europe", short: "EU", color: C.violet, x: 52, y: 28 },
    { code: "ap", label: "Asia Pacific", short: "AP", color: C.red, x: 80, y: 46 },
    { code: "kr", label: "Korea", short: "KR", color: C.pink, x: 84, y: 38 },
  ],
  counterstrike2: [
    { code: "eu", label: "Europe", short: "EU", color: C.violet, x: 52, y: 28 },
    { code: "na", label: "North America", short: "NA", color: C.blue, x: 26, y: 36 },
    { code: "sa", label: "South America", short: "SA", color: C.green, x: 35, y: 70 },
    { code: "sea", label: "SE Asia", short: "SEA", color: C.red, x: 80, y: 56 },
    { code: "oce", label: "Oceania", short: "OCE", color: C.cyan, x: 84, y: 74 },
  ],
  pubgbattlegrounds: [
    { code: "na", label: "North America", short: "NA", color: C.blue, x: 26, y: 36 },
    { code: "eu", label: "Europe", short: "EU", color: C.violet, x: 52, y: 28 },
    { code: "sa", label: "South America", short: "SA", color: C.green, x: 35, y: 70 },
    { code: "as", label: "Asia", short: "AS", color: C.red, x: 78, y: 44 },
    { code: "krjp", label: "Korea / Japan", short: "KR/JP", color: C.pink, x: 85, y: 40 },
    { code: "sea", label: "SE Asia", short: "SEA", color: C.amber, x: 80, y: 58 },
    { code: "oc", label: "Oceania", short: "OC", color: C.cyan, x: 84, y: 74 },
  ],
  dota2: [
    { code: "use", label: "US East", short: "USE", color: C.blue, x: 30, y: 34 },
    { code: "usw", label: "US West", short: "USW", color: C.blue, x: 22, y: 36 },
    { code: "euw", label: "EU West", short: "EUW", color: C.violet, x: 50, y: 26 },
    { code: "eue", label: "EU East", short: "EUE", color: C.violet, x: 57, y: 24 },
    { code: "sea", label: "SE Asia", short: "SEA", color: C.red, x: 80, y: 56 },
    { code: "cn", label: "China", short: "CN", color: C.pink, x: 80, y: 40 },
    { code: "sa", label: "South America", short: "SA", color: C.green, x: 35, y: 70 },
    { code: "aus", label: "Australia", short: "AUS", color: C.cyan, x: 84, y: 74 },
  ],
  fortnite: [
    { code: "nae", label: "NA East", short: "NAE", color: C.blue, x: 30, y: 34 },
    { code: "naw", label: "NA West", short: "NAW", color: C.blue, x: 22, y: 36 },
    { code: "eu", label: "Europe", short: "EU", color: C.violet, x: 52, y: 28 },
    { code: "br", label: "Brazil", short: "BR", color: C.green, x: 36, y: 70 },
    { code: "asia", label: "Asia", short: "ASIA", color: C.red, x: 80, y: 46 },
    { code: "me", label: "Middle East", short: "ME", color: C.amber, x: 62, y: 46 },
    { code: "oce", label: "Oceania", short: "OCE", color: C.cyan, x: 84, y: 74 },
  ],
  apexlegends: [
    { code: "na", label: "North America", short: "NA", color: C.blue, x: 26, y: 36 },
    { code: "eu", label: "Europe", short: "EU", color: C.violet, x: 52, y: 28 },
    { code: "asia", label: "Asia", short: "ASIA", color: C.red, x: 80, y: 46 },
    { code: "sa", label: "South America", short: "SA", color: C.green, x: 35, y: 70 },
    { code: "oce", label: "Oceania", short: "OCE", color: C.cyan, x: 84, y: 74 },
  ],
};

// A neutral default for games we don't have a specific server list for yet.
const DEFAULT_REGIONS: GameRegion[] = [
  { code: "na", label: "North America", short: "NA", color: C.blue, x: 28, y: 34 },
  { code: "sa", label: "South America", short: "SA", color: C.green, x: 37, y: 70 },
  { code: "eu", label: "Europe", short: "EU", color: C.violet, x: 51, y: 26 },
  { code: "me", label: "Middle East", short: "ME", color: C.pink, x: 64, y: 44 },
  { code: "asia", label: "Asia", short: "AS", color: C.red, x: 76, y: 40 },
  { code: "oce", label: "Oceania", short: "OCE", color: C.cyan, x: 84, y: 74 },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// True when two game names refer to the same game ("PUBG" ≡ "PUBG: Battlegrounds").
export function sameGame(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
}

// The game's primary/default region code — used to bucket accounts whose region
// code is missing so those gamers still appear on the planet.
export function defaultRegionCode(gameName: string): string {
  return regionsForGame(gameName)[0]?.code ?? "na";
}

export function regionsForGame(gameName: string): GameRegion[] {
  const t = norm(gameName);
  if (BY_GAME[t]) return BY_GAME[t];
  // tolerant prefix match ("PUBG: Battlegrounds" → pubgbattlegrounds, "PUBG" → pubg…)
  const hit = Object.keys(BY_GAME).find((k) => k.startsWith(t) || t.startsWith(k));
  return hit ? BY_GAME[hit] : DEFAULT_REGIONS;
}

// Label lookup for a game's region code (falls back to the upper-cased code).
export function regionLabelForGame(gameName: string, code: string): string {
  const r = regionsForGame(gameName).find((x) => x.code === code.toLowerCase());
  return r?.label ?? code.toUpperCase();
}
