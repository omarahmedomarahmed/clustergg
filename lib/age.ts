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

// ===== B95: TWO OPTIONS, AND UNDER-13 IS NOT ONE OF THEM =====
//
// The bands were three: under-16, 16–17, 18+. Two problems with that, and the
// second is the serious one.
//
// FIRST, 16 was the wrong line for the product we ended up with. It was chosen
// to be defensible everywhere without geo-detection, and it cost us the 13–15
// cohort — which on a Discord gaming platform is a large share of everybody.
// The line that actually matters is not "may we process their data" (COPPA's 13,
// and we handle consent at signup) but "may we PAY them" — and that line is 18
// and has always been 18. So the bands are now 13–17 and 18+.
//
// SECOND, AND THIS IS THE POINT: **under-13 is not selectable.** A picker with
// "Under 13" in it teaches a twelve-year-old to click one of the other two, and
// then we have a child in the product with a declared age we know is a lie and
// a record that we asked. Below the two options is a LINK — "I'm under 13" —
// which explains the law, asks for a confirmation, and then deletes the account.
// See `lib/under13.ts`; nothing about it lives in this file, because it is not a
// band and must never be storable as one.

export const AGE_BANDS = ["teen", "adult"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
/** Nobody has answered yet. Distinct from every band, and it earns nothing. */
export type AgeBandOrUnset = AgeBand | null;

/**
 * Bands that exist in the database and can no longer be chosen.
 *
 * `under16` is B72.4's bottom band. Rows still carry it, and it still means
 * exactly what it meant — no play, no earning, no redemption — so it is read
 * everywhere it was read before and simply cannot be written any more.
 */
export const LEGACY_BANDS = ["under16"] as const;
export type StoredBand = AgeBand | (typeof LEGACY_BANDS)[number];

export const BAND_LABEL: Record<StoredBand, string> = {
  under16: "Under 16",
  teen: "13 to 17",
  adult: "18 or over",
};

/** What each band is allowed to do. One table, read by every gate. */
export const BAND_RULES: Record<StoredBand, {
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
  // 13 to 17. The full platform and CP earning. Redemption stays behind 18
  // because being PAID is a contract and a minor's contract is voidable nearly
  // everywhere — that rule predates this file (`MIN_REDEEM_AGE`) and is
  // unchanged. What they win is HELD, not forfeited: a trophy sits in the case
  // and becomes redeemable on the day they change the band to adult.
  teen: { play: true, earn: true, redeem: false },
  adult: { play: true, earn: true, redeem: true },
};

/** Unset is not a band. It earns nothing, plays nothing, and is asked again. */
export const rulesFor = (band: AgeBandOrUnset) =>
  band ? BAND_RULES[band] : { play: false, earn: false, redeem: false };

export const parseBand = (raw: unknown): AgeBandOrUnset =>
  (AGE_BANDS as readonly string[]).includes(String(raw)) ? (raw as AgeBand) : null;

/**
 * How many times a gamer may change their own band. **Zero.** B95.
 *
 * It was three, on the reasoning that the band was asked in one click with no
 * confirm step, so a mis-tap was inevitable and a gate with no correction path
 * is a support queue with extra steps. That reasoning was right about the OLD
 * shape and is answered by the new one: the band is now chosen on the
 * onboarding page, where selecting it shows what it means and a separate
 * confirm button saves it. Nobody mis-taps through two deliberate actions.
 *
 * What a self-serve change actually buys, once the mis-tap is designed out, is
 * a teenager clicking "18 or over" on their birthday-minus-two-years and cashing
 * out. The band is the only thing standing between a minor and a payment we are
 * not allowed to make, and a fact somebody can rewrite whenever it becomes
 * inconvenient is not a fact.
 *
 * So: a genuine correction goes through gamer support, who can see the account
 * and the history. The settings page says exactly that rather than showing a
 * disabled control with no explanation.
 */
export const MAX_BAND_CHANGES = 0;

/** What settings, the bot and the support desk all say. One sentence, one place. */
export const BAND_CHANGE_HELP =
  "Your age range is set once. If it is wrong, message gamer support in the HQ server and they will fix it — it is a two-minute conversation and it is the only way it can be changed.";

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
  if (!band) return { ok: false, error: "Pick one of the two options." };
  // Answering for the first time is not a change, and it is the only write this
  // function ever allows. With MAX_BAND_CHANGES at zero every later attempt
  // falls through to the support message below.
  if (!current) return { ok: true, band, locked: MAX_BAND_CHANGES <= 0 };
  if (band === current) return { ok: true, band, locked: changes >= MAX_BAND_CHANGES };
  if (changes >= MAX_BAND_CHANGES) return { ok: false, error: BAND_CHANGE_HELP };
  return { ok: true, band, locked: changes + 1 >= MAX_BAND_CHANGES };
}
