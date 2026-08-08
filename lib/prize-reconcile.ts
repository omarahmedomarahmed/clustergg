// Does a challenge award what it promised? C15.
//
// THE FINDING: nothing checked. The pool is a percentage of what the brand paid
// (`lib/pricing.ts`), and the prizes are TROPHY IDS chosen per challenge
// (`challenges.prizes`). The two numbers were never compared, so a challenge
// could promise $175 and award $40 of trophies, or $400, and both would run to
// completion without a single line of code noticing.
//
// Under-awarding is money we told a brand went to their audience and kept.
// Over-awarding is money that left the prize vault and was never funded. The
// first is the one that ends a company; the second is the one that ends a
// quarter. Neither had a detector.
//
// This module is PURE so the rule can be stated once and checked from the award
// path, the admin console and a test without a database.

/** Whole cents, so a float sum never reports a $0.0000001 discrepancy. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export type Reconciliation = {
  /** What the sale set aside for prizes. */
  promised: number;
  /** What the podium is actually worth. */
  awarded: number;
  /** awarded − promised. Negative means we kept some. */
  gap: number;
  verdict: "matches" | "under" | "over" | "unfunded";
  /** One sentence, written for an admin rather than a log file. */
  note: string;
};

/**
 * What a sponsored challenge owes its winners.
 *
 * A percentage of what the brand paid FOR THIS CHALLENGE, never a stored dollar
 * figure — see C2. An unsponsored challenge promises nothing, which is not the
 * same as promising zero: a welcome challenge or a house competition is funded
 * out of the raise and has no brand money behind it to reconcile against.
 */
export const promisedPool = (sponsorPrice: number, prizePct: number): number =>
  sponsorPrice > 0 ? round2(sponsorPrice * (Math.max(0, Math.min(100, prizePct)) / 100)) : 0;

/**
 * Compare, and say what it means.
 *
 * `tolerance` exists because trophies are priced in whole dollars while a pool
 * is a percentage of a price — $350 × 50% is exactly $175 and three trophies at
 * 4:2:1 hit it, but $333 × 50% is $166.50 and no set of dollar-priced trophies
 * lands on that. A dollar of slack is the difference between "the podium was
 * built from what we sell" and "somebody typed the wrong trophy".
 */
export function reconcilePrizes(opts: {
  promised: number;
  awarded: number;
  tolerance?: number;
}): Reconciliation {
  const promised = round2(opts.promised);
  const awarded = round2(opts.awarded);
  const tol = opts.tolerance ?? 1;
  const gap = round2(awarded - promised);

  if (promised <= 0) {
    return {
      promised, awarded, gap: 0, verdict: "unfunded",
      note: awarded > 0
        ? `Not sponsored — ${awarded.toFixed(2)} of trophies funded by us, nothing to reconcile against.`
        : "Not sponsored, and no trophies awarded.",
    };
  }
  if (Math.abs(gap) <= tol) {
    return { promised, awarded, gap, verdict: "matches", note: "The podium matches the pool." };
  }
  if (gap < 0) {
    return {
      promised, awarded, gap, verdict: "under",
      note: `Under-awarded by ${Math.abs(gap).toFixed(2)}. The brand was told ${promised.toFixed(2)} reached players and ${awarded.toFixed(2)} did.`,
    };
  }
  return {
    promised, awarded, gap, verdict: "over",
    note: `Over-awarded by ${gap.toFixed(2)}. That value left the prize vault without a sale funding it.`,
  };
}

/** Only these need a human. `matches` and `unfunded` are the normal states. */
export const needsAttention = (r: Reconciliation): boolean =>
  r.verdict === "under" || r.verdict === "over";
