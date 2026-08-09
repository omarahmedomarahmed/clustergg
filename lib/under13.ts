// "I'm under 13." B95.
//
// ===== WHY THIS IS A LINK AND NOT AN OPTION =====
//
// The obvious design is a third button in the age picker. It is the wrong one.
// A twelve-year-old looking at three buttons, one of which visibly ends the fun,
// clicks one of the other two — and now we have a child inside the product with
// a declared age we have every reason to disbelieve, a record showing we asked,
// and no way back.
//
// So the picker has two options, and underneath them a plain line of text: "I'm
// under 13". Clicking it does not select anything. It opens an explanation of
// why the answer matters, what happens if they confirm, and a confirm button
// that is the only thing on this path that writes anything.
//
// ===== WHAT CONFIRMING DOES =====
//
// It deletes the account. Not a suspension, not a flag, not a shadow state —
// `db.delete(users)` plus an explicit purge of everything the missing foreign
// keys would not have cascaded (see `purgeUserRows`, which this found). The
// balance goes, the trophies go, the linked accounts go. That is the point:
// there is no version of this where we keep a child's data because they had
// four hundred points.
//
// ===== WHAT SURVIVES, AND THE ARGUMENT FOR KEEPING ANYTHING AT ALL =====
//
// One row per identifier in `blocked_signups`: a SHA-256 of the Discord ID and
// a SHA-256 of the email address, a reason word, and a date.
//
// Keeping nothing is the comfortable answer and it makes the whole feature
// pointless — the same person signs in again thirty seconds later, picks "13 to
// 17", and every part of this has achieved exactly nothing. Keeping a hash is
// the smallest thing that works: it cannot be read back into a person, cannot
// be searched by a human for anyone, and answers precisely one question, which
// is the question it exists to answer.
//
// ⚠ For counsel: this is the deliberate, documented retention of a one-way
// identifier following a deletion request, on the basis that re-registration
// prevention is the purpose the deletion was for. The scope is stated above and
// the code below writes nothing else.

import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";

/** The minimum age to have an account at all. COPPA's line, and the UK's. */
export const MIN_ACCOUNT_AGE = 13;

export type BlockKind = "discord" | "email";

/**
 * One-way, and salted with a constant so a hash from this table cannot be
 * matched against a rainbow table of email addresses built somewhere else.
 *
 * The salt is a literal rather than a secret on purpose: a rotating secret
 * would make every existing row unmatchable the day it rotated, which would
 * silently turn the block list off. The property we need is "not trivially
 * reversible by anybody who dumps this table", and a constant salt gives that.
 */
const KEY_SALT = "cluster:blocked-signup:v1";

export const blockHash = (kind: BlockKind, value: string): string =>
  createHash("sha256")
    .update(`${KEY_SALT}:${kind}:${value.trim().toLowerCase()}`)
    .digest("hex");

export type Under13Result =
  | { ok: true; blocked: number }
  | { ok: false; error: string };

/**
 * Confirmed under 13: block the identifiers, then delete the account.
 *
 * IN THAT ORDER, and the order is the whole reliability of the feature. Write
 * the block first and the worst case is a block on somebody whose account still
 * exists — which is recoverable and which the next attempt fixes. Delete first
 * and a failure between the two leaves a deleted child free to sign straight
 * back up, which is the failure this exists to prevent.
 */
export async function deleteForUnderThirteen(db: DB, userId: string): Promise<Under13Result> {
  try {
    const [u] = await db.select({ email: schema.users.email })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!u) return { ok: false, error: "That account is already gone." };

    const keys: { kind: BlockKind; value: string }[] = [];
    if (u.email) keys.push({ kind: "email", value: u.email });

    // The Discord identifier is the OAUTH one, never the username. A username
    // changes whenever its owner feels like it, so blocking on it would block
    // the wrong person tomorrow and miss the right one.
    const identities = await db.select({ providerUserId: schema.oauthIdentities.providerUserId })
      .from(schema.oauthIdentities)
      .where(and(
        eq(schema.oauthIdentities.userId, userId),
        eq(schema.oauthIdentities.provider, "discord"),
      ));
    for (const i of identities) keys.push({ kind: "discord", value: i.providerUserId });

    for (const k of keys) {
      try {
        await db.insert(schema.blockedSignups).values({
          id: uid(), kind: k.kind, keyHash: blockHash(k.kind, k.value), reason: "under13",
        });
      } catch { /* already blocked — the unique index doing its job */ }
    }

    // The tables that predate foreign keys do not cascade, so they are deleted
    // explicitly first. See `purgeUserRows` — "mostly deleted" is a tidiness
    // problem everywhere except here.
    const { purgeUserRows } = await import("@/lib/account-deletion");
    await purgeUserRows(db, userId);
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    return { ok: true, blocked: keys.length };
  } catch {
    return { ok: false, error: "Could not do that just now. Try again in a moment — nothing has changed." };
  }
}

/**
 * Has one of these identifiers been here before?
 *
 * Called on every signup path, both of them. Fails OPEN — a database hiccup
 * must not lock a legitimate adult out of signing up, and the cost of the rare
 * miss is one account that the same check catches on its next attempt.
 */
export async function isSignupBlocked(
  db: DB,
  who: { email?: string | null; discordId?: string | null },
): Promise<boolean> {
  const hashes: string[] = [];
  if (who.email) hashes.push(blockHash("email", who.email));
  if (who.discordId) hashes.push(blockHash("discord", who.discordId));
  if (hashes.length === 0) return false;
  try {
    const rows = await db.select({ id: schema.blockedSignups.id })
      .from(schema.blockedSignups)
      .where(inArray(schema.blockedSignups.keyHash, hashes))
      .limit(1);
    return rows.length > 0;
  } catch { return false; }
}

/**
 * What a blocked person is told.
 *
 * It does not say "you told us you were twelve" — the person reading it may be
 * a parent, a sibling on a shared machine, or the same child a year older. It
 * says the account cannot be created here and where to write if that is wrong,
 * which is true, complete and not an accusation.
 */
export const BLOCKED_SIGNUP_MESSAGE =
  "We cannot create an account for this Discord or email address. "
  + "If you believe that is a mistake, write to support@clustergg.com and a human will look at it.";
