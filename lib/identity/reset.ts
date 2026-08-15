// Password reset, for a gamer and for a brand. I1d.
//
// ===== ONE MECHANISM, TWO SUBJECT KINDS =====
//
// Two implementations of "prove you still hold this address" is two places for
// the token comparison to be wrong, and the one that is wrong is the one
// nobody looked at. So there is one table, one issue function, one redeem
// function, and a `subjectKind` word.
//
// I1d also says what a reset is *not* available for: **an unverified email
// cannot do this.** That is the whole reason the email door verifies at signup
// (I7a) — a reset sent to an address nobody proved is a reset sent to whoever
// typo'd their way into the field.

import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { hashPassword, checkPasswordStrength, normaliseEmail } from "./credentials.ts";

export type SubjectKind = "gamer" | "brand";

/** An hour. Long enough to find the email, short enough that a stale one dies. */
export const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * SHA-256, not scrypt — the same reasoning as a portal key.
 *
 * A reset token is 32 random bytes with no dictionary to run against it, so a
 * work factor buys nothing. What matters is that we never store the token
 * itself: a leaked table would otherwise be a working reset link for every
 * account in it.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokensMatch(storedHash: string, given: string): boolean {
  const a = Buffer.from(storedHash);
  const b = Buffer.from(hashToken(given));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Start a reset. Returns the token **once**, or null if there is nobody to
 * reset.
 *
 * ===== THE CALLER MUST SAY THE SAME THING EITHER WAY =====
 *
 * Null here does not mean "tell them we could not find it". Every reset form
 * on this platform answers *"if that address has an account, a link is on its
 * way"*, because the alternative is a form that confirms which of our users
 * exist to anybody who asks.
 */
export async function beginReset(
  db: DB,
  input: { kind: SubjectKind; email: string },
  now = new Date(),
): Promise<string | null> {
  const email = normaliseEmail(input.email);

  let subjectId: string | null = null;
  if (input.kind === "gamer") {
    const [user] = await db
      .select({ id: schema.users.id, verifiedAt: schema.users.emailVerifiedAt })
      .from(schema.users)
      .where(and(eq(schema.users.email, email), eq(schema.users.status, "active")));
    // I1d — an unverified address cannot reset. A Discord gamer who has never
    // redeemed has no email at all and reaches this the same way.
    subjectId = user?.verifiedAt ? user.id : null;
  } else {
    const [row] = await db
      .select({ id: schema.brandUsers.id, redeemedAt: schema.brandUsers.inviteRedeemedAt })
      .from(schema.brandUsers)
      .where(eq(schema.brandUsers.email, email));
    // A brand who never redeemed their invite has no password to reset. They
    // need the invite resent, which is a different conversation.
    subjectId = row?.redeemedAt ? row.id : null;
  }

  if (!subjectId) return null;

  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.passwordResets).values({
    id: uid(),
    subjectKind: input.kind,
    subjectId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + RESET_TTL_MS),
  });
  return token;
}

export type ResetResult = { ok: true } | { ok: false; reason: string };

/**
 * Finish a reset.
 *
 * Single-use and time-bounded, and **every failure reads identically** for the
 * same reason the brand invite's does.
 */
export async function completeReset(
  db: DB,
  input: { kind: SubjectKind; token: string; password: string },
  now = new Date(),
): Promise<ResetResult> {
  const refusal =
    "That reset link has expired or has already been used. Ask for a new one — " +
    "a link works once, and only for an hour.";

  checkPasswordStrength(input.password);

  const candidates = await db
    .select()
    .from(schema.passwordResets)
    .where(
      and(
        eq(schema.passwordResets.subjectKind, input.kind),
        isNull(schema.passwordResets.usedAt),
      ),
    );

  // Compared in constant time against each live token rather than looked up by
  // hash. A lookup would be faster and would also mean the database index
  // decides the comparison, which is not a comparison we control.
  const row = candidates.find((c) => tokensMatch(c.tokenHash, input.token));
  if (!row) return { ok: false, reason: refusal };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: refusal };

  const passwordHash = await hashPassword(input.password);
  if (input.kind === "gamer") {
    await db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, row.subjectId));
  } else {
    await db
      .update(schema.brandUsers)
      .set({ passwordHash })
      .where(eq(schema.brandUsers.id, row.subjectId));
  }

  // Marked used *after* the password is set, not before. The other order loses
  // somebody their reset if the update throws.
  await db
    .update(schema.passwordResets)
    .set({ usedAt: now })
    .where(eq(schema.passwordResets.id, row.id));

  return { ok: true };
}
