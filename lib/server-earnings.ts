import { PRICING_DEFAULTS, prizeSharePct, type PricingConfig } from "@/lib/pricing";

// What a server owner earns, and where it comes from.
//
// A sponsored challenge costs a brand `challengePrice`. 70% of that is the
// prize pool — it goes to the gamers who win, and it is never touched. The
// remaining 30% is the platform fee, and THAT is what this module divides.
//
// The rule, in one sentence: the more gamers a server brings to Cluster, the
// bigger a share of the platform fee its owner keeps, and the smaller the share
// Cluster keeps. At the top of the ladder the owner takes 25 of the 30 points
// and we take 5.
//
//   500 linked gamers   →  owner 5%,  Cluster 25%
//   1,000 linked gamers →  owner 10%, Cluster 20%
//   5,000 linked gamers →  owner 25%, Cluster 5%
//
// This is on top of what their members win, which is the thing owners tend to
// ask about first: the prize pool is not the owner's revenue and never was.
//
// ===== The part worth reading twice =====
//
// A percentage "of every sponsored challenge" cannot mean the whole challenge
// once more than one server carries it: forty servers each taking 25% of the
// same $250 is 1000% of a number we only collected once. So a challenge's
// platform fee is APPORTIONED across the servers that carried it, by the share
// of entrants each one contributed, and the owner's percentage applies to their
// server's share. A server that supplied the whole field earns the full 25%; a
// server that supplied a tenth of it earns a tenth of that.
//
// Stated plainly in the portal too, because an earnings number a server owner
// cannot reconstruct is one they will not trust.

export type EarnTier = {
  key: string;
  /** Linked gamers required. Linked — not members, not joins. */
  threshold: number;
  /** The owner's share of a sponsored challenge, as a % of what the brand paid. */
  ownerPct: number;
};

export const EARN_TIERS: EarnTier[] = [
  { key: "seed", threshold: 0, ownerPct: 0 },
  { key: "monetized", threshold: 500, ownerPct: 5 },
  { key: "broadcaster", threshold: 1000, ownerPct: 10 },
  { key: "sponsored", threshold: 5000, ownerPct: 25 },
];

/** The whole platform fee, as a % of the challenge price. 100 − the prize share. */
export function platformFeePct(cfg: PricingConfig = PRICING_DEFAULTS): number {
  return Math.max(0, 100 - prizeSharePct(cfg));
}

/** The owner's cut at this many linked gamers. */
export function ownerPctFor(linked: number): number {
  let pct = 0;
  for (const t of EARN_TIERS) if (linked >= t.threshold) pct = t.ownerPct;
  return pct;
}

/**
 * What this server ACTUALLY earns right now (B47).
 *
 * The tier decides the percentage; a complete profile decides whether it pays.
 * `ownerPctFor` above is deliberately untouched — it answers "what does this
 * tier pay", and the growth ladder has to keep showing an owner what 500 and
 * 1,000 and 5,000 are worth whether or not they have filled anything in. Hiding
 * the reward is the wrong way to ask for the form.
 *
 * This is the one the MONEY paths use, and the only difference is the gate.
 *
 * Why a server has to describe itself before it earns: a brand buys "PUBG
 * players in MENA". A server with no games named, no audience description and
 * nobody to email is not inventory, it is a number — and a revenue share on
 * something we cannot sell is not a share of anything. Three fields in exchange
 * for a percentage is the minimum that makes the percentage possible to earn.
 *
 * Nothing already settled is affected: this decides FUTURE splits, and a payout
 * that has been calculated stays calculated.
 */
export function earningOwnerPct(linked: number, profileComplete: boolean): number {
  return profileComplete ? ownerPctFor(linked) : 0;
}

/** What Cluster keeps once the owner has taken theirs. Never negative. */
export function clusterPctFor(linked: number, cfg: PricingConfig = PRICING_DEFAULTS): number {
  return Math.max(0, platformFeePct(cfg) - ownerPctFor(linked));
}

/** The next rung: what it takes, and what it's worth. Null at the top. */
export function nextEarnTier(linked: number): EarnTier | null {
  return EARN_TIERS.find((t) => t.threshold > linked) ?? null;
}

export type ChallengeEarning = {
  /** What the brand paid for this challenge. */
  price: number;
  /** The prize pool — won by gamers, not by the owner. */
  prizePool: number;
  /** The whole platform fee on this challenge, before it is apportioned. */
  platformFee: number;
  /** This server's share of the entrants, 0–1. */
  serverShare: number;
  /** The owner's percentage at their current tier. */
  ownerPct: number;
  /** What the owner earned from this challenge. */
  owner: number;
  /** What this server's members won from the prize pool. */
  membersWon: number;
};

/**
 * One challenge's earnings for one server.
 *
 * `entrants` / `totalEntrants` is the apportionment. When a challenge had no
 * entrants anywhere it is split evenly across the servers that carried it,
 * which is the only fair answer when there is no participation to weigh.
 */
export function challengeEarning(opts: {
  linked: number;
  entrants: number;
  totalEntrants: number;
  serversCarrying?: number;
  membersWon?: number;
  cfg?: PricingConfig;
  /**
   * Has this server described itself? (B47)
   *
   * Defaults to TRUE so every projection, ladder and "what you could earn"
   * calculation keeps showing the real number. Only the paths that decide an
   * actual split pass the real value — a gate that silently zeroed every
   * illustration would be telling owners the tier is worthless.
   */
  profileComplete?: boolean;
}): ChallengeEarning {
  const cfg = opts.cfg ?? PRICING_DEFAULTS;
  const ownerPct = earningOwnerPct(opts.linked, opts.profileComplete !== false);
  const serverShare = opts.totalEntrants > 0
    ? Math.max(0, Math.min(1, opts.entrants / opts.totalEntrants))
    : 1 / Math.max(1, opts.serversCarrying ?? 1);
  const platformFee = round2(cfg.challengePrice * (platformFeePct(cfg) / 100));
  return {
    price: cfg.challengePrice,
    prizePool: cfg.prizePool,
    platformFee,
    serverShare,
    ownerPct,
    owner: round2(cfg.challengePrice * (ownerPct / 100) * serverShare),
    membersWon: opts.membersWon ?? 0,
  };
}

/**
 * What a server would earn per month at a given tier, if it were the whole
 * audience for the challenges it carries.
 *
 * The honest label for this is "at full share" — it is the ceiling, used on the
 * ladder to show what a rung is worth, never as a promise of what will arrive.
 */
export function monthlyCeiling(linked: number, gamesSponsored = 1, cfg: PricingConfig = PRICING_DEFAULTS): number {
  return round2(cfg.challengePrice * (ownerPctFor(linked) / 100) * cfg.challengesPerGame * Math.max(0, gamesSponsored));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
