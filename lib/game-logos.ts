import { slugify } from "@/lib/utils";

// Resolve a provider's game name to a games-row logo, tolerant of naming
// differences between the provider registry and the games catalog
// (e.g. "PUBG: Battlegrounds" ↔ "PUBG", "osu!" ↔ "osu"). The nav reads the
// games row directly, so it always shows the logo; this makes the connect
// picker / onboarding / profile account cards match it.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function resolveGame<T extends { name: string; slug?: string }>(games: T[], gameName: string): T | undefined {
  if (!gameName) return undefined;
  const t = norm(gameName);
  // 1) exact normalized name
  let g = games.find((x) => norm(x.name) === t);
  // 2) one name is a prefix of the other (handles ": Battlegrounds" suffixes)
  if (!g) g = games.find((x) => { const n = norm(x.name); return n.length >= 3 && (t.startsWith(n) || n.startsWith(t)); });
  // 3) slug match
  if (!g) g = games.find((x) => x.slug && x.slug === slugify(gameName));
  return g;
}

export function resolveGameLogo(
  games: { name: string; slug?: string; logoUrl: string | null }[],
  gameName: string,
): string | null {
  return resolveGame(games, gameName)?.logoUrl ?? null;
}
