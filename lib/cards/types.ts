import type { CardLayout } from "@/lib/cards/layout";

// Data shapes for every generated PNG card. Kept free of server imports so both
// the renderer and the data loaders can share them.

export type CardKind =
  | "profile" | "game-stats" | "quest" | "cp-summary"
  | "leaderboard" | "challenge" | "planet" | "planets" | "guide" | "week"
  | "world" | "search" | "market";

/**
 * The sponsor shown on this render of this card.
 *
 * Picked per card, per rotation window — not per campaign — so two cards posted
 * in the same server a second apart carry two different brands. That is the
 * whole product: the inventory is every card the bot draws, and a brand's reach
 * is the number of times a gamer pressed a button anywhere on the network.
 */
export type CardAdSlot = {
  imageUrl: string;
  brandName: string;
  /** The campaign-creative that was served; what an impression is counted against. */
  campaignCreativeId?: string | null;
  /** Overrides the "SPONSORED" label — a house promo says "FROM CLUSTER". */
  label?: string | null;
};

export type CardTheme = {
  accent: string;   // primary brand/game/quest colour
  accent2: string;  // secondary
  bgUrl?: string | null; // background artwork (admin-controlled)
  // Fallbacks, tried in order when `bgUrl` can't be fetched or decoded. A
  // gamer's uploaded art failing shouldn't leave the card with no art at all.
  bgFallbacks?: (string | null | undefined)[];
  // Filled in by the renderer, not by the data loaders: the astronaut mascot,
  // the Cluster logo mark every card carries, and the admin-edited geometry
  // that says where all three of them go.
  astronautUrl?: string | null;
  markUrl?: string | null;
  layout?: CardLayout;
  // The sponsor for this render. Attached before the card is hashed for the
  // cache, so each brand's version of a card is stored and reused separately
  // rather than one of them silently overwriting the other.
  ad?: CardAdSlot | null;
  /**
   * The material the top-right badge can be built from, for this card.
   *
   * Each card body proposes what its badge shows, but an admin can override it
   * per card kind — and an override needs the ingredients to hand. Collected
   * once when the card is prepared rather than dug out of a union type inside
   * the renderer, so "show the game's logo" means the same thing on every kind
   * that has one and draws nothing on the kinds that don't.
   */
  badge?: {
    gameLogoUrl?: string | null;
    level?: number | null;
    trophyUrl?: string | null;
  };
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
  // What they've actually won, and what they're competing in right now. A
  // profile card without these is a stat sheet; with them it's a trophy case.
  // Ordered most valuable first. `value` is the admin-assigned dollar figure
  // the trophy redeems for — the card prints it, because a trophy nobody can
  // price reads as a badge rather than as money.
  trophies?: { name: string; imageUrl: string; value?: number }[];
  trophyCount?: number;           // total won, when more than the card can show
  challenges?: { title: string; live: boolean; points: number; place?: number | null }[];
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
  /**
   * Who can enter, in the game's own words — "Gold or above in Solo/Duo".
   *
   * A gamer deciding whether to tap Join needs to know whether the answer will
   * be no. Empty means open to everyone, which the card says rather than
   * leaving blank.
   */
  entryRules?: string[];
  theme: CardTheme;
};

// A game's hub, as the bot shows it.
//
// This card used to be three counters and a name. That is not what a planet is:
// the reason to open one is to find out what you can actually enter and where
// you'd stand, so it carries the real lists — every live challenge with its
// deadline, and every board this game runs with whoever is on top of it.
export type PlanetCard = {
  kind: "planet";
  game: string;
  logoUrl?: string | null;
  description?: string | null;
  challenges: { title: string; endsAt: string; participants: number; prize?: string | null }[];
  boards: { title: string; leader: string | null; value: string | null; entries: number }[];
  /** Distinct gamers with a linked account on this game. */
  gamers: number;
  serverGamers?: number | null;
  theme: CardTheme;
};

// Profile of the Week, in Discord.
//
// One card, two jobs. `race` is the daily post: where the vote stands and how
// long is left. `result` is Sunday's: who won and what each of them was handed.
// Same shape because it is the same competition, and a server that has been
// watching the race all week should recognise the card that ends it.
/**
 * The trophy marketplace, as a card.
 *
 * Six trophies, two rows of three, each with BOTH numbers on it: what it costs
 * in Cluster Points and what it redeems for in dollars. Showing only the CP
 * price would make it a game currency; showing both is what tells a gamer their
 * free points are worth actual money, which is the entire argument for playing
 * after you have lost a challenge.
 *
 * The viewer's balance sits at the top, because a shelf you can't price
 * yourself against is a catalogue.
 */
export type MarketCard = {
  kind: "market";
  title: string;
  subtitle?: string | null;
  /** The viewer's spendable balance, and what they've earned all-time. */
  balance: number;
  earned: number;
  /** Exactly six, or fewer if the shelf is short. */
  trophies: {
    id: string;
    name: string;
    imageUrl?: string | null;
    tier: string;
    cpPrice: number;
    value: number;
    /** Can the viewer afford it right now — drives the dimming. */
    affordable: boolean;
  }[];
  /** How many CP buy a dollar, stated so the exchange is never a mystery. */
  cpPerDollar: number;
  theme: CardTheme;
  ad?: CardAdSlot | null;
};

export type WeekCard = {
  kind: "week";
  mode: "race" | "result";
  weekKey: string;
  title: string;
  subtitle?: string | null;
  /** Days until voting closes — 0 on announcement day. */
  daysLeft: number;
  entries: {
    rank: number;
    name: string;
    avatarUrl?: string | null;
    weekVotes: number;
    lifetimeVotes: number;
    /** The trophy this placement was handed, on a called week. */
    trophyUrl?: string | null;
  }[];
  totalVotes: number;
  contenders: number;
  trophy?: { name: string; imageUrl: string; value: number } | null;
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

// A game-world entity: a champion, agent, legend, weapon, map — and the skin
// currently being shown.
//
// This is the card `/cluster show <any lore name>` produces. It's deliberately
// art-led: the splash IS the card, and the text sits on it. Skins are the
// reason people open it twice, so switching skin re-renders the same card with
// a different splash rather than opening a new one.
export type WorldCard = {
  kind: "world";
  game: string;
  entityKind: string;          // champion | agent | weapon | legend | map | hero
  name: string;
  role?: string | null;
  lore?: string | null;
  /** The skin being shown, when it isn't the base look. */
  skinName?: string | null;
  /** How many skins exist, so the card can say what the buttons are for. */
  skinCount: number;
  meta: { label: string; value: string }[];
  /**
   * The ability icons are the point.
   *
   * These are the squares a player has stared at for a thousand hours; the name
   * is what they'd call it, but the icon is what they RECOGNISE. The world
   * cache already fetches and re-hosts them — this carries them the last step,
   * to the card.
   */
  abilities: { name: string; desc: string; iconUrl?: string | null }[];
  /**
   * The chosen splash, drawn as a picture as well as as the backdrop.
   *
   * Same image as `theme.bgUrl` on purpose: the background is 62% veiled and
   * double-scrimmed so the copy stays readable, which means the artwork itself
   * is never actually seen. This is the undimmed copy, in a panel.
   */
  artUrl?: string | null;
  logoUrl?: string | null;
  theme: CardTheme;
};

// "Did you mean…" — the one case where a search can't answer straight.
//
// Only rendered when a query genuinely resolves to more than one thing (two
// gamers with the same tag on different games, a word that is both a champion
// and a map). One hit renders that hit; zero hits says so.
export type SearchCard = {
  kind: "search";
  query: string;
  results: { label: string; sub: string; kind: string; imageUrl?: string | null }[];
  theme: CardTheme;
};

export type CardData =
  | ProfileCard | GameStatsCard | QuestCard | CpSummaryCard
  | LeaderboardCard | ChallengeCard | PlanetCard | PlanetsCard | GuideCard | WeekCard
  | WorldCard | SearchCard | MarketCard;
