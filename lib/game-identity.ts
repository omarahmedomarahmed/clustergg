// Resolve a gamer's game-specific identity from a linked account's providerData.
// General rule across the platform: on any game-specific surface (that game's
// planet, its leaderboards, its challenge boards) show the gamer's avatar FOR
// THAT GAME when we can pull it (e.g. the LoL profile icon), else fall back to
// their Cluster avatar, else the game logo. Client-safe (no server imports).

export function gameAvatarOf(providerData: Record<string, unknown> | null | undefined): string | null {
  const a = providerData?.gameAvatar;
  return typeof a === "string" && a.startsWith("http") ? a : null;
}

export type PersistedChampion = { championId: number; ddId: string; name: string; iconUrl: string; level: number; points: number };
export function championsOf(providerData: Record<string, unknown> | null | undefined): PersistedChampion[] {
  const c = providerData?.lolChampions;
  return Array.isArray(c) ? (c as PersistedChampion[]).filter((x) => x && typeof x.championId === "number") : [];
}

// The best avatar to show on a game-specific surface, given the gamer's own
// avatar and the account's game avatar. Returns null → caller shows the game logo.
export function bestGameAvatar(gameAvatar: string | null, userAvatar: string | null): string | null {
  return gameAvatar || userAvatar || null;
}
