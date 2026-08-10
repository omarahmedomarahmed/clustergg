// The four pools, and how a sale divides between them. B120.
//
// ===== WHY THIS IS ITS OWN MODULE =====
//
// It lived in `lib/vaults.ts`, which imports the database. That made the split
// unreachable from every PURE module that needs it — `lib/pricing.ts` runs in
// the browser to drive the rate-card slider, `lib/finance.ts` runs in the
// browser to drive the model sliders, and neither may pull a `pg` client into
// the bundle.
//
// So both of them worked around it, and the workaround is what this file
// exists to end: they described our margin as **everything that is not prize
// money**, because that was the only figure they could compute without the
// split. See `platformSharePct` below for what that cost.

/** The four pools money is divided into. */
export const VAULTS = ["prize", "server", "cp", "cluster"] as const;
export type Vault = (typeof VAULTS)[number];

/**
 * The default split of a challenge, as PERCENTAGES.
 *
 * Percentages, never fixed dollars, so the price is a dial: move
 * `challengePrice` and every pool moves with it. Hard-coding a dollar prize and
 * deriving the percentage from it meant $350 gave 50% by coincidence and $400
 * would have silently given 44%.
 *
 * The prize half is fixed. The other half splits three ways with ONE of the
 * three holding 20 while the other two hold 15 — see `SPLIT_PRESETS`.
 */
export const DEFAULT_SPLIT: Record<Vault, number> = {
  prize: 50,
  cluster: 20,
  server: 15,
  cp: 15,
};

/**
 * The three positions of the one switch an operator actually touches.
 *
 * Deliberately a switch and not four number inputs: whoever runs this day to
 * day should never have to do arithmetic to keep a money invariant true.
 */
export const SPLIT_PRESETS: Record<string, Record<Vault, number>> = {
  default: { prize: 50, cluster: 20, server: 15, cp: 15 },
  "grow-servers": { prize: 50, cluster: 15, server: 20, cp: 15 },
  "grow-gamers": { prize: 50, cluster: 15, server: 15, cp: 20 },
};

/**
 * OUR share of a sale, as a percentage. The only one of the four we keep.
 *
 * ===== THE NUMBER THIS FIXES =====
 *
 * The investor deck printed a line labelled "gross margin per challenge" and
 * filled it with `price − prizePool`: $175 out of $350. That is not margin. It
 * is everything that is not prize money, and three quarters of the way down
 * this same file is the reason why — the server pool and the points vault are
 * 15% each, and both are obligations that leave.
 *
 * Our actual share of a $350 challenge is $70. The deck was showing a gross
 * margin two and a half times the real one, on the slide an investor checks
 * first, and the financial model computed contribution per brand the same wrong
 * way underneath it.
 *
 * It was an honest error with an obvious cause: the figure was written in a
 * pure module that could not see the split, so it used the only subtraction
 * available to it. That is why the split now lives somewhere both can reach.
 */
export function platformSharePct(split: Record<Vault, number> = DEFAULT_SPLIT): number {
  return Math.max(0, Math.min(100, split.cluster));
}

/**
 * What leaves on every sale: the prize pool, the server pool and the points
 * vault. Three obligations, not one.
 */
export function obligationSharePct(split: Record<Vault, number> = DEFAULT_SPLIT): number {
  return Math.max(0, Math.min(100, split.prize + split.server + split.cp));
}
