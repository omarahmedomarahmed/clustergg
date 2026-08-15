// The brand's login: a one-time invite, then email and password forever.
//
// ===== THE KEY IS AN INVITE, NOT A CREDENTIAL =====
//
// B1. What arrives in the signup email is redeemable **once**. Redeeming it
// creates a `brand_users` row with an email and a password, and from then on
// the key is dead — not "deprecated", not "still works for convenience". Dead.
//
// The check is `inviteRedeemedAt`, a timestamp, rather than deleting the hash.
// A deleted hash makes "this key was already used" and "this key never
// existed" indistinguishable, and those are two very different support
// conversations.
//
// B2/I4 — a brand user is never a gamer. There is no column on this row that
// could make it one, which is a stronger statement than a flag: the separation
// is in the schema, not in a check somebody can forget.

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { newPortalKey, hashPortalKey, keyMatches } from "../core/keys.ts";
import {
  hashPassword,
  passwordMatches,
  checkPasswordStrength,
  normaliseEmail,
  CredentialRefused,
} from "../identity/credentials.ts";

export { CredentialRefused };

/**
 * Issue the invite. Returned once, hashed at rest.
 *
 * The row exists before the brand does anything with it, so admin can see a
 * brand who was invited and never arrived — which is a sales signal, not a
 * dead record.
 */
export async function issueBrandInvite(
  db: DB,
  input: { brandId: string; email: string },
): Promise<{ brandUserId: string; key: string }> {
  const key = newPortalKey();
  const brandUserId = uid();
  await db.insert(schema.brandUsers).values({
    id: brandUserId,
    brandId: input.brandId,
    email: normaliseEmail(input.email),
    inviteKeyHash: hashPortalKey(key),
  });
  return { brandUserId, key };
}

export type InviteResult =
  | { ok: true; brandUserId: string; brandId: string }
  | { ok: false; reason: string };

/**
 * Redeem the invite, once, and set the password that replaces it.
 *
 * ===== EVERY FAILURE READS THE SAME =====
 *
 * A wrong key, an unknown email and an already-redeemed invite all answer with
 * one sentence. Distinguishing them turns this form into a directory of who we
 * have invited — and "that invite was already used" tells an attacker they
 * have the right email and merely arrived late.
 */
export async function redeemBrandInvite(
  db: DB,
  input: { email: string; key: string; password: string },
  now = new Date(),
): Promise<InviteResult> {
  const refusal =
    "That invite does not open a portal. It may have been used already — an " +
    "invite works exactly once. Ask us and we will send a new one.";

  checkPasswordStrength(input.password);

  const [row] = await db
    .select()
    .from(schema.brandUsers)
    .where(eq(schema.brandUsers.email, normaliseEmail(input.email)));

  if (!row) return { ok: false, reason: refusal };
  // B1. The single most important line in this file.
  if (row.inviteRedeemedAt) return { ok: false, reason: refusal };
  if (!keyMatches(row.inviteKeyHash, input.key)) return { ok: false, reason: refusal };

  await db
    .update(schema.brandUsers)
    .set({
      passwordHash: await hashPassword(input.password),
      inviteRedeemedAt: now,
      // The hash stays. It is no longer a way in — `inviteRedeemedAt` is
      // checked first — and keeping it lets support answer "yes, that was the
      // key we sent you, and it was redeemed on the 14th".
    })
    .where(eq(schema.brandUsers.id, row.id));

  return { ok: true, brandUserId: row.id, brandId: row.brandId };
}

export type SignInResult =
  | { ok: true; brandUserId: string; brandId: string }
  | { ok: false; reason: string };

export async function brandSignIn(
  db: DB,
  input: { email: string; password: string; ip?: string | null },
  now = new Date(),
): Promise<SignInResult> {
  const refusal = "That email and password do not match an account.";

  const [row] = await db
    .select()
    .from(schema.brandUsers)
    .where(eq(schema.brandUsers.email, normaliseEmail(input.email)));

  // An unredeemed invite has no password, and `passwordMatches(null, …)` is
  // false — so an invited-but-not-arrived brand cannot be signed into, and the
  // message is the same one a wrong password gets.
  if (!row || !(await passwordMatches(row.passwordHash, input.password))) {
    return { ok: false, reason: refusal };
  }

  // B3 — shared credentials are accepted, so the last login is recorded. When
  // two people share a password, "who did this" is answered by the log or not
  // at all.
  await db
    .update(schema.brandUsers)
    .set({ lastLoginAt: now, lastLoginIp: input.ip ?? null })
    .where(eq(schema.brandUsers.id, row.id));

  return { ok: true, brandUserId: row.id, brandId: row.brandId };
}

export async function brandUserById(db: DB, brandUserId: string) {
  const [row] = await db
    .select()
    .from(schema.brandUsers)
    .where(eq(schema.brandUsers.id, brandUserId));
  return row ?? null;
}

/** Every brand user for a brand — the admin view, and the invite-state check. */
export async function brandUsersFor(db: DB, brandId: string) {
  return db
    .select()
    .from(schema.brandUsers)
    .where(eq(schema.brandUsers.brandId, brandId));
}

/**
 * Whether a brand has actually arrived, as opposed to merely being invited.
 *
 * Read off `inviteRedeemedAt` — the same timestamp B1 keys on, so "arrived"
 * and "the invite is dead" can never disagree.
 */
export async function brandHasArrived(db: DB, brandId: string): Promise<boolean> {
  return (await brandUsersFor(db, brandId)).some((u) => u.inviteRedeemedAt !== null);
}
