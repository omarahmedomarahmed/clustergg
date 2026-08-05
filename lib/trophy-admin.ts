// Admin owns every trophy, including the ones already held (B53).
//
// A trophy is ONE OBJECT shown in many places. `user_trophies` stores only
// `trophyId`, `placement` and `status` — no name, no image, and **no value** —
// so editing the trophy changes what every holder sees, automatically. That is
// the feature, and it is free.
//
// The money is somewhere else, and this is the distinction the whole item turns
// on:
//
//   - `trophies.value` is what an UNREDEEMED holding is worth. It is read live,
//     so raising it raises what everyone holding one can cash out. Intended.
//   - `trophy_redeems.amount` is the money. It is written ONCE, at request time
//     (`app/actions/trophies.ts:136`, `awards.reduce(...)`), and after that it
//     is a number a real person has been shown, may have been approved, and may
//     have already been paid. **Nothing here may ever move it.**
//
// A payout whose value changes after it left is a reconciliation failure with a
// person on the other end. A *pending* request counts too: they were quoted a
// figure.
//
// ── The deletion hazard, from the schema ──────────────────────────────────
//
// `user_trophies.trophyId` is `onDelete: "cascade"` (`lib/db/schema.ts:669`).
// Deleting a trophy therefore **deletes every gamer's holding of it**, silently.
// `marketplace_orders.trophyId` is `onDelete: "restrict"` (`:649`), so a trophy
// that was ever BOUGHT is refused by the database — but one that was only ever
// WON cascades away and takes every winner's shelf entry with it.
//
// So the two foreign keys disagree, and the gap is exactly "won, never bought",
// which is most trophies. That is a live data-loss path, and it is why the guard
// below is a rule rather than a nicety.

import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export type TrophyHolding = {
  trophyId: string;
  /** Everyone holding it right now, in any state. */
  holders: number;
  /** Held, i.e. still redeemable. */
  held: number;
  /** Already cashed out. */
  redeemed: number;
  /** Bought in the marketplace, ever. */
  bought: number;
};

/** Holder and redemption counts for every trophy, in one pass. */
export async function trophyHoldings(db: DB): Promise<Map<string, TrophyHolding>> {
  const out = new Map<string, TrophyHolding>();
  const bump = (id: string): TrophyHolding => {
    const cur = out.get(id) ?? { trophyId: id, holders: 0, held: 0, redeemed: 0, bought: 0 };
    out.set(id, cur);
    return cur;
  };
  try {
    const rows = await db.select({
      trophyId: schema.userTrophies.trophyId,
      status: schema.userTrophies.status,
      n: sql<number>`count(*)`,
    }).from(schema.userTrophies).groupBy(schema.userTrophies.trophyId, schema.userTrophies.status);
    for (const r of rows) {
      const c = bump(r.trophyId);
      const n = Number(r.n ?? 0);
      c.holders += n;
      if (r.status === "redeemed") c.redeemed += n;
      else c.held += n;
    }
    const orders = await db.select({
      trophyId: schema.marketplaceOrders.trophyId,
      n: sql<number>`count(*)`,
    }).from(schema.marketplaceOrders).groupBy(schema.marketplaceOrders.trophyId);
    for (const r of orders) bump(r.trophyId).bought = Number(r.n ?? 0);
  } catch { /* an unreadable count must not take the admin page down */ }
  return out;
}

export type Holder = { userId: string; name: string; slug: string; status: string; awardedAt: Date | null };

/** Who holds one trophy. The list an admin needs before touching anything. */
export async function holdersOf(db: DB, trophyId: string, limit = 100): Promise<Holder[]> {
  try {
    return await db.select({
      userId: schema.userTrophies.userId,
      name: schema.users.displayName,
      slug: schema.users.slug,
      status: schema.userTrophies.status,
      awardedAt: schema.userTrophies.awardedAt,
    }).from(schema.userTrophies)
      .innerJoin(schema.users, eq(schema.users.id, schema.userTrophies.userId))
      .where(eq(schema.userTrophies.trophyId, trophyId))
      .limit(limit);
  } catch { return []; }
}

export type DeleteCheck = { ok: boolean; reason: string; holders: number };

/**
 * May this trophy be deleted?
 *
 * **No, if anybody holds it.** The cascade would take their holding with it and
 * say nothing — a gamer opens their profile and a trophy they won is simply
 * gone, with no event, no notification and nothing to point at.
 *
 * Everything else about it stays editable, which is the point: the answer to
 * "this trophy is wrong" is to fix it, not to delete it and hope nobody had one.
 */
export async function canDeleteTrophy(db: DB, trophyId: string): Promise<DeleteCheck> {
  try {
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(schema.userTrophies)
      .where(eq(schema.userTrophies.trophyId, trophyId));
    const holders = Number(row?.n ?? 0);
    if (holders === 0) return { ok: true, reason: "", holders: 0 };
    return {
      ok: false,
      holders,
      reason: `${holders} ${holders === 1 ? "gamer holds" : "gamers hold"} this trophy, so it cannot be deleted — deleting it would remove it from their profiles with no notice. Everything else about it is still editable: change the image, the name, the description or what it is worth, and every holder sees the change.`,
    };
  } catch {
    // Fail CLOSED. Being unable to check is not a reason to risk taking a won
    // trophy off somebody's profile.
    return { ok: false, holders: 0, reason: "Could not check who holds this trophy, so it was not deleted." };
  }
}

/**
 * What a value change would move, stated before it is made.
 *
 * Two numbers, and the second is the one that must be zero: how many holdings
 * are revalued, and how many in-flight redemptions would be touched. The answer
 * to the second is always none — `trophy_redeems.amount` is frozen at request
 * time — and this exists so an admin can see that rather than trust it.
 */
export type ValueImpact = { revalued: number; inFlight: number; inFlightAmount: number };

export async function valueImpact(db: DB, trophyId: string): Promise<ValueImpact> {
  const empty: ValueImpact = { revalued: 0, inFlight: 0, inFlightAmount: 0 };
  try {
    const [held] = await db.select({ n: sql<number>`count(*)` }).from(schema.userTrophies)
      .where(and(eq(schema.userTrophies.trophyId, trophyId), eq(schema.userTrophies.status, "held")));

    // A redemption in flight is one that has been requested and not settled.
    // Its amount is already written down, so it is listed to show it is NOT
    // moving — the reassurance is the point.
    const awards = await db.select({ id: schema.userTrophies.id }).from(schema.userTrophies)
      .where(eq(schema.userTrophies.trophyId, trophyId));
    const ids = awards.map((a) => a.id);
    if (!ids.length) return { revalued: Number(held?.n ?? 0), inFlight: 0, inFlightAmount: 0 };

    const redeems = await db.select({
      id: schema.trophyRedeems.id,
      amount: schema.trophyRedeems.amount,
      status: schema.trophyRedeems.status,
      awardIds: schema.trophyRedeems.awardIds,
    }).from(schema.trophyRedeems)
      .where(inArray(schema.trophyRedeems.status, ["pending", "approved", "sent", "paid"]));

    const touching = redeems.filter((r) =>
      (r.awardIds ?? []).some((a: string) => ids.includes(a)));

    return {
      revalued: Number(held?.n ?? 0),
      inFlight: touching.length,
      inFlightAmount: Math.round(touching.reduce((s, r) => s + Number(r.amount ?? 0), 0) * 100) / 100,
    };
  } catch { return empty; }
}
