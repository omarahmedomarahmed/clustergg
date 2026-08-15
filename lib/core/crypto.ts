// Symmetric encryption for the one thing on this platform that needs it: a
// provider session token we were given and must send back.
//
// Mobile Legends links by an in-game verification code and hands back a
// session token. There is no way to read a gamer's MLBB stats without
// replaying it, so it is stored — encrypted, with the key derived from
// `AUTH_SECRET` rather than a second secret nobody would remember to set.
//
// **This is not a general-purpose store for secrets, and it is never a place
// to put a payment detail.** House rule 5 is absolute: a redemption stores a
// method word and an opaque provider handle. A structural test walks the
// schema and fails the band if anything account-shaped appears; encryption
// would not make such a column allowed, it would only make it harder to find.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { authSecret } from "./secret.ts";

function key(): Buffer {
  return createHash("sha256").update(`cluster-provider-token ${authSecret()}`).digest();
}

/** `<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

/**
 * The plaintext, or null.
 *
 * Null rather than a throw: the caller is a sync path, and a token that will
 * not decrypt is a reconnect, not a crash. A throw here would take down the
 * whole batch for one bad row.
 */
export function decryptSecret(sealed: string): string | null {
  try {
    const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !body) return null;
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
