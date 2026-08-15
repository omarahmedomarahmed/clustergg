// Proving somebody holds an email address.
//
// ===== ONE IMPLEMENTATION, TWO CALLERS, AND THE SAME VERIFICATION =====
//
// This used to live inside `lib/trophies/redemption.ts`, because redemption
// was the only place an email was ever asked for. It is not any more: the
// **email signup door verifies at signup** (I7a), because the address is the
// credential and a password reset is impossible without it.
//
// And crucially — I7a again — **that is the same verification.** It is never
// asked twice. A gamer who signed up by email is already verified when they
// reach `/redeem`, and a gamer who came through Discord verifies there for the
// first time. Two implementations would eventually disagree about which of
// those had happened, so there is one, here, and redemption imports it.

import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { authSecret } from "../core/secret.ts";

const VERIFICATION_TTL_MS = 30 * 60_000;

function hashCode(code: string): string {
  return createHash("sha256").update(`${authSecret()} ${code}`).digest("hex");
}

export function looksLikeEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim().toLowerCase());
}

/**
 * Mint a code for an address.
 *
 * Returns it rather than sending it, so the caller decides the channel — an
 * email in production, the URL in the demo so the screenshot record can walk
 * the flow without an inbox.
 */
export async function beginEmailVerification(
  db: DB,
  userId: string,
  email: string,
): Promise<string> {
  const normalised = email.trim().toLowerCase();
  if (!looksLikeEmail(normalised)) {
    throw new Error("That does not look like an email address.");
  }
  // Six digits from a cryptographic source. `Math.random` is predictable
  // enough that a code minted at a known second can be guessed.
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(schema.emailVerifications).values({
    id: uid(),
    userId,
    email: normalised,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });
  return code;
}

export type VerifyResult = { ok: true; email: string } | { ok: false; reason: string };

/**
 * Check a code and, if it matches, record the address as verified.
 *
 * Every failure reads the same. "Expired" and "wrong" are different facts and
 * telling them apart lets somebody probe which codes were ever real.
 */
export async function confirmEmailVerification(
  db: DB,
  userId: string,
  code: string,
  now = new Date(),
): Promise<VerifyResult> {
  const refusal = "That code is wrong or has expired. Ask for a new one.";

  const rows = await db
    .select()
    .from(schema.emailVerifications)
    .where(
      and(
        eq(schema.emailVerifications.userId, userId),
        isNull(schema.emailVerifications.consumedAt),
      ),
    );

  const want = Buffer.from(hashCode(code));
  for (const row of rows) {
    if (row.expiresAt.getTime() <= now.getTime()) continue;
    const have = Buffer.from(row.codeHash);
    if (have.length !== want.length || !timingSafeEqual(have, want)) continue;

    await db
      .update(schema.emailVerifications)
      .set({ consumedAt: now })
      .where(eq(schema.emailVerifications.id, row.id));
    await db
      .update(schema.users)
      .set({ email: row.email, emailVerifiedAt: now })
      .where(eq(schema.users.id, userId));
    return { ok: true, email: row.email };
  }
  return { ok: false, reason: refusal };
}

/**
 * Is this gamer's address already proven?
 *
 * The question `/redeem` asks, and the reason it may never ask for an address
 * at all: an email gamer proved theirs at signup.
 */
export async function emailIsVerified(db: DB, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ verifiedAt: schema.users.emailVerifiedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return Boolean(row?.verifiedAt);
}
