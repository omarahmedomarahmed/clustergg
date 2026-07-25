// Data shapes for every generated PNG card. Kept free of server imports so both
// the renderer and the data loaders can share them.

export type CardKind =
  | "profile" | "game-stats" | "quest" | "cp-summary"
  | "leaderboard" | "challenge" | "planet" | "planets" | "guide";

export type CardTheme = {
  accent: string;   // primary brand/game/quest colour
  accent2: string;  // secondary
  bgUrl?: string | null; // background artwork (admin-controlled)
  // Fallbacks, tried in order when `bgUrl` can't be fetched or decoded. A
  // gamer's uploaded art failing shouldn't leave the card with no art at all.
  bgFallbacks?: (string | null | undefined)[];
  dim?: number;     // 0-100 veil strength over the artwork
  // Filled in by the renderer, not by the data loaders: the astronaut mascot and
  // the Cluster logo mark that every card carries.
  astronautUrl?: string | null;
  markUrl?: string | null;
};

export type ProfileCard = {
  kind: "profile";
  displayName: string;
  slug: string;
  avatarUrl?: string | null;
  title?: string | null;
  country?: string | null;
  totalCp: number;
  level: number;
  views: number;
  votes: number;
  award?: string | null;          // e.g. "Best Profile — Week 12"
  accounts: { game: string; logoUrl?: string | null; tag: string; headline?: string | null }[];
  theme: CardTheme;
};

export type GameStatsCard = {
  kind: "game-stats";
  displayName: string;
  slug?: string | null;
  avatarUrl?: string | null;
  game: string;
  logoUrl?: string | null;
  tag: string;
  region?: string | null;
  stats: { label: string; value: string }[];
  rank?: { place: number; total: number; board: string } | null;
  // The things that make a game account feel like a game account rather than a
  // row of numbers: who you main, and how the last few games actually went.
  champions?: { name: string; iconUrl?: string | null; level?: number; points?: number }[];
  matches?: { champion: string; iconUrl?: string | null; win: boolean; kda: string; queue?: string | null; when?: string | null }[];
  gameAvatarUrl?: string | null;   // in-game profile icon, when the game has one
  live?: { champion?: string | null; queue?: string | null } | null;
  theme: CardTheme;
};

export type QuestCard = {
  kind: "quest";
  displayName?: string | null;
  questName: string;
  tagline?: string | null;
  logoUrl?: string | null;
  cp: number;
  nextThreshold?: number | null;
  currentTier?: string | null;
  nextTier?: string | null;
  tiers: { name: string; threshold: number; earned: boolean }[];
  theme: CardTheme;
};

export type CpSummaryCard = {
  kind: "cp-summary";
  displayName: string;
  totalCp: number;
  level: number;
  quests: { name: string; cp: number; target: number; tier: string; accent: string }[];
  theme: CardTheme;
};

export type LeaderboardCard = {
  kind: "leaderboard";
  title: string;
  game?: string | null;
  logoUrl?: string | null;
  subtitle?: string | null;
  rows: { rank: number; name: string; value: string; you?: boolean; avatarUrl?: string | null }[];
  theme: CardTheme;
};

export type ChallengeCard = {
  kind: "challenge";
  title: string;
  game: string;
  logoUrl?: string | null;
  description?: string | null;
  endsAt: string;             // ISO
  participants: number;
  prize?: string | null;
  trophies: { name: string; imageUrl: string; value: number; place: number }[];
  isPrivate?: boolean;
  serverName?: string | null;   // for a server-gated challenge
  ended?: boolean;
  startsAt?: string | null;     // ISO — so the card can show the full window
  // Live standings. A challenge card without them is a poster; with them it's a
  // scoreboard people come back to.
  standings?: { place: number; name: string; points: number; you?: boolean }[];
  theme: CardTheme;
};

export type PlanetCard = {
  kind: "planet";
  game: string;
  logoUrl?: string | null;
  description?: string | null;
  challenges: number;
  ranked: number;
  serverGamers?: number | null;
  topGamer?: { name: string; value: string } | null;
  theme: CardTheme;
};

// The game picker: every world, as its own logo tile. This is what START HERE
// opens, so it has to look like the galaxy the site promises.
export type PlanetsCard = {
  kind: "planets";
  title: string;
  subtitle?: string | null;
  games: { name: string; logoUrl?: string | null; accent?: string | null }[];
  theme: CardTheme;
};

export type GuideCard = {
  kind: "guide";
  title: string;
  subtitle?: string | null;
  steps: { title: string; body: string }[];
  footer?: string | null;
  badge?: string | null;      // e.g. "QUEST GUIDE"
  logoUrl?: string | null;
  theme: CardTheme;
};

export type CardData =
  | ProfileCard | GameStatsCard | QuestCard | CpSummaryCard
  | LeaderboardCard | ChallengeCard | PlanetCard | PlanetsCard | GuideCard;
