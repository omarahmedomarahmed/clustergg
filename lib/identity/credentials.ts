// Two doors into one gamer row, and the rule that they never become one row.
//
// ===== READ G0d, U4b–U4d AND I1c2–I1c4 BEFORE CHANGING ANYTHING HERE =====
//
// A person may end up holding **two** accounts — one they made with an email,
// one that exists because they pressed a bot button — and that is permanent
// and fine. There is no merge. None exists, none is planned, no support path
// combines them, and **nothing here is shaped so that one could be added
// later**. That last clause is deliberate: a "merge-ready" design is a merge
// somebody eventually runs.
//
// The obvious worry — one person entering the same challenge twice — is
// already answered somewhere else entirely. `L1` makes a game account unique
// across every gamer, so the second account to try linking it is refused by
// the ordinary collision path. **That is what stops one person scoring twice.**
// Not a merge, not a special case, and not anything this file needs to know
// about.
//
// So what this file actually does is small: hash a password, check one, and
// answer "that identity is already somewhere" with a **route rather than a
// refusal**.

import { and, eq, isNotNull, ne } from "drizzle-orm";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * scrypt, not SHA-256.
 *
 * The opposite call to `lib/core/keys.ts`, and for the opposite reason: a
 * portal key is 24 random bytes with no dictionary to run, whereas a password
 * is human-chosen and a work factor is the only thing standing between a
 * leaked table and every account in it.
 */
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function passwordMatches(
  stored: string | null | undefined,
  given: string,
): Promise<boolean> {
  if (!stored) return false;
  const [scheme, salt, hex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = await scrypt(given, salt, KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** The weakest password we will take. Short, because length is what matters. */
export const MIN_PASSWORD_LENGTH = 10;

export class CredentialRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialRefused";
  }
}

export function checkPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new CredentialRefused(
      `A password needs at least ${MIN_PASSWORD_LENGTH} characters. Length is ` +
        `the part that matters — a long ordinary phrase beats a short clever one.`,
    );
  }
}

/**
 * What happens when somebody links an identity that is already somewhere else.
 *
 * ===== A ROUTE, NOT A REFUSAL, AND NEVER A MERGE =====
 *
 * Three outcomes and only three:
 *
 *   `free`     — nobody holds it. Link it to this row.
 *   `mine`     — this row already holds it. A no-op, not an error.
 *   `elsewhere`— another gamer holds it. **Say where to go, change nothing.**
 *
 * There is deliberately no fourth outcome. `elsewhere` does not offer to
 * transfer, does not offer to merge, and does not mark anything for later
 * reconciliation. The account they are standing in stays exactly as it was,
 * and both accounts continue to exist forever (U4b).
 */
export type LinkOutcome =
  | { kind: "free" }
  | { kind: "mine" }
  | { kind: "elsewhere"; message: string };

export async function discordLinkOutcome(
  db: DB,
  userId: string,
  discordId: string,
): Promise<LinkOutcome> {
  const [holder] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.discordId, discordId));

  if (!holder) return { kind: "free" };
  if (holder.id === userId) return { kind: "mine" };
  return {
    kind: "elsewhere",
    // The wording is from I1c1, and the shape of it is the point: it tells
    // them how to reach the thing they are looking for. A bare "already in
    // use" leaves somebody staring at an account they cannot get into while
    // their trophies sit on another one.
    message:
      "You already have a Cluster account — that Discord is linked to it. " +
      "Sign in with Discord to reach it. This account stays exactly as it is; " +
      "the two are separate and we never combine them.",
  };
}

export async function emailLinkOutcome(
  db: DB,
  userId: string,
  email: string,
): Promise<LinkOutcome> {
  const address = normaliseEmail(email);
  const [holder] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, address));

  if (!holder) return { kind: "free" };
  if (holder.id === userId) return { kind: "mine" };
  return {
    kind: "elsewhere",
    message:
      "You already have a Cluster account with that email. Sign in with it to " +
      "reach it. This account stays exactly as it is; the two are separate and " +
      "we never combine them.",
  };
}

/**
 * Link a Discord identity to an existing gamer.
 *
 * Returns the outcome rather than throwing on `elsewhere`, because `elsewhere`
 * is not an error — it is a signpost, and a page needs to render it as one.
 */
export async function linkDiscord(
  db: DB,
  userId: string,
  discordId: string,
): Promise<LinkOutcome> {
  const outcome = await discordLinkOutcome(db, userId, discordId);
  if (outcome.kind !== "free") return outcome;

  // One row, updated. Never an insert — U4: linking never creates a second
  // row. An insert here is the whole bug, and it is one word away.
  await db.update(schema.users).set({ discordId }).where(eq(schema.users.id, userId));
  return { kind: "mine" };
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Is this address usable as a credential for a *new* account?
 *
 * Distinct from `emailLinkOutcome` only in that there is no `userId` yet.
 */
export async function emailIsFree(db: DB, email: string): Promise<boolean> {
  const [holder] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normaliseEmail(email)));
  return !holder;
}

/** Gamers who could sign in with a password — used only by the reset flow. */
export async function gamerByEmail(db: DB, email: string) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.email, normaliseEmail(email)),
        eq(schema.users.status, "active"),
        isNotNull(schema.users.passwordHash),
      ),
    );
  return user ?? null;
}

