// How old somebody says they are, and what that lets them do. B72.4.
//
// THE FINDING: there was no age gate at signup. A date of birth was asked for
// at CASH-OUT, which is the worst possible place — by then we have collected a
// child's Discord identity, their linked game accounts, their IP and their
// activity, and the moment they tell us their age we have what COPPA calls
// "actual knowledge". Asking late does not protect a child; it documents that
// we did not ask.
//
// WHAT WE ASK, and it is deliberately less than before: a BAND, never a date of
// birth. We do not want anybody's birthday. We want one fact — are we allowed
// to pay this person — and a band answers it while a date answers far more than
// we need. `users.birthDate` stops being collected and B80's purge deletes what
// is already stored.
//
// WHY 16 AND NOT 13. COPPA's line is 13 and the UK's is 13, so a US/UK-only
// product could use it. GDPR-K sets the EU default at **16**, lowered per member
// state to 13–15 — France 15, Germany and Ireland 16. A flat 13 processes the
// EU 13–15 cohort without valid consent. One line at 16 is defensible
// everywhere we would plausibly operate and needs no geo detection to get
// wrong. It costs us the 13–15 earning cohort, which on a Discord gaming
// platform is not nothing, and that is the trade the owner made deliberately:
// going from 16 down later is easy, going from 13 up means taking something
// away from people who already have it.
//
// ⚠ The bands and the wording are for counsel to confirm. The sharper question
// to put to them is not "is self-declaration enough" but **"are we a service
// DIRECTED TO CHILDREN, or a general-audience service with a child audience?"**
// — because only the second makes a self-declared band work at all.
//
// WHAT THIS IS NOT: verification. Anybody can click 18+. What a band buys is a
// record of having asked, a basis to act on the answer, and a product that does
// not pay money to somebody who told us they are twelve. Said plainly here so
// nobody later reads it as more than it is.

export const AGE_BANDS = ["under16", "teen", "adult"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
/** Nobody has answered yet. Distinct from every band, and it earns nothing. */
export type AgeBandOrUnset = AgeBand | null;

export const BAND_LABEL: Record<AgeBand, string> = {
  under16: "Under 16",
  teen: "16 or 17",
  adult: "18 or over",
};

/** What each band is allowed to do. One table, read by every gate. */
export const BAND_RULES: Record<AgeBand, {
  /** Link a game account, join a challenge, hold a trophy. */
  play: boolean;
  /** Earn CP at all. */
  earn: boolean;
  /** Turn trophies into money. */
  redeem: boolean;
}> = {
  // Read-only. They can look at the site and the bot; nothing accrues to them
  // and nothing is collected beyond what an account already needed.
  //
  // Chosen over "no account at all", which is honest but harsh and mostly
  // teaches people to lie, and over "everything except cashing out", which
  // still runs a rewards experience aimed at a child.
  under16: { play: false, earn: false, redeem: false },
  // The full platform and CP earning. Redemption stays behind 18 because being
  // PAID is a contract and a minor's contract is voidable nearly everywhere —
  // that rule predates this file (`MIN_REDEEM_AGE`) and is unchanged.
  teen: { play: true, earn: true, redeem: false },
  adult: { play: true, earn: true, redeem: true },
};

/** Unset is not a band. It earns nothing, plays nothing, and is asked again. */
export const rulesFor = (band: AgeBandOrUnset) =>
  band ? BAND_RULES[band] : { play: false, earn: false, redeem: false };

export const parseBand = (raw: unknown): AgeBandOrUnset =>
  (AGE_BANDS as readonly string[]).includes(String(raw)) ? (raw as AgeBand) : null;

/**
 * How many times a gamer may change their own band before it locks.
 *
 * THE REASON THIS EXISTS AT ALL: the band is the first thing asked, in one
 * click, with no confirm step. That is the right shape for getting an honest
 * answer quickly, and it means a mis-tap is inevitable — and a mis-tap onto
 * "Under 16" locks somebody out of the entire product with no way back. A gate
 * with no correction path is a support queue.
 *
 * So it is editable from account settings. Counted, because a band that can be
 * changed without limit is a band that means nothing: somebody who moves
 * between "twelve" and "nineteen" three times is telling us something, and the
 * lock is what makes that visible rather than silently absorbed.
 *
 * Same shape and same number as `MAX_METHOD_CHANGES` on the payout preference,
 * deliberately — one rule for "you may correct this, but not endlessly", not
 * two that drift.
 */
export const MAX_BAND_CHANGES = 3;

export type BandChange =
  | { ok: true; band: AgeBand; locked: boolean }
  | { ok: false; error: string };

/**
 * May this gamer move to this band?
 *
 * Pure, so the rule can be tested without a database and stated the same way in
 * the UI as in the action.
 */
export function changeBand(
  current: AgeBandOrUnset,
  changes: number,
  next: unknown,
): BandChange {
  const band = parseBand(next);
  if (!band) return { ok: false, error: "Pick one of the three options." };
  // Setting it for the first time is not a change. Charging somebody a change
  // for answering the question would mean the first mis-tap costs two.
  if (!current) return { ok: true, band, locked: false };
  if (band === current) return { ok: true, band, locked: changes >= MAX_BAND_CHANGES };
  if (changes >= MAX_BAND_CHANGES) {
    return {
      ok: false,
      error: "Your age range is locked after three changes. Message support and we'll sort it.",
    };
  }
  return { ok: true, band, locked: changes + 1 >= MAX_BAND_CHANGES };
}
