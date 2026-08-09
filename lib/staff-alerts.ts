// What a customer just did, on a desk where somebody will see it. B91.4.
//
// ===== WHY THIS IS NOT THE AUDIT LOG, AND NOT A NOTIFICATION =====
//
// The audit log records what STAFF did — "who authorised this payment". This
// records what CUSTOMERS did, which is a different question with a different
// urgency: is anybody on it. A brand that signs up at 2am, starts building a
// campaign, and hears nothing for four days was failed long before anybody
// thinks to read a log.
//
// And it is not a per-person notification, because an alert belongs to a DESK.
// The salesperson on shift reads it; the one on holiday does not come back to
// three hundred unread rows and mark them all read.
//
// ===== WHAT RAISES ONE =====
//
// Everything a customer does that we would want to react to inside the hour:
//   brand.signup           somebody opened an account
//   brand.campaign_draft   somebody started building and has not paid
//   brand.campaign_paid    somebody paid — the good one
//   invoice.paid           money landed
//   server.charge          an owner bought a private challenge
//   server.request         an owner asked for a challenge
//
// Deliberately NOT: every page view, every field edited. An alert stream that
// fires on activity rather than on intent is one nobody reads, and the whole
// value of this is that it is short enough to read.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";

export type Desk = "sales" | "ops" | "money";

export const DESKS: Record<Desk, { label: string; blurb: string }> = {
  sales: {
    label: "Sales",
    blurb: "Brands: who signed up, who is building something, who has not paid yet.",
  },
  ops: {
    label: "Operations",
    blurb: "Servers and gamers: challenge requests, installs, anything a community is waiting on.",
  },
  money: {
    label: "Money",
    blurb: "Payments in and out. Every one of these is a number that moved.",
  },
};

export type AlertInput = {
  kind: string;
  desk?: Desk;
  title: string;
  body?: string;
  href?: string | null;
  refType?: string | null;
  refId?: string | null;
  /**
   * Raise at most one of these per ref, ever.
   *
   * A brand that clicks into the campaign builder four times is one lead, not
   * four alerts — and a desk that gets four is a desk that starts skimming.
   */
  once?: boolean;
};

/**
 * Raise an alert.
 *
 * NEVER throws and never blocks what it is reporting on. An alert is a
 * courtesy; a signup that fails because we could not tell ourselves about it
 * is a customer lost to our own bookkeeping.
 */
export async function raiseAlert(db: DB, a: AlertInput): Promise<void> {
  try {
    if (a.once && a.refId) {
      const [dupe] = await db.select({ id: schema.staffAlerts.id })
        .from(schema.staffAlerts)
        .where(and(
          eq(schema.staffAlerts.kind, a.kind),
          eq(schema.staffAlerts.refId, a.refId),
        )).limit(1);
      if (dupe) return;
    }
    await db.insert(schema.staffAlerts).values({
      id: uid(),
      kind: a.kind,
      desk: a.desk ?? "sales",
      title: a.title.slice(0, 200),
      body: (a.body ?? "").slice(0, 1000),
      href: a.href ?? null,
      refType: a.refType ?? null,
      refId: a.refId ?? null,
    });
  } catch { /* an alert must never fail the thing it is about */ }
}

export type AlertRow = typeof schema.staffAlerts.$inferSelect;

/** The open list for one desk, or for all of them. */
export async function openAlerts(db: DB, desk?: Desk, limit = 60): Promise<AlertRow[]> {
  try {
    return await db.select().from(schema.staffAlerts)
      .where(desk
        ? and(isNull(schema.staffAlerts.clearedAt), eq(schema.staffAlerts.desk, desk))
        : isNull(schema.staffAlerts.clearedAt))
      .orderBy(desc(schema.staffAlerts.createdAt))
      .limit(limit);
  } catch { return []; }
}

/** How many are waiting, per desk — for the badge on the nav. */
export async function alertCounts(db: DB): Promise<Record<string, number>> {
  try {
    const rows = await db.select({
      desk: schema.staffAlerts.desk,
      n: sql<number>`count(*)`,
    }).from(schema.staffAlerts)
      .where(isNull(schema.staffAlerts.clearedAt))
      .groupBy(schema.staffAlerts.desk);
    return Object.fromEntries(rows.map((r) => [r.desk, Number(r.n ?? 0)]));
  } catch { return {}; }
}

/** Somebody dealt with it. Attributed, because "who picked this up" is the next question. */
export async function clearAlert(db: DB, id: string, staffId: string): Promise<void> {
  try {
    await db.update(schema.staffAlerts)
      .set({ clearedAt: new Date(), clearedBy: staffId })
      .where(eq(schema.staffAlerts.id, id));
  } catch { /* non-fatal */ }
}
