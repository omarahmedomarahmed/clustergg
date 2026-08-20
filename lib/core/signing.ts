// Signing, and the sessions the portals actually use.
//
// ===== THIS FILE REPLACES `lib/core/portal-auth.ts`, WHICH IS DELETED =====
//
// S1: *"the server-owner credential is **deleted entirely**. The column is gone
// rather than nulled: a credential column that still exists is a credential
// somebody re-populates."*
//
// The same was true of the file. `portal-auth.ts` still implemented key
// verification (`verifyPortalKey`, `keysMatch`) and its brute-force throttle
// (`MAX_FAILURES`, `LOCKOUT_MS`, `clearThrottle`) for a model v3 deleted, and
// its own header — live, in the file — described that model as current: *"the
// portals are deliberately not behind a Cluster login … that makes the access
// key the ONLY thing standing between them and someone else's data."*
//
// `94-export-reach` found all five key-verification exports with no caller.
// Deleting only those five would have left a file called `portal-auth` whose
// name is an invitation to put the credential back, so the four live functions
// moved here and the file went with the model.
//
// A portal is opened by a **linked Discord identity that Discord says admins
// this guild**, or by a brand's email and password. Never by something we
// issued and they kept. What is left below is the session cookie those two
// doors write, and the payload signature that is not about portals at all.
//
// ===== PURE CRYPTO, NO DATABASE =====
//
// Deliberately: middleware and the edge can import this, and a database read in
// a cookie check is a database read on every request.

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_PREFIX = "portal_";
const MAX_AGE = 60 * 60 * 12; // 12 hours

// ===== THE SIGNING SECRET IS `PORTAL_SECRET`, AND ONLY `PORTAL_SECRET` =====
//
// It used to fall back to `CRON_SECRET`, then `BOT_API_SECRET`, then a
// per-process random value, and every one of those was wrong.
//
// THE CROSS-DOMAIN FALLBACKS. A session cookie is `HMAC(secret, "<kind>:<id>")`
// and depends on nothing else, so whoever holds the signing secret can mint a
// valid session for **any** brand and **any** server. `BOT_API_SECRET` is handed
// to whoever registers slash commands and `CRON_SECRET` is pasted into a
// scheduler; neither is a credential we would knowingly let open a customer's
// billing page. Three trust boundaries shared one value and the two weaker ones
// decided the strongest.
//
// THE RANDOM FALLBACK. It looked safe — *"sessions just don't survive a
// redeploy"* — and it is why nobody noticed the secret was unset: every cold
// start silently invalidated every session, so people were re-signing-in at
// intervals nobody could predict and reading it as normal. A deployment with no
// secret must fail loudly, not leak usability slowly.
//
// The one concession is the in-process demo, which gets a fixed,
// obviously-named development value — fixed rather than random precisely so a
// dev server restart does not sign anybody out.
const DEMO_SECRET = "cluster-demo-portal-secret-NOT-FOR-PRODUCTION";

function isDemo(): boolean {
  return process.env.DEMO_DB === "1" || !process.env.DATABASE_URL;
}

export const PORTAL_SECRET_MISSING =
  "PORTAL_SECRET is not set. It signs every brand and server portal session, " +
  "and it may not be shared with CRON_SECRET or BOT_API_SECRET — anyone holding " +
  "those could otherwise forge a session for any portal. Generate one with " +
  "`openssl rand -hex 32`, set it, and redeploy.";

function secret(): string {
  const configured = process.env.PORTAL_SECRET?.trim();
  if (configured) return configured;
  if (isDemo()) return DEMO_SECRET;
  throw new Error(PORTAL_SECRET_MISSING);
}

/**
 * A short signature over an arbitrary payload.
 *
 * For links we mint and later have to trust — an OAuth state, an ad
 * click-through carrying a campaign id. Anybody can read what is in the URL;
 * what this stops is somebody writing their own URL with a competitor's id in
 * it and running up that brand's click count.
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

function sign(kind: string, id: string): string {
  return createHmac("sha256", secret()).update(`${kind}:${id}`).digest("hex");
}

function cookieName(kind: string, id: string): string {
  // The id is in the name, so a session for one server can never be replayed
  // against another even if the cookie value leaks.
  return `${COOKIE_PREFIX}${kind}_${id}`.slice(0, 96);
}

type Setter = {
  set: (opts: {
    name: string;
    value: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
  }) => unknown;
};

/**
 * Write the session cookie.
 *
 * Only ever from a Route Handler or a Server Action — a Server Component render
 * is not allowed to write cookies and doing it there throws. `jar` is the
 * response's cookie store when the caller has one; without it we fall back to
 * the request-scoped store, which works inside a Server Action.
 */
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
  } catch {
    return false;
  }
}
