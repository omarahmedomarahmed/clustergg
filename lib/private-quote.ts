// What a private challenge costs. B90.4.
//
// Split out of `lib/private-challenge.ts` because the CLIENT needs it: the
// owner has to see the fee before they press the button, and the buying half
// pulls in the wallet, which pulls in the weekly close, which pulls in
// `next/headers`. A price that can only be computed on the server is a price
// the person paying it finds out after the fact.

/** Our margin on a private challenge, as a percentage of the prize pool. */
export const PRIVATE_FEE_PCT = 5;

/**
 * The smallest prize pool an owner can put up. M6 brought it from $20 to $5.
 *
 * ===== WHY IT CAME DOWN =====
 *
 * A private challenge is bought out of the server's own wallet, and that wallet
 * fills from the weekly pool. M3 lowered the bar to start earning to
 * `EARN_FLOOR` linked members, so the servers we are now inviting are small and
 * their weekly share is small with it.
 *
 * A $20 floor on a server earning a couple of dollars a week is a month of
 * watching a number climb before anything can be done with it — which is long
 * enough to stop believing the number. At $5 the first thing an owner can DO
 * with their earnings arrives in the first fortnight.
 *
 * It is also the lower of the two thresholds on purpose: spending your balance
 * inside the platform opens before withdrawing it (`MIN_WITHDRAWAL`, $10),
 * because a distribution into a wallet costs nothing to make while a transfer
 * out pays a provider fee.
 */
export const MIN_PRIZE_POOL = 5;

/**
 * Prize pools move in whole `$5` steps.
 *
 * Not decoration: a pool is prize money that gets divided between winners, and
 * an owner picking $23.47 produces places worth $7.82 each. Steps of five keep
 * every split a number a member can read off the card. It is also the same unit
 * as the minimum, so the ladder from "I can afford one" upward has no awkward
 * first rung.
 */
export const PRIZE_POOL_STEP = 5;

/** And a ceiling, because a typo with an extra zero is a real thing. */
export const MAX_PRIZE_POOL = 5000;

/**
 * The nearest legal pool at or below what was asked for.
 *
 * Rounds DOWN, never up. Rounding a wallet-funded purchase up is charging
 * somebody more than the number they typed, which is the one direction this
 * must never go.
 */
export function roundPool(n: number): number {
  const v = Math.floor((Number(n) || 0) / PRIZE_POOL_STEP) * PRIZE_POOL_STEP;
  return Math.min(MAX_PRIZE_POOL, Math.max(MIN_PRIZE_POOL, v));
}

/** Whether a pool is one the buy path will accept, stated once so every caller agrees. */
export function poolIsLegal(n: number): boolean {
  return Number.isFinite(n) && n >= MIN_PRIZE_POOL && n <= MAX_PRIZE_POOL && n % PRIZE_POOL_STEP === 0;
}

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
