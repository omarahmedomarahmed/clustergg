import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { hashIp } from "@/lib/ads";
import { MAX_FAILURES, LOCKOUT_MS } from "@/lib/portal-auth";

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
