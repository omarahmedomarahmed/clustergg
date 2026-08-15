// Portal keys.
//
// S1 — portal access is by key, never a password. That is not a shortcut: a
// password needs a reset flow, a reset flow needs an email, and an email is
// exactly the thing this platform does not ask a gamer for. An owner or a
// brand holds a key, we hold its hash, and a lost key is reissued.
//
// The key is shown **once**, at the moment it is created, and never again.
// Storing something we could show back is storing a credential.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Long enough that guessing is not a strategy; short enough to paste. */
const KEY_BYTES = 24;

export function newPortalKey(): string {
  return randomBytes(KEY_BYTES).toString("base64url");
}

/**
 * The stored form.
 *
 * SHA-256 rather than a slow hash, deliberately: a portal key is 24 random
 * bytes, not a human-chosen password, so there is no dictionary to run and
 * nothing for a work factor to buy. What matters is that the comparison is
 * constant-time, which `keyMatches` is.
 */
export function hashPortalKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function keyMatches(hash: string | null | undefined, given: string | null | undefined): boolean {
  if (!hash || !given) return false;
  const a = Buffer.from(hash);
  const b = Buffer.from(hashPortalKey(given));
  return a.length === b.length && timingSafeEqual(a, b);
}
