// The six macro-regions every game planet is divided into. `x`/`y` are the
// hotspot anchor as a percentage of the planet sphere (front-facing view), used
// to place clickable region markers on the planet hero.
export type RegionKey = "na" | "sa" | "eu" | "africa" | "me" | "asia";

export const REGIONS: { key: RegionKey; label: string; short: string; color: string; x: number; y: number }[] = [
  { key: "na",     label: "North America", short: "NA",     color: "#38bdf8", x: 28, y: 34 },
  { key: "sa",     label: "South America", short: "SA",     color: "#34d399", x: 37, y: 70 },
  { key: "eu",     label: "Europe",        short: "EU",     color: "#a78bfa", x: 51, y: 26 },
  { key: "africa", label: "Africa",        short: "AF",     color: "#fbbf24", x: 53, y: 58 },
  { key: "me",     label: "Middle East",   short: "ME",     color: "#f472b6", x: 64, y: 44 },
  { key: "asia",   label: "Asia",          short: "AS",     color: "#f87171", x: 76, y: 40 },
];

// Riot/provider region codes → macro-region.
const PROVIDER_REGION: Record<string, RegionKey> = {
  na: "na", nam: "na", latam: "sa", br: "sa", las: "sa", lan: "sa",
  euw: "eu", eune: "eu", eu: "eu", tr: "me", ru: "eu", me: "me",
  kr: "asia", jp: "asia", oce: "asia", sea: "asia", ap: "asia", tw: "asia", vn: "asia",
};

// ISO-3166 alpha-2 country → macro-region (common gaming countries; falls back
// to null when unknown so it just doesn't count toward a region).
const COUNTRY_REGION: Record<string, RegionKey> = {
  US: "na", CA: "na", MX: "sa",
  BR: "sa", AR: "sa", CL: "sa", CO: "sa", PE: "sa", UY: "sa", VE: "sa",
  GB: "eu", IE: "eu", FR: "eu", DE: "eu", ES: "eu", PT: "eu", IT: "eu", NL: "eu", BE: "eu",
  SE: "eu", NO: "eu", DK: "eu", FI: "eu", PL: "eu", CZ: "eu", RO: "eu", GR: "eu", UA: "eu",
  RU: "eu", AT: "eu", CH: "eu", HU: "eu", BG: "eu", HR: "eu", RS: "eu", SK: "eu",
  TR: "me", SA: "me", AE: "me", IL: "me", IR: "me", IQ: "me", EG: "me", QA: "me", KW: "me", JO: "me", LB: "me",
  ZA: "africa", NG: "africa", KE: "africa", MA: "africa", DZ: "africa", TN: "africa", GH: "africa",
  KR: "asia", JP: "asia", CN: "asia", TW: "asia", HK: "asia", SG: "asia", MY: "asia", TH: "asia",
  VN: "asia", PH: "asia", ID: "asia", IN: "asia", PK: "asia", BD: "asia", AU: "asia", NZ: "asia",
};

export function toRegion(providerRegion?: string | null, country?: string | null): RegionKey | null {
  if (providerRegion) {
    const r = PROVIDER_REGION[providerRegion.toLowerCase()];
    if (r) return r;
  }
  if (country) {
    const r = COUNTRY_REGION[country.toUpperCase()];
    if (r) return r;
  }
  return null;
}

export type RegionGamer = { name: string; slug: string; avatar?: string | null; ign?: string; accountId?: string; provider?: string; country?: string | null };
export type RegionStat = { key: string; label: string; short: string; color: string; x: number; y: number; count: number; gamers: RegionGamer[] };

export function emptyRegionStats(): RegionStat[] {
  return REGIONS.map((r) => ({ ...r, count: 0, gamers: [] }));
}

// Human labels for the real server/region codes providers return through their
// APIs (Riot platform routes, VALORANT/other affinities, etc.). Anything not
// listed falls back to the upper-cased code so new servers still render.
export const REGION_LABELS: Record<string, string> = {
  na: "North America", na1: "North America", nam: "North America",
  br: "Brazil", br1: "Brazil", lan: "LAN", la1: "LAN", las: "LAS", la2: "LAS", latam: "Latin America",
  euw: "EU West", euw1: "EU West", eune: "EU Nordic & East", eun1: "EU Nordic & East", eu: "Europe",
  tr: "Türkiye", tr1: "Türkiye", ru: "Russia",
  kr: "Korea", jp: "Japan", jp1: "Japan",
  oce: "Oceania", oc1: "Oceania", sea: "SE Asia", ap: "Asia-Pacific",
  sg: "Singapore", sg2: "Singapore", th2: "Thailand", tw: "Taiwan", tw2: "Taiwan", vn: "Vietnam", vn2: "Vietnam", ph2: "Philippines",
};

export function prettyRegion(code: string): string {
  const c = code.trim().toLowerCase();
  return REGION_LABELS[c] ?? code.trim().toUpperCase();
}

// Distinct colors for auto-assigned real-region pins before an admin recolors.
export const REGION_PALETTE = ["#38bdf8", "#34d399", "#a78bfa", "#fbbf24", "#f472b6", "#f87171", "#22d3ee", "#c084fc", "#4ade80", "#fb923c"];
