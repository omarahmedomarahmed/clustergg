// The commercial model, as data.
//
// Cluster sells one thing to brands: access to gamers inside Discord, where
// there is no ads manager to buy it any other way. The model has three shapes —
// placements only, placements plus sponsored challenges per game, and the whole
// network — and one add-on.
//
// Every number here is a real commitment, so every number here is editable by an
// admin rather than compiled into a page. Pricing that can only be changed by a
// deploy is pricing that goes stale the first time sales negotiates.
//
// This module is PURE: no database, no server imports. The pricing page runs the
// slider in the browser and the same functions render it on the server, so the
// two can never disagree. Live inventory and audience come from
// `lib/pricing-live.ts`.

export type TierKey = "reach" | "challenge" | "ultimate";

export type PricingConfig = {
  /** How many games are commercialised — also the slider maximum. */
  games: number;
  /** Sponsored challenges per game, per month. One a week. */
  challengesPerGame: number;
  /** What a brand pays for one sponsored weekly challenge. */
  challengePrice: number;
  /**
   * What that challenge pays out, and its split. Every cent of it reaches a
   * gamer, as three trophies carrying the sponsor's brand.
   *
   * `challengePrice - prizePool` is the gross margin on a challenge. It is the
   * only place the two numbers meet, which is deliberate: the prize is a
   * commitment to the players and the price is a commitment to the brand, and
   * neither should move because someone edited the other.
   */
  prizePool: number;
  prize1: number;
  prize2: number;
  prize3: number;
  /** Monthly base for placements only. */
  reachBase: number;
  /** Monthly base once at least one game is sponsored. */
  challengeBase: number;
  /** Monthly base when every game is sponsored. */
  ultimateBase: number;
  /** Paid annually, this much comes off. */
  yearlyDiscountPct: number;
  /** The Sunday broadcast sponsorship, addable to any plan. */
  streamAddon: number;
  /** Video slots included at the top tier. */
  slotCount: number;
  slotSeconds: number;
  /**
   * Projection factor: placement views per reachable member per month. Used ONLY
   * for the forward-looking impression estimate, which is always labelled as a
   * projection. Everything else on the pricing page is a counted number.
   */
  impressionsPerMember: number;
  currency: string;
};

export const PRICING_DEFAULTS: PricingConfig = {
  games: 6,
  challengesPerGame: 4,
  challengePrice: 250,
  prizePool: 175,
  prize1: 100,
  prize2: 50,
  prize3: 25,
  reachBase: 600,
  challengeBase: 500,
  ultimateBase: 400,
  yearlyDiscountPct: 20,
  streamAddon: 400,
  slotCount: 2,
  slotSeconds: 5,
  impressionsPerMember: 12,
  currency: "USD",
};

// The numeric keys, as stored in the CMS.
export const PRICING_NUMBER_KEYS = Object.keys(PRICING_DEFAULTS)
  .filter((k) => k !== "currency")
  .map((k) => `pricing.${k}`);

// Copy keys. Feature lists are newline-separated, the same convention the
// loading-screen phrases use, so an admin edits a list in a textarea rather
// than learning a syntax.
export const PRICING_COPY_DEFAULTS: Record<string, string> = {
  "pricing.eyebrow": "For brands",
  "pricing.title": "Reach gamers where they actually are.",
  "pricing.subtitle":
    "Every gamer has Discord. Discord has no ads manager. Cluster is the only structured way to buy that attention — placements across the network, and sponsored challenges the community actually enters.",
  "pricing.note":
    "All prices in USD, per month, billed monthly unless you choose annual. No setup fee, no minimum term, cancel before the next cycle.",

  "pricing.tier.reach.name": "Reach",
  "pricing.tier.reach.tagline": "Be everywhere gamers already look.",
  "pricing.tier.reach.features":
    "Your creatives in every placement across clustergg.com\nPlacements inside every opted-in Discord server\nImpressions and clicks counted per placement and per community\nSelf-serve brand portal — upload and swap creatives yourself, any time\nFull analytics dashboard, filterable and downloadable\nNo lead time, no ticket, no account manager in the way",

  "pricing.tier.challenge.name": "Challenge",
  "pricing.tier.challenge.tagline": "Put your name on the competition.",
  "pricing.tier.challenge.features":
    "Everything in Reach, with the base rate reduced\nFour sponsored community challenges a month, per game\nNaming rights — that game's weekly challenge carries your brand\nCluster funds and pays every prize pool\nEntrants are verified players of that game, read from its official API\nPer-challenge reporting: entrants, completion, reach, standings",

  "pricing.tier.ultimate.name": "Ultimate",
  "pricing.tier.ultimate.tagline": "Own the whole network.",
  "pricing.tier.ultimate.features":
    "All six games, all twenty-four challenges a month\nPremium placement — first position in every rotation\nDiscord placement in every server on the network\nWeekly shout-out on the Sunday live-stream\nBase rate at its lowest — you are only paying for games\nYour brand on every planet, every leaderboard, every challenge card",

  "pricing.addon.name": "Sunday Broadcast",
  "pricing.addon.tagline": "Sponsor Profile of the Week.",
  "pricing.addon.features":
    "Presenting sponsor of the Sunday live-stream\nYour brand on the winners card posted to every server\nNamed in every clip cut from the broadcast\nAddable to any plan, cancel any time",

  // "Question | answer" per line.
  "pricing.faq":
    "What am I actually buying? | Placements across clustergg.com and inside every opted-in Discord server, and — from the Challenge tier up — sponsored weekly competitions carrying your brand name in the games you choose.\n"
    + "Who pays the prize money? | We do. Every challenge has a guaranteed minimum pool that Cluster funds and pays out. You buy the competition and the name on it, not the admin or the payout risk.\n"
    + "How do you know these are real gamers? | Every account is linked and verified against the game's own official API — rank, matches, wins. Nothing on Cluster is self-reported, which is the whole reason the audience can be described at all.\n"
    + "Can I change my creative myself? | Yes. Every plan includes the brand portal: upload, swap and pause creatives whenever you want, and watch impressions and clicks per placement and per community. No ticket, no lead time.\n"
    + "Is the impression figure guaranteed? | No, and we won't pretend otherwise. Reach and placement counts are measured; the forward-looking impression number is a projection with its formula printed next to it. What is contractual is the placements and the challenges.\n"
    + "What does naming rights mean? | The weekly challenge for that game runs under your brand — on the card posted to every server, on the leaderboard, on the challenge page, and in the winners announcement.\n"
    + "Can I sponsor inside my own Discord? | Yes, and it's often better. We install the bot in your server, build the competitive layer and run the activation for the community you already have.\n"
    + "What's the minimum commitment? | One month. Annual is discounted because it helps us plan prize pools, but nothing here is a lock-in.",

  "pricing.cta.primary": "Talk to us",
  "pricing.cta.secondary": "See the audience",
  "pricing.contact.email": "partners@clustergg.com",
};

export const PRICING_CMS_KEYS = [...PRICING_NUMBER_KEYS, ...Object.keys(PRICING_COPY_DEFAULTS)];

// Parse a CMS content map into a config. Anything missing, unparseable or
// negative falls back to the default rather than rendering a $NaN price tag.
export function buildPricing(content: Record<string, string> = {}): PricingConfig {
  const out = { ...PRICING_DEFAULTS };
  for (const key of Object.keys(PRICING_DEFAULTS) as (keyof PricingConfig)[]) {
    if (key === "currency") continue;
    const raw = content[`pricing.${key}`];
    if (raw === undefined || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) (out[key] as number) = n;
  }
  // A slider that can't reach one game has no product behind it.
  out.games = Math.max(1, Math.min(24, Math.round(out.games)));
  out.challengesPerGame = Math.max(1, Math.min(31, Math.round(out.challengesPerGame)));
  out.yearlyDiscountPct = Math.max(0, Math.min(90, out.yearlyDiscountPct));
  return out;
}

// A newline-separated CMS list → array, blank lines dropped.
export function lines(value: string | undefined, fallback = ""): string[] {
  return (value ?? fallback).split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * A list of "Heading | body text" lines → objects.
 *
 * Used for every editable card list on the marketing pages. One textarea holding
 * four lines is an edit an admin will actually make; eight separate fields
 * called `brand.problem.2.note` is one they'll avoid, and unmaintained copy is
 * the failure mode this whole system exists to prevent.
 */
export function pairs(value: string | undefined, fallback = ""): { title: string; note: string }[] {
  return lines(value, fallback).map((l) => {
    const i = l.indexOf("|");
    return i === -1
      ? { title: l.trim(), note: "" }
      : { title: l.slice(0, i).trim(), note: l.slice(i + 1).trim() };
  }).filter((p) => p.title);
}

// The numeric config as CMS strings, so the admin form opens pre-filled with the
// prices that are actually running rather than a set of empty boxes.
export const PRICING_NUMBER_DEFAULTS: Record<string, string> = Object.fromEntries(
  Object.entries(PRICING_DEFAULTS)
    .filter(([k]) => k !== "currency")
    .map(([k, v]) => [`pricing.${k}`, String(v)]),
);

// ===== The maths =====
//
// The per-game rate is DERIVED, never stored. A brand buys challenges, one a
// week; the monthly rate for a game is simply how many of them that is. Storing
// it separately would create two numbers that mean the same thing and eventually
// disagree, and the one a brand sees on an invoice would stop matching the one
// on the page.

/** What a brand pays per game, per month. */
export function perGame(cfg: PricingConfig): number {
  return cfg.challengePrice * cfg.challengesPerGame;
}

/** What we keep on one challenge, after the prize. */
export function marginPerChallenge(cfg: PricingConfig): number {
  return Math.max(0, cfg.challengePrice - cfg.prizePool);
}

/**
 * The share of challenge revenue that reaches gamers.
 *
 * Not a policy we chose to publish — an arithmetic consequence of charging
 * `challengePrice` and paying out `prizePool`. It is stated everywhere as
 * "70% of what a brand pays goes to the players", and it stays true by
 * construction rather than by someone remembering to update it.
 */
export function prizeSharePct(cfg: PricingConfig): number {
  if (cfg.challengePrice <= 0) return 0;
  return Math.round((cfg.prizePool / cfg.challengePrice) * 100);
}

export type Quote = {
  tier: TierKey;
  games: number;
  base: number;
  gamesCost: number;
  addonCost: number;
  /** What they pay each month, billed monthly. */
  monthly: number;
  /** The same plan billed annually: effective monthly, the annual total, and what they keep. */
  yearlyMonthly: number;
  yearlyTotal: number;
  yearlySaving: number;
  /** Sponsored challenges included, and what those pay out. */
  challengesPerMonth: number;
  challengesPerYear: number;
  prizeFunded: number;
  namingRights: boolean;
  premiumPlacement: boolean;
  discordPlacement: boolean;
  livestreamShoutout: boolean;
  videoSlots: number;
};

export function quote(
  cfg: PricingConfig,
  opts: { games?: number; yearly?: boolean; addon?: boolean } = {},
): Quote {
  const games = Math.max(0, Math.min(cfg.games, Math.round(opts.games ?? 0)));
  const tier: TierKey = games <= 0 ? "reach" : games >= cfg.games ? "ultimate" : "challenge";
  const base = tier === "reach" ? cfg.reachBase : tier === "ultimate" ? cfg.ultimateBase : cfg.challengeBase;
  const gamesCost = games * perGame(cfg);
  const addonCost = opts.addon ? cfg.streamAddon : 0;
  const monthly = base + gamesCost + addonCost;
  const yearlyTotal = round2(monthly * 12 * (1 - cfg.yearlyDiscountPct / 100));
  const challengesPerMonth = games * cfg.challengesPerGame;
  return {
    tier,
    games,
    base,
    gamesCost,
    addonCost,
    monthly,
    yearlyMonthly: round2(yearlyTotal / 12),
    yearlyTotal,
    yearlySaving: round2(monthly * 12 - yearlyTotal),
    challengesPerMonth,
    challengesPerYear: challengesPerMonth * 12,
    prizeFunded: challengesPerMonth * cfg.prizePool,
    namingRights: games > 0,
    premiumPlacement: tier === "ultimate",
    discordPlacement: true,
    livestreamShoutout: tier === "ultimate",
    videoSlots: tier === "ultimate" ? cfg.slotCount : 0,
  };
}

/** Every challenge Cluster runs in a month across all commercialised games. */
export function challengesPerMonth(cfg: PricingConfig): number {
  return cfg.games * cfg.challengesPerGame;
}

/** What those challenges pay out — the cost the packages have to carry. */
export function monthlyPrizeCost(cfg: PricingConfig): number {
  return challengesPerMonth(cfg) * cfg.prizePool;
}

/**
 * Projected monthly impressions for a plan.
 *
 * Deliberately transparent: reachable audience × a per-member view factor, with
 * sponsored games weighted because a challenge is entered rather than scrolled
 * past. Callers must present this as a projection — it is the one number on the
 * pricing page that isn't counted, and dressing it up as measured would be the
 * fastest way to lose the first brand that checks.
 */
export function projectedImpressions(cfg: PricingConfig, reach: number, games: number): number {
  if (reach <= 0) return 0;
  const share = cfg.games > 0 ? Math.min(1, games / cfg.games) : 0;
  return Math.round(reach * cfg.impressionsPerMember * (1 + share));
}

export function money(n: number, currency = "USD"): string {
  const whole = Math.round(n) === n;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency,
    minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
  }).format(n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ===== The other side of the marketplace: what a server earns =====
//
// Brands pay per challenge and per placement; servers are paid out of that. The
// stages below are the earning ladder shown to server owners in the same visual
// hierarchy as the brand tiers — one side pays, the other side gets paid, and
// the page should make that symmetry obvious.
//
// The thresholds mirror `lib/server-portal.ts` (the live product), because a
// marketing page quoting a different number to the product is a support ticket.

export type EarnStage = {
  key: string;
  name: string;
  /** Linked gamers required. Linked — not members. */
  threshold: number;
  icon: string;
  headline: string;
  detail: string;
  perks: string[];
};

export const EARN_STAGES_DEFAULT: EarnStage[] = [
  {
    key: "monetized",
    name: "Sponsored",
    threshold: 500,
    icon: "diamond",
    headline: "Brand-sponsored challenges start landing in your server",
    detail:
      "Link 500 gamers and your server switches on. Brands sponsoring the games your members already play start running their weekly challenges here — and every dollar of the prize money is won by your members.",
    perks: [
      "Sponsored weekly challenges in your community's games",
      "Prize money paid straight to your members who win",
      "Owner portal: who linked, who entered, what they won",
      "Your server listed publicly with its own page",
    ],
  },
  {
    key: "broadcaster",
    name: "Broadcaster",
    threshold: 1000,
    icon: "satellite",
    headline: "More games, more weeks, more money into your community",
    detail:
      "At 1,000 linked gamers you become a distribution point. Challenges from across the network run in your server, so more of your members are playing for real prizes in more games at once.",
    perks: [
      "Everything in Sponsored",
      "Network-wide challenges carried in your server",
      "Priority on sponsored challenges in your top game",
      "Featured in the public server directory",
    ],
  },
  {
    key: "sponsored",
    name: "Flagship",
    threshold: 5000,
    icon: "crown",
    headline: "Brands buy your community by name",
    detail:
      "At 5,000 linked gamers you are an audience in your own right. Brands ask for challenges in your server specifically, and smaller servers carry yours instead of the other way round.",
    perks: [
      "Everything in Broadcaster",
      "Brands request your community by name",
      "Exclusive challenges only your members can enter",
      "Named on the Sunday broadcast",
    ],
  },
];
