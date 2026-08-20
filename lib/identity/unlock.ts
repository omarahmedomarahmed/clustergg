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
// challenge.** Stage 4's entry chain calls `unlockState` and does not
// re-derive the answer, because a second implementation is a second answer.

import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";

/**
 * The two paths, and the order each asks in.
 *
 * ===== I7: THE AGE QUESTION COMES BEFORE ANY OTHER DATA IS STORED =====
 *
 * `ageBand` is first in both lists and that ordering is the rule, not a
 * preference. *"We do not hold data on a child we never asked about."* The
 * fork itself asks nothing, so it can precede the age question; everything
 * after it cannot.
 *
 * 12 §2 — the **server-owner path substitutes the `guilds` scope for the
 * linked game account** (G1). An owner who plays none of our games can still
 * be paid, and a gamer who manages nothing is never asked about servers.
 */
export const ONBOARDING_PATHS = ["gamer", "owner"] as const;
export type OnboardingPath = (typeof ONBOARDING_PATHS)[number];

export const GAMER_STEPS = ["ageBand", "country", "link"] as const;
export const OWNER_STEPS = ["ageBand", "country", "guilds"] as const;

/** Every step either path can ask for. */
export const ONBOARDING_STEPS = ["ageBand", "country", "link", "guilds"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function stepsFor(path: OnboardingPath): readonly OnboardingStep[] {
  return path === "owner" ? OWNER_STEPS : GAMER_STEPS;
}

export type UnlockState = {
  /** Which fork they took. `gamer` unless they said otherwise. */
  path: OnboardingPath;
  /** True only when every step *this path asks for* is done. */
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
  /**
   * Which path they took. Defaults to `gamer`, which is the stricter of the
   * two: it requires a linked game account, and defaulting to the looser one
   * would let an unfinished account through by omission.
   */
  path?: OnboardingPath;
  /** Whether they granted the `guilds` scope. The owner path's fourth step. */
  guildsGranted?: boolean;
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
  const path: OnboardingPath = facts.path ?? "gamer";
  const done: Record<OnboardingStep, boolean> = {
    link: facts.linkedAccountCount > 0,
    guilds: facts.guildsGranted === true,
    ageBand: facts.ageBand === "teen" || facts.ageBand === "adult",
    country: typeof facts.country === "string" && facts.country.length > 0,
  };
  // Only the steps THIS path asks for. A gamer is never blocked on `guilds`
  // and an owner is never blocked on a linked game account — 12 §2's capability
  // gates, not role gates: "an owner who plays none of our games can still be
  // paid; a gamer who manages nothing is never asked about servers."
  const steps = stepsFor(path);
  const missing = steps.filter((s) => !done[s]);
  return {
    path,
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

// ===== `requireUnlocked` AND `NotUnlockedError` WERE DELETED HERE =====
//
// A second implementation of a gate the entry chain already applies. K12's
// shape: `lib/challenges/entry.ts:108` calls `unlockState` directly and returns
// a refusal carrying the missing steps by name, which is the better answer —
// an exception cannot tell somebody *"still needed: age band, country"*.
//
// This file's own header said *"Stage 4's entry chain calls `requireUnlocked`
// and does not…"*. It did not, and had never. A comment describing a call that
// does not happen is worse than no comment: the next person reads it as the
// enforcement point and adds their door beside it.

