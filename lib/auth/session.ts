// Session cookies.
//
// The cookie carries a signed session id and nothing else. Not the user id,
// not the age band, not whether onboarding is finished. Every one of those is
// read from the database behind the id on each request, because a cookie is a
// claim that keeps being true after the fact underneath it stops being true —
// and the specific fact this platform cannot afford to be stale is the age
// band, which support can correct and which decides whether somebody may be
// paid money (docs/00-TRUTH.md G9).
//
// The signature is HMAC-SHA256 over the session id, compared in constant time.
// `AUTH_SECRET` is read through `lib/core/secret.ts` and nowhere else.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { authSecret } from "../core/secret.ts";

export const SESSION_COOKIE = "cluster_session";

/** Thirty days. Long enough that a gamer is not logged out mid-week. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sign(sessionId: string): string {
  return createHmac("sha256", authSecret()).update(sessionId).digest("base64url");
}

/** `<id>.<signature>` — the whole cookie value. */
export function seal(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

/**
 * The session id inside a cookie value, or null.
 *
 * Constant-time comparison. A timing-variable compare on a session signature
 * is exactly the kind of thing that looks fine forever and is one clever
 * afternoon away from being a forged admin cookie.
 */
export function unseal(cookie: string | null | undefined): string | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = cookie.slice(0, dot);
  const given = Buffer.from(cookie.slice(dot + 1));
  const want = Buffer.from(sign(id));
  if (given.length !== want.length) return null;
  return timingSafeEqual(given, want) ? id : null;
}

export async function createSession(db: DB, userId: string): Promise<string> {
  const id = randomBytes(24).toString("base64url");
  await db.insert(schema.sessions).values({
    id,
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return seal(id);
}

/**
 * The gamer behind a cookie, or null.
 *
 * Returns null for an expired session, a deleted account and a forged
 * signature alike. The caller gets one answer — "nobody" — because a caller
 * that distinguishes them is a caller that can be asked which one it was.
 */
export async function sessionUser(
  db: DB,
  cookie: string | null | undefined,
): Promise<{
  id: string;
  slug: string;
  ageBand: string | null;
  country: string | null;
  /** S0 — what makes somebody a server manager. Null for an email-only gamer. */
  discordId: string | null;
  /** A7/U5 — null is a complete state, not a missing one. */
  parentGuildId: string | null;
  /** A10/U7 — the grant that opens the console. Never what they are. */
  staffTitleId: string | null;
} | null> {
  const id = unseal(cookie);
  if (!id) return null;

  const [row] = await db
    .select({
      userId: schema.sessions.userId,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, id));
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;

  const [user] = await db
    .select({
      id: schema.users.id,
      slug: schema.users.slug,
      discordId: schema.users.discordId,
      parentGuildId: schema.users.parentGuildId,
      staffTitleId: schema.users.staffTitleId,
      ageBand: schema.users.ageBand,
      country: schema.users.country,
      status: schema.users.status,
    })
    .from(schema.users)
    .where(eq(schema.users.id, row.userId));
  if (!user || user.status !== "active") return null;

  return {
    id: user.id,
    slug: user.slug,
    discordId: user.discordId,
    parentGuildId: user.parentGuildId,
    staffTitleId: user.staffTitleId,
    ageBand: user.ageBand,
    country: user.country,
  };
}

export async function endSession(db: DB, cookie: string | null | undefined): Promise<void> {
  const id = unseal(cookie);
  if (id) await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
}

/** Housekeeping for the daily job. Expired sessions are rows, not secrets. */
export async function purgeExpiredSessions(db: DB): Promise<void> {
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}
