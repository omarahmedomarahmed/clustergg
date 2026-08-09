// Two steps, and what happens before you finish them. B83.
//
// B72.4 closed the legal hole plainly: no age band, no earning. This is the
// version that is good — it gives a new gamer a reason to finish, and it does
// it without taking anything from anybody who was already here.
//
// ===== TWO STEPS, NOT FIVE =====
//
//   1. Link a game account.
//   2. Customize your profile — and setting a flag from Discord counts.
//
// Sharing the profile card is NOT a step. It stays a paid quest action; it is
// simply not a lock. A gate that requires broadcasting to your friends before
// you can use the product is a gate that reads as a growth tax.
//
// The whole path works without leaving Discord: press a button, become a user,
// pick an age band on a card, link an account, tap the flag button. Unlocked.
//
// ===== WHY A LOCKED BALANCE AND NOT A REFUSAL =====
//
// A new gamer who earns nothing until they finish learns nothing about what
// earning feels like. A new gamer who watches a number climb and cannot spend
// it has a reason to finish. So CP accrues, up to a cap, and stops there — with
// the actions past the cap still LOGGED, the same pattern the daily ceiling
// uses, so nothing looks like it vanished.
//
// ===== THE GRANDFATHER RULE, WHICH IS NOT NEGOTIABLE =====
//
// **Nothing anybody already earned is ever locked.** Every account that existed
// before this shipped is unlocked by the migration that adds the column —
// `unlocked_at` is backfilled from `created_at`. Taking back access to a balance
// somebody already had would be the worst thing we could do to our earliest
// users, and it is the kind of thing that gets decided by an omission rather
// than a decision. So it is decided here, in writing.

import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * How much a locked gamer may accrue before earning stops.
 *
 * 5,000 CP is half a dollar at the shipped rate — enough to feel like a
 * balance, far too little to be worth farming, and reachable in about ten days
 * of ordinary play. The number matters less than the fact that it is a CAP and
 * not a refusal.
 */
export const LOCKED_CP_CAP = 5000;

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
  /** CP accrued while locked. Zero once unlocked — it stops being separate. */
  lockedCp: number;
  /** At the cap, so nothing more is being credited. */
  capped: boolean;
  /** What they did, for the congratulations card. Empty while locked. */
  achieved: string[];
};

const UNLOCKED: UnlockState = {
  unlocked: true, unlockedAt: null, steps: [], lockedCp: 0, capped: false, achieved: [],
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
      label: "Your age and your country",
      detail: "Two answers. Your age decides whether prize money can be paid to you at all; your country decides how it reaches you. Neither is shown to anybody but the flag beside your name.",
      done: opts.profile,
    },
  ];
}

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
    // The profile step is BOTH answers, not either. A country with no age band
    // cannot be paid and an age band with no country cannot be paid either.
    const profile = /^[A-Za-z]{2}$/.test((u.country ?? "").trim()) && !!u.ageBand;
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
    const lockedCp = Number(cp?.n ?? 0);

    return {
      unlocked: false,
      unlockedAt: null,
      steps: stepsFor({ linked, email, profile }),
      lockedCp,
      capped: lockedCp >= LOCKED_CP_CAP,
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

/**
 * May this gamer be credited right now, and how much?
 *
 * Called from inside the award path, after the age gate. Returns the amount to
 * actually credit — which is the requested amount, or whatever is left under
 * the cap, or nothing.
 *
 * It returns a NUMBER rather than a boolean so a gamer sitting at 4,990 gets
 * their last 10 CP instead of being refused a 25-CP action outright. Refusing
 * the whole action would leave the cap reading 4,990 forever, which looks
 * broken in exactly the way that generates support tickets.
 */
export function creditableWhileLocked(state: UnlockState, want: number): number {
  if (state.unlocked) return want;
  const room = Math.max(0, LOCKED_CP_CAP - state.lockedCp);
  return Math.min(want, room);
}

/** Every gamer who has not finished. Admin only — never a brand-facing count. */
export async function lockedCount(db: DB): Promise<number> {
  try {
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
      .where(and(sql`${schema.users.unlockedAt} is null`, eq(schema.users.status, "active")));
    return Number(r?.n ?? 0);
  } catch { return 0; }
}
