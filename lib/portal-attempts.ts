import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { hashIp } from "@/lib/ads";
import { MAX_FAILURES, LOCKOUT_MS } from "@/lib/portal-auth";

/**
 * Wrong keys from one address before it is locked out, across every portal.
 *
 * Higher than `MAX_FAILURES` on purpose. One address is often one OFFICE — a
 * brand and their agency behind the same NAT, two people each mistyping their
 * own key — and a shared address is not evidence of an attack. What it is
 * evidence of, at three times the per-portal limit, is somebody working through
 * a list.
 */
export const MAX_IP_FAILURES = MAX_FAILURES * 3;

// The record of who tried to open a portal, and whether they got in.
//
// Separate from `portal-auth` on purpose: that module is pure crypto and has no
// database, which is what lets the middleware and the edge use it. This one is
// the durable half — the lockout that survives a cold start, and the log staff
// read when a brand asks "did somebody try to get into our account?".
//
// The key is never written here in any form. A short shared secret in a log is
// a short shared secret in every backup of that log.

export type PortalKind = "brand" | "server";

export type LockState = {
  locked: boolean;
  failures: number;
  /** Milliseconds until the lock lifts. 0 when not locked. */
  retryInMs: number;
};

const UNLOCKED: LockState = { locked: false, failures: 0, retryInMs: 0 };

/** Have there been too many wrong keys for this portal recently? */
export async function lockState(kind: PortalKind, portalId: string): Promise<LockState> {
  try {
    const db = await getDb();
    const since = new Date(Date.now() - LOCKOUT_MS);
    const rows = await db.select({ ok: schema.portalLoginAttempts.ok, at: schema.portalLoginAttempts.createdAt })
      .from(schema.portalLoginAttempts)
      .where(and(
        eq(schema.portalLoginAttempts.kind, kind),
        eq(schema.portalLoginAttempts.portalId, portalId),
        gte(schema.portalLoginAttempts.createdAt, since),
      ))
      .orderBy(desc(schema.portalLoginAttempts.createdAt))
      .limit(40);

    // Only failures SINCE the last success count. Getting in resets the
    // counter, so a person who mistyped twice and then succeeded isn't one
    // typo away from locking themselves out tomorrow.
    const failures: typeof rows = [];
    for (const r of rows) {
      if (r.ok) break;
      failures.push(r);
    }
    if (failures.length < MAX_FAILURES) return { locked: false, failures: failures.length, retryInMs: 0 };

    const newest = failures[0].at.getTime();
    const retryInMs = Math.max(0, newest + LOCKOUT_MS - Date.now());
    return { locked: retryInMs > 0, failures: failures.length, retryInMs };
  } catch {
    // If we can't tell, let them try. Locking every portal because a query
    // failed would turn a database blip into an outage for every customer.
    return UNLOCKED;
  }
}

/**
 * Too many wrong keys FROM ONE ADDRESS, across every portal. B103.
 *
 * ===== WHY THE PER-PORTAL LOCK IS NOT ENOUGH =====
 *
 * `lockState` counts failures against ONE portal, so somebody spraying a
 * guessed key across two hundred servers never trips it: four tries each, no
 * portal reaches five, and the attempt costs nothing. The whole value of a
 * short shared secret is that guessing it has to be expensive, and per-portal
 * counting made it free at exactly the scale an attacker would use.
 *
 * So this counts the OTHER way: every failure from one address, whichever
 * portal it was aimed at. The two locks answer different questions and both are
 * checked — "is this portal under attack" and "is this person attacking".
 *
 * ===== IT COUNTS A HASH, NOT AN ADDRESS =====
 *
 * `hashedIp` is what the table already stores, and it is what this reads. The
 * address itself is never written, so a lockout cannot be turned into a log of
 * who was where.
 *
 * ===== IT IGNORES SUCCESSES DELIBERATELY =====
 *
 * `lockState` resets on a success, because getting into your own portal proves
 * you are not guessing. That reasoning does not carry here: an attacker who
 * owns one legitimate portal would otherwise reset their own spray counter by
 * signing into it every fifth attempt.
 */
export async function ipLockState(ip: string | null | undefined): Promise<LockState> {
  if (!ip) return UNLOCKED;
  try {
    const db = await getDb();
    const since = new Date(Date.now() - LOCKOUT_MS);
    const rows = await db.select({ at: schema.portalLoginAttempts.createdAt })
      .from(schema.portalLoginAttempts)
      .where(and(
        eq(schema.portalLoginAttempts.hashedIp, hashIp(ip)),
        eq(schema.portalLoginAttempts.ok, false),
        gte(schema.portalLoginAttempts.createdAt, since),
      ))
      .orderBy(desc(schema.portalLoginAttempts.createdAt))
      .limit(MAX_IP_FAILURES + 1);

    if (rows.length < MAX_IP_FAILURES) {
      return { locked: false, failures: rows.length, retryInMs: 0 };
    }
    const retryInMs = Math.max(0, rows[0].at.getTime() + LOCKOUT_MS - Date.now());
    return { locked: retryInMs > 0, failures: rows.length, retryInMs };
  } catch {
    // Same reasoning as `lockState`: if we cannot tell, let them try. A
    // database blip must not lock every customer out at once.
    return UNLOCKED;
  }
}

/** Write one attempt. Never throws — an unrecorded attempt must not 500 a login. */
export async function recordAttempt(
  kind: PortalKind,
  portalId: string,
  portalName: string | null,
  ok: boolean,
  req?: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.portalLoginAttempts).values({
      id: uid(),
      kind,
      portalId,
      portalName,
      ok,
      hashedIp: req?.ip ? hashIp(req.ip) : null,
      userAgent: (req?.userAgent ?? "").slice(0, 200) || null,
    });
  } catch { /* the login already happened; bookkeeping failing is not worse */ }
}

export type AttemptRow = {
  id: string;
  kind: string;
  portalId: string;
  portalName: string | null;
  ok: boolean;
  hashedIp: string | null;
  userAgent: string | null;
  createdAt: Date;
};

/** Recent attempts across every portal, for the admin log. */
export async function recentAttempts(limit = 100): Promise<AttemptRow[]> {
  try {
    const db = await getDb();
    return await db.select().from(schema.portalLoginAttempts)
      .orderBy(desc(schema.portalLoginAttempts.createdAt))
      .limit(limit) as AttemptRow[];
  } catch { return []; }
}

/** Lift a lock by hand — staff answering "we're locked out and it's us". */
export async function clearAttempts(kind: PortalKind, portalId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(schema.portalLoginAttempts).where(and(
      eq(schema.portalLoginAttempts.kind, kind),
      eq(schema.portalLoginAttempts.portalId, portalId),
    ));
  } catch { /* nothing to clear */ }
}
