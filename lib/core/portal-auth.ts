import { createHmac, timingSafeEqual } from "crypto";
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

// ===== THE SIGNING SECRET IS `PORTAL_SECRET`, AND ONLY `PORTAL_SECRET`. =====
//
// This used to read
//
//     process.env.PORTAL_SECRET || process.env.CRON_SECRET || process.env.BOT_API_SECRET
//     || <a per-process random value>
//
// and both halves of that were wrong.
//
// THE CROSS-DOMAIN FALLBACKS. A portal session cookie is `HMAC(secret,
// "<kind>:<id>")` and depends on nothing else — not on the key, not on a
// nonce. So whoever holds the signing secret can mint a valid session for ANY
// brand and ANY server without ever seeing a key. `BOT_API_SECRET` is handed
// to whoever registers slash commands and `CRON_SECRET` is pasted into a
// scheduler; neither is a credential we would knowingly let open a customer's
// billing page. Three trust boundaries were sharing one value, and the two
// weaker ones decided the strongest.
//
// THE RANDOM FALLBACK. It looked safe — "sessions just don't survive a
// redeploy" — and it was the reason nobody noticed the secret was unset. Every
// cold start silently invalidated every portal session, so a brand contact was
// re-typing their key at intervals nobody could predict and reading it as
// normal. A deployment with no secret configured must be a startup failure, not
// a slow leak of usability.
//
// So: required, and it fails LOUDLY. The one concession is the in-process demo
// (`DEMO_DB` / no `DATABASE_URL`), which gets a fixed, obviously-named
// development value — fixed rather than random precisely so a dev server
// restart does not sign people out. It is checked here rather than imported
// from `lib/db` on purpose: this module is pure crypto with no database, which
// is what lets middleware and the edge use it.
const DEMO_SECRET = "cluster-demo-portal-secret-NOT-FOR-PRODUCTION";

function isDemo(): boolean {
  return process.env.DEMO_DB === "1" || !process.env.DATABASE_URL;
}

export const PORTAL_SECRET_MISSING =
  "PORTAL_SECRET is not set. It signs every brand and server portal session, "
  + "and it may not be shared with CRON_SECRET or BOT_API_SECRET — anyone holding "
  + "those could otherwise forge a session for any portal. Generate one with "
  + "`openssl rand -hex 32`, set it, and redeploy.";

function secret(): string {
  const configured = process.env.PORTAL_SECRET?.trim();
  if (configured) return configured;
  if (isDemo()) return DEMO_SECRET;
  throw new Error(PORTAL_SECRET_MISSING);
}

/**
 * A short signature over an arbitrary payload, using the same process secret.
 *
 * For links we mint and later have to trust — an ad click-through carrying a
 * campaign-creative id, say. Anyone can read the id in the URL; what this stops
 * is somebody writing their OWN url with a competitor's id in it and running up
 * that brand's click count.
 */
export function signPayload(payload: string, bytes = 16): string {
  return createHmac("sha256", secret()).update(payload).digest("hex").slice(0, bytes * 2);
}

export function verifyPayload(payload: string, signature: string | null | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signPayload(payload, signature.length / 2 || 16));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
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

/**
 * The cookie a portal session lives in.
 *
 * Exported for the sign-out handler, which has to expire the cookie on the
 * response rather than through `cookies()`. Deriving the name there instead
 * would mean two places agreeing on a string, and the failure mode of them
 * disagreeing is a sign-out that appears to work and doesn't.
 */
export function portalCookieName(kind: string, id: string): string {
  return cookieName(kind, id);
}

type Setter = { set: (opts: {
  name: string; value: string; httpOnly?: boolean; secure?: boolean;
  sameSite?: "lax" | "strict" | "none"; path?: string; maxAge?: number;
}) => unknown };

// Exchange a verified key for a session. Only ever called from a Route Handler
// or a Server Action — a Server Component render is not allowed to write
// cookies, and doing it there throws.
//
// `jar` is the response's cookie store when the caller has one (a Route
// Handler); without it we fall back to the request-scoped store, which works
// inside a Server Action.
export async function grantPortalSession(kind: string, id: string, jar?: Setter): Promise<void> {
  const store = jar ?? (await cookies());
  store.set({
    name: cookieName(kind, id),
    value: sign(kind, id),
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

// Is this key right? Throttled and timing-safe — but it does NOT grant the
// session, and that separation is the whole point.
//
// Granting means writing a cookie, and Next refuses to let a Server Component
// render write one: `cookies().set()` throws "Cookies can only be modified in a
// Server Action or Route Handler". The portal pages used to grant here, during
// their own render, so entering a CORRECT key crashed the page while a wrong
// one quietly showed the locked view — the failure appeared only on success,
// which is the hardest shape of bug to read from the outside.
//
// So verification is a pure function of the key, and the cookie is written by
// `/api/portal/unlock`, which is a Route Handler and is allowed to.
export type PortalCheck = "ok" | "bad" | "throttled";

export function verifyPortalKey(
  kind: string,
  id: string,
  expectedKey: string | null | undefined,
  givenKey: string | null | undefined,
): PortalCheck {
  if (!givenKey) return "bad";
  if (!throttleOk(`${kind}:${id}`)) return "throttled";
  if (!keysMatch(expectedKey, givenKey)) {
    noteFailure(`${kind}:${id}`);
    return "bad";
  }
  return "ok";
}

// ===== Brute-force lockout =====
//
// Two layers, and the second one is the real one.
//
// In memory: a per-process speed bump. Free, instant, and worth nothing on its
// own here — this is a serverless environment, so the map is empty on every
// cold start and an attacker only has to be unlucky enough to hit a warm one.
//
// In the database: `portal_login_attempts`. Three misses inside the window and
// the portal is locked for everyone until the window passes, which is the
// behaviour that was asked for — and, more importantly, every attempt is a row
// staff can read. A lockout nobody can see is a lockout nobody can act on.

/** Wrong keys before a portal locks. */
export const MAX_FAILURES = 3;
/** How long the lock lasts, and the window failures are counted over. */
export const LOCKOUT_MS = 15 * 60 * 1000;

const WINDOW_MS = LOCKOUT_MS;
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

/** Clear the in-memory counter for a portal — used after a correct key. */
export function clearThrottle(kind: string, id: string): void {
  failures.delete(`${kind}:${id}`);
}

// Moved to `lib/keys.ts`, re-exported here so every call site is unchanged.
// This module imports `next/headers`, so anything that generates a key had to
// drag that into its bundle — which is how the boot-time key rotation reached a
// client component and failed the build. See the note in lib/keys.ts.
export { newPortalKey, hashPortalKey, keyMatches } from "./keys.ts";
