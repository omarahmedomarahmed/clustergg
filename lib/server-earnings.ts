import { PRICING_DEFAULTS, prizeSharePct, type PricingConfig } from "@/lib/pricing";

// What a server owner earns, and where it comes from. Rewritten by C3.
//
// ===== WHAT THIS FILE USED TO DO, AND WHY IT STOPPED =====
//
// A server's tier used to be a RATE: 5%, 10% or 25% of every sponsored
// challenge, apportioned by the share of entrants that server contributed.
// `docs/MODEL.md` §4 replaced it with a weekly competitive pool,
// and the two could not both exist — running them together would pay owners
// twice out of a 15% line and promise them twice on a public page.
//
// So the rate is gone. `ownerPctFor`, `earningOwnerPct`, `clusterPctFor` and
// `monthlyCeiling` were deleted rather than zeroed, because a function that
// returns 0% is one somebody re-enables; a function that does not exist is a
// compile error at every site that assumed it.
//
// ===== WHY A POOL INSTEAD OF A RATE =====
//
// A percentage "of every sponsored challenge" cannot mean the whole challenge
// once more than one server carries it: forty servers each taking 25% of the
// same $350 is 1000% of a number we collected once. The old code solved that by
// apportioning on entrant share — correct arithmetic, but it made an owner's
// income depend on how many OTHER servers happened to carry the same week,
// which is neither predictable nor anything they can influence.
//
// The pool inverts it. A fixed 15% of every sale goes into the server vault,
// 20% of that is paid flat to everyone who carried a challenge, and the rest is
// competed for on things that cost real effort to move. `lib/server-score.ts`
// holds the scoring; `lib/week-close.ts` runs it.
//
// ===== WHAT TIERS ARE NOW =====
//
// Labels. A tier decides who a server competes against in the weekly pool and
// nothing else. The thresholds are unchanged so an owner's badge does not move
// under them, and the perks that were never money — priority, exclusivity,
// being named on the broadcast — are unchanged too.

export type EarnTier = {
  key: string;
  /** Linked gamers required. Linked — not members, not joins. */
  threshold: number;
};

/** Size labels. There is deliberately no rate on them any more — C3. */
export const EARN_TIERS: EarnTier[] = [
  { key: "seed", threshold: 0 },
  { key: "monetized", threshold: 500 },
  { key: "broadcaster", threshold: 1000 },
  { key: "sponsored", threshold: 5000 },
];

/** The whole platform fee, as a % of the challenge price. 100 − the prize share. */
export function platformFeePct(cfg: PricingConfig = PRICING_DEFAULTS): number {
  return Math.max(0, 100 - prizeSharePct(cfg));
}

/** The next rung, and what it takes to reach it. Null at the top. */
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
  /** What this server's members won from the prize pool. Never the owner's. */
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
  entrants: number;
  totalEntrants: number;
  serversCarrying?: number;
  membersWon?: number;
  cfg?: PricingConfig;
}): ChallengeEarning {
  const cfg = opts.cfg ?? PRICING_DEFAULTS;
  const serverShare = opts.totalEntrants > 0
    ? Math.max(0, Math.min(1, opts.entrants / opts.totalEntrants))
    : 1 / Math.max(1, opts.serversCarrying ?? 1);
  return {
    price: cfg.challengePrice,
    prizePool: cfg.prizePool,
    platformFee: round2(cfg.challengePrice * (platformFeePct(cfg) / 100)),
    serverShare,
    membersWon: opts.membersWon ?? 0,
  };
}

// `monthlyCeiling` was here. C3 deleted it with the rest of the rate: it
// answered "what would this tier pay at full share", and under the pool there
// is no per-tier rate to project from. What an owner can be shown instead is
// the live pool and their rank in it — a real number about this week rather
// than a ceiling nobody ever reached.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
