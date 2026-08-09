// What you are about to give up (B40).
//
// A balance with no owner is a liability whose owner has been erased. Deletion
// already worked — one click, no confirmation, no mention of the money — and
// `db.delete(users)` cascades, so a gamer holding £200 of trophies could lose
// them by misclicking a button in a settings page.
//
// This is not about keeping their data. Data deletion still proceeds in full.
// It is about telling somebody what they are giving up, and offering the one
// obvious alternative: **redeem first, then delete.** Most people who see the
// number take it, which is the point.

import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Redemption states where money is ALREADY MOVING.
 *
 * `sent` means a payout provider is holding an instruction against this person.
 * `approved` means we have committed to pay and staff may release it at any
 * moment. Deleting the account underneath either one leaves the provider paying
 * a person whose record no longer exists — an unreconcilable payment, and the
 * one case here that cannot be fixed afterwards by apologising.
 */
export const IN_FLIGHT = ["approved", "sent"] as const;

export type DeletionImpact = {
  /** CP forfeited, and what it is worth. */
  balance: number;
  balanceUsd: number;
  cpPerDollar: number;
  /** Trophies forfeited, and their total cash value. */
  trophies: { id: string; name: string; imageUrl: string; value: number }[];
  trophyValue: number;
  /** Redemptions already requested and not yet settled. */
  pending: { id: string; amount: number; currency: string; status: string }[];
  pendingValue: number;
  /** Money already moving. Deletion is REFUSED while any of these exist. */
  inFlight: { id: string; amount: number; currency: string; status: string }[];
  /** Is there anything at all to lose? */
  anythingAtStake: boolean;
  /** Total dollars forfeited if they go ahead. */
  totalUsd: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

export async function deletionImpact(db: DB, userId: string): Promise<DeletionImpact> {
  const empty: DeletionImpact = {
    balance: 0, balanceUsd: 0, cpPerDollar: 10000, trophies: [], trophyValue: 0,
    pending: [], pendingValue: 0, inFlight: [], anythingAtStake: false, totalUsd: 0,
  };
  try {
    const { cpWallet, cpPerDollar } = await import("@/lib/marketplace");
    // `allSettled`, not `all`, and deliberately.
    //
    // With `Promise.all`, a database that is down rejects all four of these; the
    // catch below handles the FIRST and the other three become unhandled
    // rejections, which is a process-level crash in Node and a logged fault in
    // production. `allSettled` observes every one of them, and the check under
    // it re-throws so the behaviour is unchanged: any failure still yields an
    // empty impact, which still allows deletion.
    const settled = await Promise.allSettled([
      cpWallet(db, userId),
      cpPerDollar(db),
      db.select({
        id: schema.userTrophies.id,
        name: schema.trophies.name,
        imageUrl: schema.trophies.imageUrl,
        value: schema.trophies.value,
      }).from(schema.userTrophies)
        .innerJoin(schema.trophies, eq(schema.trophies.id, schema.userTrophies.trophyId))
        .where(and(eq(schema.userTrophies.userId, userId), eq(schema.userTrophies.status, "held"))),
      db.select({
        id: schema.trophyRedeems.id,
        amount: schema.trophyRedeems.amount,
        currency: schema.trophyRedeems.currency,
        status: schema.trophyRedeems.status,
      }).from(schema.trophyRedeems)
        .where(and(
          eq(schema.trophyRedeems.userId, userId),
          inArray(schema.trophyRedeems.status, ["pending", "approved", "sent"]),
        )),
    ]);
    const bad = settled.find((s) => s.status === "rejected");
    if (bad) throw (bad as PromiseRejectedResult).reason;
    const [wallet, rate, held, redeems] = [
      (settled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof cpWallet>>>).value,
      (settled[1] as PromiseFulfilledResult<number>).value,
      (settled[2] as PromiseFulfilledResult<{ id: string; name: string; imageUrl: string; value: number }[]>).value,
      (settled[3] as PromiseFulfilledResult<{ id: string; amount: number; currency: string; status: string }[]>).value,
    ];

    const trophies = held.map((t) => ({ ...t, value: money(Number(t.value ?? 0)) }));
    const trophyValue = money(trophies.reduce((s, t) => s + t.value, 0));
    const inFlight = redeems.filter((r) => (IN_FLIGHT as readonly string[]).includes(r.status))
      .map((r) => ({ ...r, amount: money(Number(r.amount ?? 0)) }));
    const pending = redeems.map((r) => ({ ...r, amount: money(Number(r.amount ?? 0)) }));
    const pendingValue = money(pending.reduce((s, r) => s + r.amount, 0));
    const balanceUsd = money(wallet.balance / Math.max(1, rate));

    return {
      balance: wallet.balance, balanceUsd, cpPerDollar: rate,
      trophies, trophyValue, pending, pendingValue, inFlight,
      anythingAtStake: wallet.balance > 0 || trophies.length > 0 || pending.length > 0,
      totalUsd: money(balanceUsd + trophyValue),
    };
  } catch { return empty; }
}

/**
 * Everything of theirs that `DELETE FROM users` does not take with it. B95.
 *
 * ===== THE BUG THIS EXISTS FOR =====
 *
 * `db.delete(users)` cascades — but only over the foreign keys that exist, and
 * the tables added after the original schema was generated have none. Every one
 * of them was created by an idempotent `CREATE TABLE IF NOT EXISTS` in the
 * migration list, and none of those statements declares a reference. So an
 * account deletion took the row and left the quest events, the trophies, the
 * saved drafts, the payout preference and the Discord command log behind,
 * keyed to an id that no longer resolved.
 *
 * Nobody noticed because nothing reads an orphan. It was found by asserting
 * that an under-13 deletion removes everything, which is the one case where
 * "mostly deleted" is not a tidiness problem.
 *
 * Adding the missing foreign keys to a live database is the other fix, and it
 * is the one that cannot be done safely from a boot migration: an ALTER that
 * adds a reference fails outright if a single orphan already exists, which on
 * production is a boot loop rather than a migration. So the deletion is
 * explicit, ordered, and written down here where it can be read.
 *
 * ===== WHAT IS DELIBERATELY KEPT =====
 *
 * Money that actually moved. A `paid` redemption is a record of a payment we
 * made to a person — a financial record with its own retention rules, and one
 * the vault reconciliation reads. The same goes for the vault ledger, the
 * weekly allocations and the server payouts: those are the books, and an
 * account deletion must not rewrite the books.
 *
 * What they keep is an id that no longer resolves to a person, which is the
 * correct residue: the amount and the date survive, the human does not.
 */
export async function purgeUserRows(db: DB, userId: string): Promise<void> {
  const { sql: raw } = await import("drizzle-orm");
  // Written as raw statements against table names on purpose: this list must
  // match the DATABASE, and a table missing from a given deployment (an older
  // one, a test harness) has to be skipped rather than take the deletion down.
  const byUser = [
    "user_quest_progress", "quest_events", "user_quest_tiers", "user_trophies",
    "discord_guild_members", "discord_command_logs", "server_events",
    "brand_testimonials", "email_codes",
  ];
  for (const t of byUser) {
    try { await db.execute(raw.raw(`DELETE FROM "${t}" WHERE "user_id" = '${userId.replace(/'/g, "''")}'`)); }
    catch { /* table not on this deployment */ }
  }
  const byOther: [string, string][] = [
    ["payout_accounts", "owner_id"],
    ["form_drafts", "owner_id"],
    ["marketplace_orders", "recipient_id"],
    ["vote_week_actions", "actor_id"],
  ];
  for (const [t, col] of byOther) {
    try { await db.execute(raw.raw(`DELETE FROM "${t}" WHERE "${col}" = '${userId.replace(/'/g, "''")}'`)); }
    catch { /* table not on this deployment */ }
  }
  // Requests that never became a payment. The paid ones stay — see above.
  try {
    await db.execute(raw.raw(
      `DELETE FROM "trophy_redeems" WHERE "user_id" = '${userId.replace(/'/g, "''")}' AND "status" <> 'paid'`,
    ));
  } catch { /* table not on this deployment */ }
}

export type DeletionGuard = { ok: boolean; reason: string };

/**
 * May this account be deleted right now?
 *
 * The one hard NO: **not while money is in flight.** Everything else is a
 * warning — a balance and a trophy case are forfeited by a choice the gamer is
 * making with the number in front of them, and that is their right. But a
 * payout already approved or already handed to a provider is a payment in
 * progress to a person we would be erasing, and there is no version of that
 * which reconciles afterwards.
 *
 * The block is temporary by construction: it clears when the payout settles or
 * is cancelled, and the message says so, so it does not read as a refusal to
 * let somebody leave.
 */
export function deletionAllowed(impact: DeletionImpact): DeletionGuard {
  if (impact.inFlight.length === 0) return { ok: true, reason: "" };
  const total = money(impact.inFlight.reduce((s, r) => s + r.amount, 0));
  return {
    ok: false,
    reason: `You have $${total.toLocaleString("en-US", { minimumFractionDigits: 2 })} already being paid out — ${impact.inFlight.length === 1 ? "a payout that has" : "payouts that have"} been approved or sent to our payout partner. We cannot delete the account while that money is moving, because it would be paid to somebody whose record no longer exists. Collect it, or cancel the request, and this unlocks straight away.`,
  };
}
