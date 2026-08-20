// Every figure this platform decides, in one module.
//
// House rule 2: **import numbers, never retype them.** Every page, document,
// card and invoice reads from here. The rule exists because a document was
// found quoting an owner's withdrawal floor at twice its real value, and a
// test suite was found enforcing a revenue ceiling nobody believed — both of
// them numbers that had been typed a second time and then drifted.
//
// ===== MONEY IS AN INTEGER NUMBER OF CENTS, EVERYWHERE =====
//
// Not a float, not a decimal string, not dollars. `0.1 + 0.2` is famously not
// `0.3`, and a platform whose core promise is "the vault balance equals the
// sum of every unredeemed trophy" cannot afford an invariant that fails by a
// thousandth of a cent after nine hundred additions. Cents are exact, they add
// exactly, and JavaScript's safe integer range covers ninety trillion dollars.
//
// The only place dollars exist is `formatMoney`, on the way to a screen.

/** The unit. One challenge, one game, one week. docs/00-TRUTH.md M1. */
export const CHALLENGE_PRICE_CENTS = 35_000;

/**
 * The split, as basis points of income. M2, M3, M4.
 *
 * An **operator setting**, not a constant welded into the logic
 * (docs/02-MONEY.md §2) — these are the defaults the settings table starts
 * from, and `splitOf` takes the live values. The prize half is fixed; the
 * other half divides two ways.
 */
export const DEFAULT_SPLIT_BPS = {
  prize: 5_000,
  server: 2_500,
  cluster: 2_500,
} as const;

export type SplitBps = { prize: number; server: number; cluster: number };

/** Basis points in a whole. 100% = 10,000 bps. */
export const BPS = 10_000;

/**
 * The pool may never exceed half the vault. M9, and docs/02-MONEY.md §3.
 *
 * Held as a divisor rather than `0.5` so the guard, the admin screen and the
 * refusal message all read the same value. The held half funds refunds,
 * disputes and quiet weeks — and it is what a clawback draws on when a brand
 * pulls out after a pool has been paid.
 */
export const POOL_MAX_FRACTION_OF_VAULT = 1 / 2;

/**
 * How a weekly pool divides. docs/02-MONEY.md §4.
 *
 * The flat share is the interesting number: turning up is worth something, so
 * a fifth of every pool is split evenly among servers that carried an entrant
 * regardless of how well they did. Without it a small server that brought two
 * genuine players earns approximately nothing and stops bothering.
 */
export const POOL_FLAT_BPS = 2_000;
export const POOL_SCORED_BPS = BPS - POOL_FLAT_BPS;

/**
 * The three KPI weights. K1, K2, K3 in docs/00-TRUTH.md §7.
 *
 * They sum to 100 and a test asserts it. None of them may measure Discord
 * activity — that was the ToS violation in the old model, and it is why all
 * three measure outcomes on our own platform.
 */
export const KPI_WEIGHTS = {
  /**
   * Exclusive entrants. Volume.
   *
   * This comment used to end *"a gamer in two servers is worth ½ to each"* —
   * **the model Sprint 5 deleted**, sitting in the module that owns the
   * weights. `97-copy-rule` could not see it because it strips comments before
   * scanning, which is correct for rendered copy and blind here. What credits
   * an entrant is `lib/identity/attribution.ts`, and it is parent + join.
   */
  entrants: 40,
  /** Entrants ÷ linked members. Efficiency. */
  conversion: 30,
  /** Entrants who scored above zero ÷ entrants. Quality — this kills fake entrants. */
  activation: 30,
} as const;

/**
 * Community challenge tiers. M20, M21.
 *
 * Owner money pays into the prize vault and Cluster only, and **never** vault
 * 3 (M22, C2): paying an owner out of a pool their own money funded would pay
 * them twice.
 */
export const COMMUNITY_TIERS = {
  1: { prizeCents: 500, winners: 1, marginBps: 0 },
  2: { prizeCents: 1_000, winners: 3, marginBps: 500 },
} as const;

export type CommunityTier = keyof typeof COMMUNITY_TIERS;

/** What a server owner pays for a community challenge: prize plus margin. */
export function communityPriceCents(tier: CommunityTier): number {
  const t = COMMUNITY_TIERS[tier];
  return t.prizeCents + Math.round((t.prizeCents * t.marginBps) / BPS);
}

/** Trophies are held for five years. V9 — a 13-year-old must still have theirs at 18. */
export const TROPHY_HOLD_YEARS = 5;

/** Never describe an audience group smaller than this. Content rule C6. */
export const MIN_AUDIENCE_GROUP = 25;

/**
 * Split an amount across the vaults, exactly.
 *
 * ===== THE REMAINDER HAS TO GO SOMEWHERE, AND IT IS NOT THE PRIZE VAULT =====
 *
 * `$10.50 × 5%` is 52.5 cents. Three shares of an odd number of cents cannot
 * all be whole, so something absorbs the rounding. Cluster absorbs it, and
 * that direction is deliberate in both cases:
 *
 *   * A cent too few in the prize vault breaks the invariant that vault 2
 *     covers every unredeemed trophy. The platform's core promise fails over
 *     a rounding error.
 *   * A cent too few in the server vault is a cent owed to somebody else.
 *
 * So prize and server are rounded to the nearest cent and Cluster takes what
 * is left, which may be a cent under. We are the only party that can be short
 * without anybody being owed.
 */
export function splitOf(
  amountCents: number,
  bps: SplitBps = DEFAULT_SPLIT_BPS,
): { prize: number; server: number; cluster: number } {
  if (!Number.isInteger(amountCents)) {
    throw new Error(`Money must be whole cents; got ${amountCents}`);
  }
  if (bps.prize + bps.server + bps.cluster !== BPS) {
    throw new Error(
      `A split must account for every cent: ${bps.prize} + ${bps.server} + ` +
        `${bps.cluster} bps is not ${BPS}`,
    );
  }
  const prize = Math.round((amountCents * bps.prize) / BPS);
  const server = Math.round((amountCents * bps.server) / BPS);
  return { prize, server, cluster: amountCents - prize - server };
}

/**
 * The split for owner money. M22.
 *
 * The same function would be wrong here, and quietly: a community challenge
 * routed through the standard split would put 25% into vault 3, and vault 3 is
 * what pays owners. The owner would be funding their own payout. So this is a
 * separate function rather than a parameter, because the difference is a rule
 * and not a configuration.
 */
export function communitySplitOf(tier: CommunityTier): {
  prize: number;
  server: number;
  cluster: number;
} {
  const t = COMMUNITY_TIERS[tier];
  return {
    prize: t.prizeCents,
    server: 0,
    cluster: communityPriceCents(tier) - t.prizeCents,
  };
}

/** Cents to the string a human reads. The only place dollars exist. */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
