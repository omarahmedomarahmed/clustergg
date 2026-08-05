// The gamer's financial statement (B18).
//
// The thing this page exists to answer, without anybody having to ask:
// **where did my points go, and what do I have?**
//
// That question spans four tables that have never been shown together —
// `quest_events` (points in), `marketplace_orders` (points out, trophies in),
// `user_trophies` (trophies in from challenges), `trophy_redeems` (trophies out
// for money). Each has its own screen; none of them reconcile against the
// others, so a gamer whose balance looked wrong had nowhere to go.
//
// One list, in and out, signed, like a bank statement.

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { CP_PAID_SQL, ACTION_LABEL } from "@/lib/quests";

/**
 * What moved, which way, and what it was worth.
 *
 * `cp` and `usd` are separate on purpose rather than one "amount": a trophy
 * arriving is not a CP movement, and pretending it is would make the running
 * balance wrong. A row carries whichever it moved, and the ledger reconciles
 * only the CP column against the wallet.
 */
export type LedgerRow = {
  id: string;
  at: string;
  kind: "cp_in" | "cp_out" | "trophy_in" | "trophy_out";
  /** What happened, in the gamer's own terms. */
  label: string;
  /** The detail under it — the quest, the challenge, who gifted it. */
  detail: string | null;
  /** Signed. Positive is into the wallet. */
  cp: number;
  /** Signed dollars, for trophy movements. */
  usd: number;
  imageUrl: string | null;
};

export type WalletView = {
  earned: number;
  spent: number;
  balance: number;
  /** What the balance is worth, at the current rate. */
  balanceUsd: number;
  cpPerDollar: number;
  /** Cash value of every trophy still held. */
  trophyValue: number;
  trophiesHeld: number;
  ledger: LedgerRow[];
};

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Everything, reconciled.
 *
 * The CP column is the one that has to add up: `earned - spent = balance`, and
 * the ledger's signed CP rows must sum to the same thing. If they ever disagree
 * the wallet is lying to somebody about their own money, which is the failure
 * this page exists to make impossible to hide.
 */
export async function getWallet(db: DB, userId: string | null, limit = 200): Promise<WalletView> {
  const empty: WalletView = {
    earned: 0, spent: 0, balance: 0, balanceUsd: 0, cpPerDollar: 10000,
    trophyValue: 0, trophiesHeld: 0, ledger: [],
  };
  if (!userId) return empty;

  try {
    const { cpWallet, cpPerDollar } = await import("@/lib/marketplace");
    const [wallet, rate] = await Promise.all([cpWallet(db, userId), cpPerDollar(db)]);

    // Four reads, together rather than in sequence: every query here is an
    // HTTPS round trip (B55.3), and these do not depend on each other.
    const [cpRows, orders, awards, redeems] = await Promise.all([
      // Points in. `CP_PAID` coalesces the pre-B34 rows where progress and
      // payment were the same number.
      db.select({
        id: schema.questEvents.id,
        actionKey: schema.questEvents.actionKey,
        cp: CP_PAID_SQL,
        at: schema.questEvents.createdAt,
        questName: schema.quests.name,
      }).from(schema.questEvents)
        .innerJoin(schema.quests, eq(schema.quests.id, schema.questEvents.questId))
        .where(eq(schema.questEvents.userId, userId))
        .orderBy(desc(schema.questEvents.createdAt)).limit(limit),

      // Points out, and trophies in when somebody gifted one TO them.
      db.select({
        id: schema.marketplaceOrders.id,
        buyerId: schema.marketplaceOrders.buyerId,
        recipientId: schema.marketplaceOrders.recipientId,
        cpSpent: schema.marketplaceOrders.cpSpent,
        value: schema.marketplaceOrders.value,
        kind: schema.marketplaceOrders.kind,
        at: schema.marketplaceOrders.createdAt,
        name: schema.trophies.name,
        imageUrl: schema.trophies.imageUrl,
      }).from(schema.marketplaceOrders)
        .innerJoin(schema.trophies, eq(schema.trophies.id, schema.marketplaceOrders.trophyId))
        .where(and(
          eq(schema.marketplaceOrders.status, "complete"),
          or(eq(schema.marketplaceOrders.buyerId, userId), eq(schema.marketplaceOrders.recipientId, userId)),
        ))
        .orderBy(desc(schema.marketplaceOrders.createdAt)).limit(limit),

      // Trophies in from challenges.
      db.select({
        id: schema.userTrophies.id,
        at: schema.userTrophies.awardedAt,
        placement: schema.userTrophies.placement,
        status: schema.userTrophies.status,
        name: schema.trophies.name,
        imageUrl: schema.trophies.imageUrl,
        value: schema.trophies.value,
        challengeId: schema.userTrophies.challengeId,
      }).from(schema.userTrophies)
        .innerJoin(schema.trophies, eq(schema.trophies.id, schema.userTrophies.trophyId))
        .where(eq(schema.userTrophies.userId, userId))
        .orderBy(desc(schema.userTrophies.awardedAt)).limit(limit),

      // Trophies out, for money.
      db.select({
        id: schema.trophyRedeems.id,
        at: schema.trophyRedeems.createdAt,
        amount: schema.trophyRedeems.amount,
        status: schema.trophyRedeems.status,
        awardIds: schema.trophyRedeems.awardIds,
      }).from(schema.trophyRedeems)
        .where(eq(schema.trophyRedeems.userId, userId))
        .orderBy(desc(schema.trophyRedeems.createdAt)).limit(limit),
    ]);

    // A trophy bought for yourself arrives through `marketplace_orders` AND
    // sits in `user_trophies`. Listing both would show one purchase twice, so
    // the award rows that a marketplace order already explains are dropped —
    // the order line says more (it carries the price).
    const boughtAwardIds = new Set<string>();
    const orderAwards = await db.select({ awardId: schema.marketplaceOrders.awardId })
      .from(schema.marketplaceOrders)
      .where(or(eq(schema.marketplaceOrders.buyerId, userId), eq(schema.marketplaceOrders.recipientId, userId)));
    for (const o of orderAwards) if (o.awardId) boughtAwardIds.add(o.awardId);

    const rows: LedgerRow[] = [];

    for (const r of cpRows) {
      const cp = Number(r.cp ?? 0);
      if (cp <= 0) continue;   // progress-only rows are not money (B34.2)
      rows.push({
        id: `cp:${r.id}`, at: r.at.toISOString(), kind: "cp_in",
        label: ACTION_LABEL[r.actionKey] ?? r.actionKey,
        detail: r.questName, cp, usd: 0, imageUrl: null,
      });
    }

    for (const o of orders) {
      const mine = o.buyerId === userId;
      const gifted = o.kind === "gift";
      if (mine) {
        rows.push({
          id: `buy:${o.id}`, at: (o.at ?? new Date()).toISOString(), kind: "cp_out",
          label: gifted ? `Gifted ${o.name}` : `Bought ${o.name}`,
          detail: gifted ? "A gift you sent" : null,
          cp: -Math.abs(Number(o.cpSpent ?? 0)), usd: 0, imageUrl: o.imageUrl,
        });
      }
      // Received as a gift: a trophy in, and it cost them nothing.
      if (!mine && o.recipientId === userId) {
        rows.push({
          id: `gift:${o.id}`, at: (o.at ?? new Date()).toISOString(), kind: "trophy_in",
          label: `Gift received — ${o.name}`,
          detail: "Someone bought this for you",
          cp: 0, usd: money(Number(o.value ?? 0)), imageUrl: o.imageUrl,
        });
      }
    }

    for (const a of awards) {
      if (boughtAwardIds.has(a.id)) continue;
      rows.push({
        id: `won:${a.id}`, at: (a.at ?? new Date()).toISOString(), kind: "trophy_in",
        label: `Won ${a.name}`,
        detail: a.placement === 1 ? "1st place" : a.placement === 2 ? "2nd place" : a.placement === 3 ? "3rd place" : null,
        cp: 0, usd: money(Number(a.value ?? 0)), imageUrl: a.imageUrl,
      });
    }

    for (const r of redeems) {
      rows.push({
        id: `redeem:${r.id}`, at: (r.at ?? new Date()).toISOString(), kind: "trophy_out",
        label: `Redeemed ${(r.awardIds ?? []).length} ${(r.awardIds ?? []).length === 1 ? "trophy" : "trophies"}`,
        // The status is the whole story of a redemption, so it is the detail.
        detail: r.status,
        cp: 0, usd: -money(Number(r.amount ?? 0)), imageUrl: null,
      });
    }

    rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const held = awards.filter((a) => a.status === "held");
    return {
      earned: wallet.earned,
      spent: wallet.spent,
      balance: wallet.balance,
      balanceUsd: money(wallet.balance / Math.max(1, rate)),
      cpPerDollar: rate,
      trophyValue: money(held.reduce((s, a) => s + Number(a.value ?? 0), 0)),
      trophiesHeld: held.length,
      ledger: rows.slice(0, limit),
    };
  } catch { return empty; }
}

/**
 * Does the ledger reconcile against the wallet?
 *
 * Exported so the suite can assert it and so a support conversation has a
 * definite answer. `limit` truncates the ledger for display, so this is only
 * meaningful on a full read — which is exactly why it takes the rows rather
 * than fetching its own.
 */
export function reconciles(w: WalletView): boolean {
  const inSum = w.ledger.filter((r) => r.cp > 0).reduce((s, r) => s + r.cp, 0);
  const outSum = w.ledger.filter((r) => r.cp < 0).reduce((s, r) => s - r.cp, 0);
  return inSum === w.earned && outSum === w.spent && w.earned - w.spent === w.balance;
}
