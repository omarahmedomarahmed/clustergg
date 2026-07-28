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

// Signing secret. Falls back to a per-PROCESS random value, which is safe (it
// just means sessions don't survive a redeploy).
//
// The fallback is cached on `globalThis`, not in a module variable, and that
// is not a nicety. Next bundles server code per entry point and the same
// module can end up instantiated more than once in one process — the route
// handler that MINTS the session and the server action that CHECKS it were
// landing in different bundles. With a module-local secret they each rolled
// their own, so a portal page rendered unlocked (its bundle had signed the
// cookie) while every action on that page threw "Invalid brand access key".
// One process, one secret, whichever bundle asks.
const SECRET_KEY = Symbol.for("cluster.portal.secret");
type SecretHolder = { [SECRET_KEY]?: string };

function secret(): string {
  const configured = process.env.PORTAL_SECRET || process.env.CRON_SECRET || process.env.BOT_API_SECRET;
  if (configured) return configured;
  const holder = globalThis as SecretHolder;
  if (!holder[SECRET_KEY]) holder[SECRET_KEY] = randomBytes(32).toString("hex");
  return holder[SECRET_KEY]!;
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
