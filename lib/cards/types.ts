// Data shapes for every generated PNG card. Kept free of server imports so both
// the renderer and the data loaders can share them.

export type CardKind =
  | "profile" | "game-stats" | "quest" | "cp-summary"
  | "leaderboard" | "challenge" | "planet" | "guide";

export type CardTheme = {
  accent: string;   // primary brand/game/quest colour
  accent2: string;  // secondary
  bgUrl?: string | null; // background artwork (admin-controlled)
  dim?: number;     // 0-100 veil strength over the artwork
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
  game: string;
  logoUrl?: string | null;
  tag: string;
  region?: string | null;
  stats: { label: string; value: string }[];
  rank?: { place: number; total: number; board: string } | null;
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
  | LeaderboardCard | ChallengeCard | PlanetCard | GuideCard;
