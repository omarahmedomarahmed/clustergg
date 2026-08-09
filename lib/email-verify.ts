// Proving somebody can read the inbox they gave us. B93.
//
// ===== WHY THIS EXISTS =====
//
// Creating an account costs nothing: no email check, no captcha, no device
// check. That was tolerable while nothing paid for growth. The weekly server
// pool now pays real cash for linked members, which means a person who can make
// five hundred accounts in an afternoon can take money from real server owners.
//
// A code in an inbox is the cheapest thing that makes an account cost
// something. It is not identity and it does not pretend to be — it is a small
// tax on volume, and volume is the whole attack.
//
// ===== WHAT IT GATES, AND WHAT IT DOES NOT =====
//
// It gates EARNING. It does not gate signing up, looking around, linking an
// account or entering a challenge. Somebody who has not verified can use the
// product and see exactly what they are missing; nothing is taken and nothing
// expires. That is the same shape as every other unlock step.
//
// ===== THE CODE IS STORED HASHED =====
//
// Six digits, short-lived, typed off a phone. Low entropy on purpose, which is
// exactly why the database must not hold it in clear: a leaked table of live
// codes is the easiest account takeover this product could have.

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { createHash, randomInt } from "node:crypto";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";

/** How long a code lives. Long enough to switch apps, short enough to be useless later. */
export const CODE_TTL_MIN = 20;

/** Wrong guesses before the code dies. Six digits is a million; five tries is not a search. */
export const MAX_ATTEMPTS = 5;

/** How many codes one account may ask for in an hour. */
export const MAX_SENDS_PER_HOUR = 5;

const hash = (code: string) => createHash("sha256").update(`cluster:${code}`).digest("hex");

/** Six digits, uniformly random. `randomInt` rather than `Math.random`. */
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type SendResult =
  | { ok: true; email: string; alreadyVerified?: boolean }
  | { ok: false; error: string };

/**
 * Send a code, or say why not.
 *
 * The code is RETURNED to the caller in demo mode only — see the note where it
 * is used. In production it exists in the email and in a hash, nowhere else.
 */
export async function sendVerificationCode(
  db: DB,
  userId: string,
  emailInput?: string | null,
): Promise<SendResult & { code?: string }> {
  try {
    const [user] = await db.select({
      email: schema.users.email,
      verifiedAt: schema.users.emailVerifiedAt,
      name: schema.users.displayName,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user) return { ok: false, error: "No such account." };

    const email = (emailInput ?? user.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return { ok: false, error: "That email doesn't look right — check it and try again." };
    }
    if (user.verifiedAt && email === (user.email ?? "").toLowerCase()) {
      return { ok: true, email, alreadyVerified: true };
    }

    // Rate limit per account. Somebody hammering resend is either stuck or
    // using us to send mail at a stranger.
    const [recent] = await db.select({ n: sql<number>`count(*)` })
      .from(schema.emailCodes)
      .where(and(
        eq(schema.emailCodes.userId, userId),
        gte(schema.emailCodes.createdAt, new Date(Date.now() - 3600_000)),
      ));
    if (Number(recent?.n ?? 0) >= MAX_SENDS_PER_HOUR) {
      return { ok: false, error: "That's a lot of codes. Wait an hour, or write to us and we'll sort it by hand." };
    }

    // A NEW ADDRESS REPLACES THE OLD ONE ON THE ACCOUNT, and un-verifies it.
    // Otherwise somebody verifies address A, switches to address B, and keeps
    // the verified flag they earned on an inbox they no longer control.
    if (email !== (user.email ?? "").toLowerCase()) {
      const [taken] = await db.select({ id: schema.users.id }).from(schema.users)
        .where(eq(schema.users.email, email)).limit(1);
      if (taken && taken.id !== userId) {
        return { ok: false, error: "There's already an account on that email." };
      }
      await db.update(schema.users)
        .set({ email, emailVerifiedAt: null })
        .where(eq(schema.users.id, userId));
    }

    const code = newCode();
    await db.insert(schema.emailCodes).values({
      id: uid(), userId, email,
      codeHash: hash(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
    });

    return { ok: true, email, code };
  } catch {
    return { ok: false, error: "Could not send that just now. Try again in a moment." };
  }
}

export type CheckResult = { ok: true } | { ok: false; error: string; attemptsLeft?: number };

/**
 * Check a code.
 *
 * Only the NEWEST unused code counts. Accepting any live code would mean a
 * resend does not invalidate the previous one, so five codes in an inbox are
 * five valid keys — and the one somebody screenshotted an hour ago still works.
 */
export async function checkVerificationCode(
  db: DB, userId: string, given: string,
): Promise<CheckResult> {
  const code = String(given ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "A code is six digits." };

  try {
    const [row] = await db.select().from(schema.emailCodes)
      .where(and(eq(schema.emailCodes.userId, userId), isNull(schema.emailCodes.usedAt)))
      .orderBy(desc(schema.emailCodes.createdAt))
      .limit(1);
    if (!row) return { ok: false, error: "Ask for a code first." };

    if (row.expiresAt < new Date()) {
      return { ok: false, error: "That code has expired. Ask for a new one — it takes a second." };
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      return { ok: false, error: "Too many wrong tries on that code. Ask for a new one." };
    }

    if (row.codeHash !== hash(code)) {
      await db.update(schema.emailCodes)
        .set({ attempts: row.attempts + 1 })
        .where(eq(schema.emailCodes.id, row.id));
      const left = MAX_ATTEMPTS - (row.attempts + 1);
      return {
        ok: false,
        attemptsLeft: Math.max(0, left),
        error: left > 0
          ? `That's not it — ${left} ${left === 1 ? "try" : "tries"} left on this code.`
          : "That code is used up. Ask for a new one.",
      };
    }

    // Burn the code first, then mark the account. If the second write fails the
    // worst case is somebody asking for another code — the other order would
    // leave a live code behind on a verified account.
    await db.update(schema.emailCodes)
      .set({ usedAt: new Date() })
      .where(eq(schema.emailCodes.id, row.id));
    await db.update(schema.users)
      .set({ email: row.email, emailVerifiedAt: new Date() })
      .where(eq(schema.users.id, userId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not check that just now. Try again in a moment." };
  }
}

/** Has this account proved its inbox? */
export async function isEmailVerified(db: DB, userId: string): Promise<boolean> {
  try {
    const [u] = await db.select({ at: schema.users.emailVerifiedAt })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    return !!u?.at;
  } catch {
    // A read that fails must not lock somebody out of their own earning.
    return true;
  }
}

/** Where a code was last sent, for "check your inbox" to be able to say where. */
export async function pendingCodeEmail(db: DB, userId: string): Promise<string | null> {
  try {
    const [row] = await db.select({ email: schema.emailCodes.email })
      .from(schema.emailCodes)
      .where(and(eq(schema.emailCodes.userId, userId), isNull(schema.emailCodes.usedAt)))
      .orderBy(desc(schema.emailCodes.createdAt)).limit(1);
    return row?.email ?? null;
  } catch { return null; }
}
