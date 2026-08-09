// What a private challenge costs. B90.4.
//
// Split out of `lib/private-challenge.ts` because the CLIENT needs it: the
// owner has to see the fee before they press the button, and the buying half
// pulls in the wallet, which pulls in the weekly close, which pulls in
// `next/headers`. A price that can only be computed on the server is a price
// the person paying it finds out after the fact.

/** Our margin on a private challenge, as a percentage of the prize pool. */
export const PRIVATE_FEE_PCT = 5;

/** The smallest prize pool worth running. Below this the fee is rounding. */
export const MIN_PRIZE_POOL = 20;

/** And a ceiling, because a typo with an extra zero is a real thing. */
export const MAX_PRIZE_POOL = 5000;

export type PrivateQuote = {
  prizePool: number;
  fee: number;
  feePct: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function quotePrivate(prizePool: number, feePct = PRIVATE_FEE_PCT): PrivateQuote {
  const pool = round2(Math.max(0, Number(prizePool) || 0));
  const fee = round2(pool * (feePct / 100));
  return { prizePool: pool, fee, feePct, total: round2(pool + fee) };
}
