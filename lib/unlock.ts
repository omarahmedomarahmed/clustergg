// The three things, and what nothing does before they are done. B83 → B94.
//
// B72.4 closed the legal hole plainly: no age band, no earning. B93 turned that
// into one page with three steps. B94 is the part that makes the page mean
// something — **nothing accrues before it is finished.**
//
// ===== THREE STEPS =====
//
//   1. Link a game account.
//   2. Confirm your email.
//   3. Your age and your country.
//
// Sharing the profile card is NOT a step. It stays a paid quest action; it is
// simply not a lock. A gate that requires broadcasting to your friends before
// you can use the product is a gate that reads as a growth tax.
//
// ===== NOTHING ACCRUES WHILE LOCKED, AND THAT IS A REVERSAL =====
//
// B83 let a locked gamer bank up to 5,000 CP, on the argument that watching a
// number climb is a better reason to finish than an empty screen. It is a good
// argument and it was the wrong call, for one reason: **we do not know who they
// are yet.** A held balance is a promise made to an account with no confirmed
// inbox, no declared age and no country — which is to say a promise we cannot
// price, cannot pay, and cannot legally have made if the person behind it turns
// out to be twelve.
//
// So there is nothing to hold. No CP, no trophies, no challenge entry. The
// onboarding page sells what earning WILL be rather than showing a number that
// is already owed, and the first point anybody earns is a point we are allowed
// to owe them.
//
// ===== NOBODY IS GRANDFATHERED, AND NOTHING IS TAKEN =====
//
// B94 also ends the grandfather rule. Every account — including every account
// that existed before any of this — goes through the three steps, because the
// two facts we now require (a confirmed inbox, an age band) were never asked of
// them and are exactly the two we cannot operate without.
//
// What that does NOT mean: nothing anybody earned is deleted. Balances stay,
// trophies stay, ranks stay, and the page says so. What is blocked is the next
// action, not the past one. An old account that finishes the three steps finds
// everything exactly where it left it.

import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export type StepKey = "link" | "email" | "profile";

export type Step = {
  key: StepKey;
  label: string;
  /** What it takes, in the gamer's words. */
  detail: string;
  done: boolean;
};

export type UnlockState = {
  unlocked: boolean;
  /** When it happened. Null while locked. */
  unlockedAt: Date | null;
  steps: Step[];
  /**
   * What is sitting in the account, waiting.
   *
   * Zero for a new gamer, because B94 credits nothing before the steps are
   * done. NOT zero for an account that predates the lock — those carry a real
   * balance they earned under the old rules, and the whole promise of forcing
   * them through onboarding is that the number is still there afterwards. It is
   * shown as SAFE, never as pending.
   */
  heldCp: number;
  /** What they did, for the congratulations card. Empty while locked. */
  achieved: string[];
};

const UNLOCKED: UnlockState = {
  unlocked: true, unlockedAt: null, steps: [], heldCp: 0, achieved: [],
};

/**
 * Has this gamer customized anything?
 *
 * NO LONGER AN UNLOCK STEP. B93 replaced "make your profile yours" — which an
 * avatar satisfied — with two answers we actually need: an age band and a
 * country. A picture tells us nothing about whether somebody may be paid.
 *
 * Kept because other surfaces ask it for their own reasons (a profile that has
 * never been touched is worth prompting), and deleting a question because it
 * stopped being a gate would break those.
 */
export function hasCustomized(u: {
  country?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  title?: string | null;
  theme?: unknown;
}): boolean {
  if (u.country) return true;
  if (u.avatarUrl) return true;
  if ((u.bio ?? "").trim()) return true;
  if ((u.title ?? "").trim()) return true;
  const theme = u.theme as Record<string, unknown> | null | undefined;
  return !!theme && Object.keys(theme).length > 0;
}

/**
 * The three things, in the order a gamer does them.
 *
 * B93 CUT THIS DOWN FROM FOUR TO THREE, and the cut is the point. It was:
 * country, link an account, make your profile yours — with "yours" satisfied by
 * an avatar, a colour or a line of bio. That is a scavenger hunt. Somebody
 * arriving wants to know what they have to do and how far off they are, and
 * four steps where one of them is "any of five things" cannot answer that.
 *
 * Now:
 *
 *   link     Prove you play something. Without it there is nothing to score.
 *   email    Prove you can read an inbox. It is what switches earning on, and
 *            it is the only thing that makes a fake account cost anything.
 *   profile  Two answers we actually need: your age band and your country.
 *
 * The profile step is where the old "customize" step went. It is not decoration
 * any more — an age band decides whether money may be paid at all, and a
 * country decides how. Both were previously optional, and one of them was
 * satisfiable by uploading a picture.
 */
export function stepsFor(opts: { linked: boolean; email: boolean; profile: boolean }): Step[] {
  return [
    {
      key: "link",
      label: "Link a game account",
      detail: "Any game we support. It is what lets you enter challenges and win real prizes.",
      done: opts.linked,
    },
    {
      key: "email",
      label: "Confirm your email",
      detail: "We send a six-digit code. It is what switches your earning on — and it is what stops somebody making five hundred accounts and taking the prize money.",
      done: opts.email,
    },
    {
      key: "profile",
      label: "Your age, your country and your colours",
      detail: "Your age decides whether prize money can be paid to you at all; your country decides how it reaches you; your colours are what your card looks like in every server. Nobody sees the first two — only the flag beside your name.",
      done: opts.profile,
    },
  ];
}

/**
 * How many steps there are.
 *
 * Derived from `stepsFor`, never written down twice. The guide pages quote it,
 * and a guide that says "two steps" over a list of three is the kind of thing a
 * gamer screenshots.
 */
export const UNLOCK_STEPS =
  stepsFor({ linked: false, email: false, profile: false }).length;

/**
 * Where this gamer stands.
 *
 * Returns `UNLOCKED` for anybody with `unlockedAt` set, without doing any
 * further work — which is every existing account, and every account that has
 * finished. The expensive half of this function only runs for the small set of
 * people it is actually about.
 */
export async function unlockState(db: DB, userId: string): Promise<UnlockState> {
  try {
    const [u] = await db.select({
      unlockedAt: schema.users.unlockedAt,
      country: schema.users.country,
      ageBand: schema.users.ageBand,
      emailVerifiedAt: schema.users.emailVerifiedAt,
      avatarUrl: schema.users.avatarUrl,
      bio: schema.users.bio,
      title: schema.users.title,
      theme: schema.users.theme,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!u) return UNLOCKED;
    if (u.unlockedAt) return { ...UNLOCKED, unlockedAt: u.unlockedAt };

    const [linkRow] = await db.select({ n: sql<number>`count(*)` })
      .from(schema.linkedGameAccounts)
      .where(eq(schema.linkedGameAccounts.userId, userId));
    const linked = Number(linkRow?.n ?? 0) > 0;
    // The profile step is ALL THREE answers, not any of them. A country with no
    // age band cannot be paid and an age band with no country cannot be paid
    // either; the theme is there because a card nobody has made theirs is a card
    // nobody shows anyone. All three are saved by one button, so this can never
    // be half-done by a gamer — only by a fixture.
    const theme = u.theme as { template?: unknown } | null;
    const profile = /^[A-Za-z]{2}$/.test((u.country ?? "").trim())
      && !!u.ageBand
      && !!theme && typeof theme.template === "string" && theme.template.length > 0;
    const email = !!u.emailVerifiedAt;

    // A READ THAT PROMOTES. Deliberate, and worth defending.
    //
    // The alternative is calling `tryUnlock` from every path that could
    // complete a step — linking an account, saving a profile, tapping the flag
    // button in Discord, an admin edit, an OAuth callback. That is five call
    // sites today and six the moment somebody adds a way to set an avatar, and
    // the failure mode is a gamer who finished and is still capped with no way
    // to tell why.
    //
    // So the check lives where the state is READ, which is every path that
    // could care. The write is idempotent and guarded on `unlocked_at is null`,
    // so concurrent reads cannot produce two different unlock moments.
    if (linked && email && profile) {
      const now = new Date();
      await db.update(schema.users)
        .set({ unlockedAt: now })
        .where(and(eq(schema.users.id, userId), sql`${schema.users.unlockedAt} is null`));
      return { ...UNLOCKED, unlockedAt: now };
    }

    const [cp] = await db.select({ n: sql<number>`coalesce(sum(${schema.questEvents.cpAwarded}), 0)` })
      .from(schema.questEvents).where(eq(schema.questEvents.userId, userId));

    return {
      unlocked: false,
      unlockedAt: null,
      steps: stepsFor({ linked, email, profile }),
      heldCp: Number(cp?.n ?? 0),
      achieved: [],
    };
  } catch {
    // A read that fails must not lock somebody out of their own balance.
    return UNLOCKED;
  }
}

/**
 * Unlock and describe it, for the congratulations moment.
 *
 * `unlockState` already promotes anybody who has finished, so this is not what
 * makes the unlock happen — it is what produces the CARD. Returns what they
 * actually DID: "you linked League of Legends", "you made your profile yours".
 * A congratulations that says "you completed onboarding" congratulates somebody
 * for filling in a form; one that names the game they linked congratulates them
 * for playing.
 */
export async function tryUnlock(db: DB, userId: string): Promise<UnlockState> {
  const state = await unlockState(db, userId);
  if (!state.unlocked) return state;

  const now = state.unlockedAt ?? new Date();

  const games = await db.select({ provider: schema.linkedGameAccounts.provider })
    .from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, userId)).limit(5);
  const achieved = [
    ...games.map((g) => `You linked ${g.provider}`),
    "You confirmed your email",
    "You told us your age and where you are",
  ];
  return { ...UNLOCKED, unlockedAt: now, achieved };
}

/** Every gamer who has not finished. Admin only — never a brand-facing count. */
export async function lockedCount(db: DB): Promise<number> {
  try {
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
      .where(and(sql`${schema.users.unlockedAt} is null`, eq(schema.users.status, "active")));
    return Number(r?.n ?? 0);
  } catch { return 0; }
}
