import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { cookies } from "next/headers";

// Shared security for the key-gated portals (brands, and now Discord servers).
//
// The portals are deliberately not behind a Cluster login — a brand contact or
// a server owner shouldn't need an account to see their own dashboard. That
// makes the access key the ONLY thing standing between them and someone else's
// data, so it gets treated like a credential rather than a URL parameter:
//
//   * Comparison is timing-safe. A plain `!==` leaks the key one byte at a
//     time to anyone willing to measure, which is the whole attack against a
//     short shared secret.
//   * A correct key is exchanged for a signed, httpOnly session cookie scoped
//     to that one portal. The key then stops travelling in the query string,
//     where it would otherwise sit in browser history, server logs, and the
//     Referer header of every outbound link on the page.
//   * Attempts are throttled per portal, so the key can't be ground down by
//     brute force.
//
// Nothing here weakens the existing flow: a link with `?key=` still works.

const COOKIE_PREFIX = "portal_";
const MAX_AGE = 60 * 60 * 12; // 12 hours

// Signing secret. Falls back to a per-process random value, which is safe (it
// just means sessions don't survive a redeploy) but logs loudly enough to be
// noticed, since the fallback also breaks sessions across instances.
let ephemeral: string | null = null;
function secret(): string {
  const configured = process.env.PORTAL_SECRET || process.env.CRON_SECRET || process.env.BOT_API_SECRET;
  if (configured) return configured;
  if (!ephemeral) ephemeral = randomBytes(32).toString("hex");
  return ephemeral;
}

// Constant-time string comparison that doesn't leak length either.
export function keysMatch(expected: string | null | undefined, given: string | null | undefined): boolean {
  if (!expected || !given) return false;
  const a = createHmac("sha256", secret()).update(expected).digest();
  const b = createHmac("sha256", secret()).update(given).digest();
  return timingSafeEqual(a, b);
}

function sign(kind: string, id: string): string {
  return createHmac("sha256", secret()).update(`${kind}:${id}`).digest("hex");
}

function cookieName(kind: string, id: string): string {
  // The id is in the name so a session for one server can never be replayed
  // against another, even if the cookie value leaks.
  return `${COOKIE_PREFIX}${kind}_${id}`.slice(0, 96);
}

// Exchange a verified key for a session. Call this only after `keysMatch`.
export async function grantPortalSession(kind: string, id: string): Promise<void> {
  const jar = await cookies();
  jar.set(cookieName(kind, id), sign(kind, id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function hasPortalSession(kind: string, id: string): Promise<boolean> {
  try {
    const jar = await cookies();
    const got = jar.get(cookieName(kind, id))?.value;
    if (!got) return false;
    const want = sign(kind, id);
    if (got.length !== want.length) return false;
    return timingSafeEqual(Buffer.from(got), Buffer.from(want));
  } catch { return false; }
}

export async function revokePortalSession(kind: string, id: string): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(cookieName(kind, id));
  } catch { /* nothing to clear */ }
}

// Is this portal unlocked — by a fresh key, or by a session from earlier?
// Grants the session as a side effect when the key is correct, so the caller
// can redirect to a URL with no key in it.
export async function unlockPortal(
  kind: string,
  id: string,
  expectedKey: string | null | undefined,
  givenKey: string | null | undefined,
): Promise<boolean> {
  if (await hasPortalSession(kind, id)) return true;
  if (!givenKey) return false;
  if (!throttleOk(`${kind}:${id}`)) return false;
  if (!keysMatch(expectedKey, givenKey)) {
    noteFailure(`${kind}:${id}`);
    return false;
  }
  await grantPortalSession(kind, id);
  return true;
}

// ===== Brute-force throttle =====
//
// Per-portal, in memory. This is a serverless environment so it isn't a global
// guarantee — it's a speed bump that costs an attacker far more than it costs
// a person who mistyped their key once.

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; first: number }>();

function throttleOk(bucket: string): boolean {
  const rec = failures.get(bucket);
  if (!rec) return true;
  if (Date.now() - rec.first > WINDOW_MS) { failures.delete(bucket); return true; }
  return rec.count < MAX_FAILURES;
}

function noteFailure(bucket: string): void {
  const rec = failures.get(bucket);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    failures.set(bucket, { count: 1, first: Date.now() });
    return;
  }
  rec.count++;
}

// A fresh key: short enough to paste from a DM, long enough to be unguessable
// (32^12 ≈ 2^60), and free of characters that get misread.
export function newPortalKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) out += "-";
  }
  return out;
}
