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
   * The prize share, as a PERCENTAGE of the price. C2.
   *
   * This used to be `prizePool: 175`, a fixed dollar figure, with the percentage
   * *derived* from it — which made the price a dial that silently changed what
   * we promise players. $350 gave 50% by coincidence; $400 would have given 44%
   * with no warning, on a page that says "half of what a brand pays reaches the
   * players who win".
   *
   * A percentage inverts that: move the price and the promise holds. It is also
   * the only shape `lib/vaults.ts` can allocate against, since a vault split has
   * to total 100 and a dollar figure has no share to add up.
   */
  prizePct: number;
  /**
   * How the pool divides between the three places, as WEIGHTS rather than
   * dollars or percentages.
   *
   * 4 : 2 : 1 is the current podium ($100 / $50 / $25 out of $175) and it stays
   * exact at every price, which neither dollars nor rounded percentages do —
   * three percentages that each round to the nearest whole number do not add
   * back to the pool, and the missing cents come out of a prize.
   */
  prizeW1: number;
  prizeW2: number;
  prizeW3: number;
  /**
   * DERIVED, never stored. `prizePct` × `challengePrice`, and the three places
   * from the weights.
   *
   * They stay on the config because thirty call sites read `cfg.prizePool` and
   * `cfg.prize1` to print a number, and those call sites are right — what was
   * wrong was where the number came from. `derivePrizes()` is the single place
   * that computes them, and `buildPricing` runs it last so a stale CMS row for
   * `pricing.prizePool` cannot override it.
   */
  prizePool: number;
  prize1: number;
  prize2: number;
  prize3: number;
  /**
   * THE THREE TIER BASES AND THE ADD-ON ARE RETIRED. C11.
   *
   * They priced a three-shape rate card — placements only, placements plus
   * challenges, the whole network — with a paid Sunday-broadcast add-on on top.
   * `docs/MODEL.md` merged all of it into ONE package priced per
   * challenge, with placements included free, and that is the offer the money
   * paths, the vault split and the brand builder now run on.
   *
   * They default to 0 rather than being deleted: they are read in a dozen
   * places across the marketing pages and the invoice builder, and the full
   * page rewrite is a later item. Zero is the honest value — a base nobody is
   * charged — and a zero base is skipped rather than printed, so no page says
   * "$0/month". When the pages are rewritten these fields go with them.
   */
  reachBase: number;
  challengeBase: number;
  ultimateBase: number;
  /** Paid annually, this much comes off. */
  yearlyDiscountPct: number;
  /** Retired with the bases — the broadcast comes with the package now. */
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
  /**
   * What the market charges for the same delivery, used ONLY to value what a
   * campaign returned.
   *
   * ROAS is a ratio, and a ratio needs a price on the numerator. These two are
   * that price: the CPM and CPC a brand would pay for gaming inventory
   * elsewhere. They are stored rather than hard-coded, and they are shown to
   * the brand next to every number derived from them, because a return figure
   * whose benchmark is hidden is a number no media buyer should accept — and
   * one they can argue with is one they can trust.
   */
  benchmarkCpm: number;
  benchmarkCpc: number;
  /**
   * What an engaged participant costs elsewhere.
   *
   * A sponsored challenge does not only deliver views. Someone who ENTERS has
   * linked an account, played a week under the brand's name and appeared on its
   * leaderboard — an engagement a brand would otherwise buy at gaming
   * cost-per-engagement rates, which run in dollars rather than cents. Pricing
   * an entrant at an impression's rate would understate a challenge as badly as
   * counting the prize money would overstate it, so the three are priced
   * separately and all three are printed next to the result.
   */
  benchmarkCpe: number;
  currency: string;
};

/** The fields nobody sets — they are computed from the ones above them. */
export const DERIVED_PRICING_KEYS = ["prizePool", "prize1", "prize2", "prize3"] as const;

/**
 * Fill the derived prize fields from the price and the percentage. C2.
 *
 * The three places are apportioned by weight and the LAST one takes the
 * remainder, so the podium always adds back to the pool exactly. Rounding each
 * place independently loses cents, and a prize pool that does not equal the sum
 * of its prizes is exactly what C15 has to reconcile.
 */
export function derivePrizes<T extends PricingConfig>(cfg: T): T {
  const pool = round2(cfg.challengePrice * (Math.max(0, Math.min(100, cfg.prizePct)) / 100));
  const w = [cfg.prizeW1, cfg.prizeW2, cfg.prizeW3].map((n) => Math.max(0, n));
  const sum = w[0] + w[1] + w[2];
  const p1 = sum > 0 ? round2(pool * (w[0] / sum)) : 0;
  const p2 = sum > 0 ? round2(pool * (w[1] / sum)) : 0;
  return { ...cfg, prizePool: pool, prize1: p1, prize2: p2, prize3: round2(pool - p1 - p2) };
}

export const PRICING_DEFAULTS: PricingConfig = derivePrizes({
  games: 6,
  challengesPerGame: 4,
  // $350, per `docs/MODEL.md` §2 — one merged package, priced per
  // challenge, of which half is prize money.
  challengePrice: 350,
  prizePct: 50,
  prizeW1: 4,
  prizeW2: 2,
  prizeW3: 1,
  // Overwritten by `derivePrizes` immediately. Present because the type says so;
  // never read from here.
  prizePool: 0,
  prize1: 0,
  prize2: 0,
  prize3: 0,
  // C11 — retired, see the type above. One package, priced per challenge.
  reachBase: 0,
  challengeBase: 0,
  ultimateBase: 0,
  yearlyDiscountPct: 20,
  streamAddon: 0,
  slotCount: 2,
  slotSeconds: 5,
  impressionsPerMember: 12,
  benchmarkCpm: 8,
  benchmarkCpc: 0.6,
  benchmarkCpe: 3.5,
  currency: "USD",
});

// The numeric keys an admin may actually set. The derived prize fields are
// excluded on purpose: an input that accepts a value and then silently
// overwrites it is worse than no input at all.
export const PRICING_NUMBER_KEYS = Object.keys(PRICING_DEFAULTS)
  .filter((k) => k !== "currency" && !(DERIVED_PRICING_KEYS as readonly string[]).includes(k))
  .map((k) => `pricing.${k}`);

// Copy keys. Feature lists are newline-separated, the same convention the
// loading-screen phrases use, so an admin edits a list in a textarea rather
// than learning a syntax.
export const PRICING_COPY_DEFAULTS: Record<string, string> = {
  "pricing.eyebrow": "B2B SaaS · gaming marketing",
  "pricing.title": "Buy media inside Discord.",
  "pricing.subtitle":
    "Discord is where gamers actually live, and it has no ads manager. Cluster is the media-buying layer over it: placements across every community running the bot, and sponsored challenges gamers enter for the chance to win. Structured, measurable, and bought in a month.",
  "pricing.note":
    "All prices in USD, per month, billed monthly unless you choose annual. No setup fees, no administration fees, no minimum term — cancel before the next cycle.",

  "pricing.tier.reach.name": "Reach",
  "pricing.tier.reach.tagline": "Show up where gamers already are.",
  "pricing.tier.reach.features":
    "Your creatives in every placement across clustergg.com\nPlacements inside every opted-in Discord server\nImpressions and clicks counted per placement and per community\nSelf-serve brand portal — upload and swap creatives yourself, any time\nFull analytics dashboard, filterable and downloadable\nNo lead time, no ticket, no account manager in the way",

  "pricing.tier.challenge.name": "Challenge",
  "pricing.tier.challenge.tagline": "Sponsor the gameplay, not the content.",
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
    "What am I actually buying? | Structured gamer attention on Discord: placements across clustergg.com and inside every opted-in server, and — from the Challenge tier up — sponsored weekly competitions carrying your brand in the games you choose. Not vague awareness, and not a banner next to the audience.\n"
    + "Who pays the prize money? | We do. Every challenge has a guaranteed minimum pool that Cluster funds and pays out. You're buying the competition and the name on it — no setup fee, no administration fee, no payout risk.\n"
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
  out.prizePct = Math.max(0, Math.min(100, out.prizePct));
  // LAST, and unconditionally. A CMS row left over from when `pricing.prizePool`
  // was editable would otherwise win over the percentage, and the page would go
  // on showing a prize that no longer matches the price.
  return derivePrizes(out);
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
 * Now the SOURCE, not a derivation. It used to divide the pool by the price and
 * round — which is why a price change quietly changed the promise. Reading the
 * configured percentage back means the sentence on the pricing page and the
 * money in the prize vault come from the same number.
 */
export function prizeSharePct(cfg: PricingConfig): number {
  return Math.round(Math.max(0, Math.min(100, cfg.prizePct)));
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
  // `ownerPct` was here — the per-challenge rate this ladder promised. C3
  // removed it: a rung gates which weekly pool you compete in, and printing a
  // rate we no longer pay was the loudest of the four places it survived.
  icon: string;
  headline: string;
  detail: string;
  perks: string[];
};

// The public server ladder. Rewritten by C3.
//
// Every rung used to promise a percentage — "5% of every sponsored challenge",
// "your share doubles to 10%", "you keep 25 of the 30 points Cluster charges".
// That is the per-challenge rate `docs/MODEL.md` §4 replaced with
// a weekly pool, and this was the fourth place it lived: delete the other three
// and the live `/servers` page goes on promising it.
//
// What replaces it is not vaguer. A rung says which pool you compete in, what
// the pool is funded by, and what the tier unlocks that is not money — priority,
// exclusivity, being named on the broadcast. Those were always the parts a
// percentage could not buy.
export const EARN_STAGES_DEFAULT: EarnStage[] = [
  {
    key: "monetized",
    name: "Sponsored",
    threshold: 500,
    icon: "diamond",
    headline: "Brand-sponsored challenges start landing in your server",
    detail:
      "Link 500 gamers and your server switches on. Brands sponsoring the games your members already play start running their weekly challenges here — every dollar of the prize money is won by your members, and you enter the weekly server pool that every sponsored challenge funds.",
    perks: [
      "Sponsored weekly challenges in your community's games",
      "A place in the weekly server pool, with a flat share for every week you carry a challenge",
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
      "At 1,000 linked gamers you become a distribution point. Challenges from across the network run in your server, so more of your members are playing for real prizes in more games at once — and you compete in a bigger tier of the pool, against fewer servers.",
    perks: [
      "Everything in Sponsored",
      "A bigger tier of the weekly pool, with fewer servers competing for its slots",
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
      "At 5,000 linked gamers you are an audience in your own right. Brands ask for challenges in your server specifically, smaller servers carry yours instead of the other way round, and you compete for the largest slots in the weekly pool.",
    perks: [
      "Everything in Broadcaster",
      "The largest slots in the weekly server pool",
      "Brands request your community by name",
      "Exclusive challenges only your members can enter",
      "Named on the Sunday broadcast",
    ],
  },
];
