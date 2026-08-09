// The prize money that never reaches a gamer. C14.
//
// THE FINDING: "50% goes to gamers" is not true, and cannot be. A prize is
// awarded as a TROPHY and becomes cash only when it is redeemed, and
// `MIN_REDEEM_AGE = 18`. Under a global-16 age floor, a 16- or 17-year-old can
// win $100 and never collect it. Adults forget, lose interest, delete their
// account. Whatever is not redeemed stays with us.
//
// So there is a fourth, unmeasured line in the split — breakage — and we were
// calling it a payout.
//
// ===== THE RULE THIS FILE ENFORCES =====
//
// **Breakage is measured and reported. It is never banked.**
//
// Concretely: unredeemed prize value stays in the PRIZE vault as a liability.
// It is not swept into Cluster revenue, not counted toward margin, and not
// netted off the next challenge's funding. It is a number on a screen with a
// name on it.
//
// That is a deliberate choice and it is the conservative one. A gift-card
// business books breakage as revenue on an actuarial schedule; doing that here
// would mean recognising money out of teenagers who were told they had won it,
// on a platform that has not run for long enough to have an actuarial anything.
// If that ever changes it should change as a decision somebody makes, with a
// date and a policy — not as an accident of a sweep job.
//
// ===== WHAT IS NOT DECIDED HERE =====
//
// Whether an unredeemed trophy ever EXPIRES. It does not today, and this file
// deliberately does not invent one: an expiry is a term in an agreement with
// gamers, several US states regulate it for stored value, and inventing it in a
// reporting module is how a platform ends up with an escheatment problem it
// never discussed. Flagged for counsel in the same breath as the age floor.

import { eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { MIN_REDEEM_AGE, ageForBand } from "@/lib/eligibility";
import { AGE_BANDS, LEGACY_BANDS, type StoredBand } from "@/lib/age";

export type Breakage = {
  /** Prize value awarded, ever. */
  awarded: number;
  /** …of which has been redeemed for cash. */
  redeemed: number;
  /** …and is still sitting on a shelf. This is a LIABILITY, not income. */
  outstanding: number;
  /**
   * The part of `outstanding` held by somebody who cannot redeem it TODAY
   * because of their age.
   *
   * Not the same as breakage — a 16-year-old becomes an adult. It is the part
   * of the promise that is currently un-collectable, which is the number that
   * makes "50% goes to gamers" false, and it deserves to be seen separately
   * from an adult who simply has not got round to it.
   */
  heldByUnderAge: number;
  /** Held by an account that is deleted or suspended. Realistically gone. */
  heldByGoneAccounts: number;
  /** `outstanding` ÷ `awarded`, 0–1. Null when nothing was ever awarded. */
  outstandingRate: number | null;
};

const EMPTY: Breakage = {
  awarded: 0, redeemed: 0, outstanding: 0,
  heldByUnderAge: 0, heldByGoneAccounts: 0, outstandingRate: null,
};

/**
 * Bands that cannot turn a trophy into money today.
 *
 * Derived over the SELECTABLE bands and the legacy ones together (B95). The
 * legacy `under16` band cannot be chosen any more but rows still carry it, and
 * a breakage figure that ignored them would count trophies as collectable that
 * nobody can collect — which is the exact flattering assumption this whole file
 * exists to stop making.
 */
export const CANNOT_REDEEM: StoredBand[] = [...AGE_BANDS, ...LEGACY_BANDS].filter(
  (b) => (ageForBand(b) ?? 0) < MIN_REDEEM_AGE,
);

/**
 * Measure it.
 *
 * Runs off `user_trophies` and `trophy_redeems` — the two tables that already
 * hold the truth — rather than a stored counter, for the same reason vault
 * balances are summed: a counter drifts and cannot be recomputed.
 *
 * An unset age band counts as under-age. It is the honest reading: a gamer who
 * has not told us their age cannot be paid, so the value they hold is not
 * currently collectable.
 */
export async function measureBreakage(db: DB): Promise<Breakage> {
  try {
    // Awarded value, from the trophy's stored value at award time. Prices move;
    // what was won does not.
    const [awardedRow] = await db.select({
      n: sql<number>`coalesce(sum(${schema.trophies.value}), 0)`,
    }).from(schema.userTrophies)
      .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id));
    const awarded = round2(Number(awardedRow?.n ?? 0));

    // Paid out. Only rows that actually settled — an approved redemption that
    // never sent is still outstanding, and counting it would understate what we
    // owe by exactly the amount most likely to go wrong.
    const [redeemedRow] = await db.select({
      n: sql<number>`coalesce(sum(${schema.trophyRedeems.amount}), 0)`,
    }).from(schema.trophyRedeems)
      .where(eq(schema.trophyRedeems.status, "paid"));
    const redeemed = round2(Number(redeemedRow?.n ?? 0));

    // Who is holding the rest. One grouped query rather than a query per band.
    const held = await db.select({
      band: schema.users.ageBand,
      status: schema.users.status,
      n: sql<number>`coalesce(sum(${schema.trophies.value}), 0)`,
    }).from(schema.userTrophies)
      .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
      .innerJoin(schema.users, eq(schema.userTrophies.userId, schema.users.id))
      .groupBy(schema.users.ageBand, schema.users.status);

    let heldByUnderAge = 0;
    let heldByGoneAccounts = 0;
    for (const r of held) {
      const v = Number(r.n ?? 0);
      if (r.status !== "active") { heldByGoneAccounts += v; continue; }
      // An unset band cannot be paid, so it counts as un-collectable. Reading it
      // as adult would be the flattering assumption, and the flattering
      // assumption is what made "50% goes to gamers" wrong in the first place.
      const band = r.band as StoredBand | null;
      if (!band || (CANNOT_REDEEM as string[]).includes(band)) heldByUnderAge += v;
    }

    const outstanding = round2(Math.max(0, awarded - redeemed));
    return {
      awarded,
      redeemed,
      outstanding,
      heldByUnderAge: round2(Math.min(heldByUnderAge, outstanding)),
      heldByGoneAccounts: round2(Math.min(heldByGoneAccounts, outstanding)),
      outstandingRate: awarded > 0 ? outstanding / awarded : null,
    };
  } catch { return EMPTY; }
}

/**
 * The honest version of "half of every dollar reaches gamers".
 *
 * Returns the share that ACTUALLY reached them, given what has been redeemed.
 * Null until something has been awarded, because a rate computed from nothing
 * is 0% or 100% depending on which way you round it, and both are lies.
 *
 * Anything published as "% to gamers" should quote the promised share and this
 * number together. One is what we set aside; the other is what arrived.
 */
export function reachedGamersPct(b: Breakage, promisedPct: number): number | null {
  if (!(b.awarded > 0)) return null;
  return Math.round(promisedPct * (b.redeemed / b.awarded) * 10) / 10;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
