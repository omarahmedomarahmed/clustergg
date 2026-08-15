// `unlockState` — derived, never stored.
//
// Onboarding is three things: link a game account, pick an age band, pick a
// country (docs/00-TRUTH.md G1). Nothing accrues until all three are done
// (U1). The temptation is a `users.onboarded` boolean, and it is the same
// temptation as a stored balance: a flag can disagree with the rows it claims
// to summarise, and once it does, nothing can tell you which one is lying.
//
// So there is no flag. This function reads the three facts and computes the
// answer, every time. The cost is one join. The benefit is that a gamer who
// unlinks their last game account is *immediately* not unlocked, everywhere,
// without anything having to remember to flip a bit.
//
// **This module is the only place that decides whether a gamer may enter a
// challenge.** Stage 4's entry chain calls `requireUnlocked` and does not
// re-derive the answer, because a second implementation is a second answer.

import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";

/** The three things onboarding asks for, in the order it asks for them. */
export const ONBOARDING_STEPS = ["link", "ageBand", "country"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type UnlockState = {
  /** True only when every step is done. Nothing accrues before this is true. */
  unlocked: boolean;
  /** Which steps are done. */
  done: Record<OnboardingStep, boolean>;
  /**
   * The steps still outstanding, in order.
   *
   * A refusal names what is missing (docs/06-JOURNEYS.md, "If they are
   * refused": *"which of the three steps is missing"*). "Complete onboarding"
   * is not a message, it is a shrug.
   */
  missing: OnboardingStep[];
  /** The step to send them to next, or null when there is nothing left. */
  next: OnboardingStep | null;
};

/** Everything the derivation needs. Kept separate so it can be tested without a database. */
export type UnlockFacts = {
  ageBand: string | null;
  country: string | null;
  linkedAccountCount: number;
};

/**
 * The derivation itself. Pure, so the rule can be exercised directly.
 *
 * Note what is *not* here: ownership proof. A game whose API cannot prove
 * ownership must not leave a gamer half-onboarded forever (G5 — "no badge, no
 * warning, no second class. It is not the gamer's fault the publisher has no
 * endpoint"). Linking is the step; proving is a property of the link.
 */
export function deriveUnlock(facts: UnlockFacts): UnlockState {
  const done: Record<OnboardingStep, boolean> = {
    link: facts.linkedAccountCount > 0,
    ageBand: facts.ageBand === "teen" || facts.ageBand === "adult",
    country: typeof facts.country === "string" && facts.country.length > 0,
  };
  const missing = ONBOARDING_STEPS.filter((s) => !done[s]);
  return {
    unlocked: missing.length === 0,
    done,
    missing,
    next: missing[0] ?? null,
  };
}

/** The same derivation, against a real gamer. */
export async function unlockState(db: DB, userId: string): Promise<UnlockState> {
  const [user] = await db
    .select({
      ageBand: schema.users.ageBand,
      country: schema.users.country,
      status: schema.users.status,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  if (!user || user.status !== "active") {
    return deriveUnlock({ ageBand: null, country: null, linkedAccountCount: 0 });
  }

  const links = await db
    .select({ id: schema.linkedGameAccounts.id })
    .from(schema.linkedGameAccounts)
    .where(and(eq(schema.linkedGameAccounts.userId, userId)));

  return deriveUnlock({
    ageBand: user.ageBand,
    country: user.country,
    linkedAccountCount: links.length,
  });
}

export class NotUnlockedError extends Error {
  readonly missing: OnboardingStep[];
  constructor(missing: OnboardingStep[]) {
    super(
      `Onboarding is not complete. Still needed: ${missing.join(", ")}.`,
    );
    this.name = "NotUnlockedError";
    this.missing = missing;
  }
}

/**
 * The gate. Throws, naming the missing steps.
 *
 * Every path that lets a gamer accrue anything — entering a challenge, holding
 * a trophy, appearing in a standing — goes through here. It throws rather than
 * returning false because a caller that ignores a boolean compiles.
 */
export async function requireUnlocked(db: DB, userId: string): Promise<UnlockState> {
  const state = await unlockState(db, userId);
  if (!state.unlocked) throw new NotUnlockedError(state.missing);
  return state;
}
