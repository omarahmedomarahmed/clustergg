// A server owner's wallet. B89.1.
//
// ===== WHAT WAS MISSING =====
//
// An owner could see the challenges they ran and could not see the money they
// were owed. There was no balance, no statement, and no way to spend what they
// had earned — the weekly close opened a payout and that was the whole story.
//
// ===== THE ARITHMETIC, AND WHY IT IS SUBTRACTION RATHER THAN A STORED NUMBER =====
//
//   earned    Σ what the weekly close awarded (its payout lines)
//   paid      Σ payouts actually sent
//   pending   Σ payouts the owner has ASKED for and not yet received
//   spent     Σ charges: private challenges bought out of the balance
//
//   available = earned − paid − pending − spent
//
// Every term is a sum over rows that already exist for another reason, so there
// is no balance column to drift from them. That is the same rule the four
// vaults follow, and for the same reason: a stored balance cannot be
// reconstructed after it goes wrong.
//
// ===== WHY `pending` IS SUBTRACTED, AND WHY A DRAFT IS NOT PENDING =====
//
// A payout the owner has REQUESTED is money on its way to them. Leaving it in
// `available` would let them spend it on a private challenge as well, and the
// platform would owe twice and find out at the provider.
//
// A DRAFT is different: it is the weekly close's own calculation, opened
// automatically, that the owner has not acted on. It is their money sitting in
// their wallet. Treating a draft as committed makes `available` identically zero
// for everybody — see the note on COMMITTED.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { WEEK_CLOSE_ACTOR } from "@/lib/week-close";
import { uid } from "@/lib/utils";

/**
 * Payout states that have consumed the money without having sent it yet.
 *
 * **`draft` IS NOT ONE OF THEM**, and getting that wrong made the whole wallet
 * pointless: the weekly close opens a draft payout for the full amount it
 * awarded, so if a draft were committed then `available` would be
 * earned − paid − earned = 0, always, for every owner, forever. The first run
 * of tests/db/server-wallet showed exactly that and it is the reason this
 * comment exists.
 *
 * The distinction that makes it work:
 *
 *   draft      OUR calculation. The money is earned and sitting in the wallet.
 *   requested+ THEIRS. They asked for it and it is on its way out.
 *
 * So a draft is spendable and a requested payout is not. Withdrawing converts
 * one into the other, which is exactly the moment the money stops being
 * available for anything else.
 */
const COMMITTED = ["requested", "approved", "processing"];

/**
 * Who opened a payout, when that payout is a movement of THIS WALLET.
 *
 * Two actors and only two: the weekly close (which puts money in) and the owner
 * (who asks for it back out). Anything else — a correction, a goodwill cheque,
 * a one-off an admin typed by hand — was never funded out of the pool and is
 * not a withdrawal of it.
 *
 * `paid` and `pending` are filtered by this for the same reason `earned` is,
 * and the reason is a money bug: a $200 goodwill cheque marked paid would have
 * counted against `paid` without ever counting toward `earned`, so the owner's
 * spendable balance would drop by $200 the moment we gave them $200. Extra
 * money is not a withdrawal.
 */
export const OWNER_ACTOR_PREFIX = "owner:";
export const ownerActor = (guildId: string) => `${OWNER_ACTOR_PREFIX}${guildId}`;
const isWalletActor = (by: string | null | undefined) =>
  by === WEEK_CLOSE_ACTOR || (by ?? "").startsWith(OWNER_ACTOR_PREFIX);

export type Wallet = {
  guildId: string;
  earned: number;
  paid: number;
  pending: number;
  spent: number;
  /** What they can withdraw or spend right now. Never negative. */
  available: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One server's wallet.
 *
 * `earned` counts only what the WEEKLY CLOSE awarded — `requestedBy` is the
 * close's own actor. A payout opened by hand is a correction or a goodwill
 * cheque; it was never funded out of the pool, and counting it as earnings
 * would let an adjustment inflate a balance an owner can then spend.
 */
export async function walletFor(db: DB, guildId: string): Promise<Wallet> {
  const empty: Wallet = { guildId, earned: 0, paid: 0, pending: 0, spent: 0, available: 0 };
  try {
    const [earnedRow] = await db.select({
      n: sql<number>`coalesce(sum(${schema.serverPayoutLines.amount}), 0)`,
    }).from(schema.serverPayoutLines)
      .innerJoin(schema.serverPayouts, eq(schema.serverPayoutLines.payoutId, schema.serverPayouts.id))
      .where(and(
        eq(schema.serverPayouts.guildId, guildId),
        eq(schema.serverPayouts.requestedBy, WEEK_CLOSE_ACTOR),
        sql`${schema.serverPayouts.status} <> 'cancelled'`,
      ));

    const [paidRow] = await db.select({
      n: sql<number>`coalesce(sum(${schema.serverPayoutLines.amount}), 0)`,
    }).from(schema.serverPayoutLines)
      .innerJoin(schema.serverPayouts, eq(schema.serverPayoutLines.payoutId, schema.serverPayouts.id))
      .where(and(
        eq(schema.serverPayouts.guildId, guildId),
        eq(schema.serverPayouts.status, "paid"),
        inArray(schema.serverPayouts.requestedBy, [WEEK_CLOSE_ACTOR, ownerActor(guildId)]),
      ));

    const [pendingRow] = await db.select({
      n: sql<number>`coalesce(sum(${schema.serverPayoutLines.amount}), 0)`,
    }).from(schema.serverPayoutLines)
      .innerJoin(schema.serverPayouts, eq(schema.serverPayoutLines.payoutId, schema.serverPayouts.id))
      .where(and(
        eq(schema.serverPayouts.guildId, guildId),
        inArray(schema.serverPayouts.status, COMMITTED),
        inArray(schema.serverPayouts.requestedBy, [WEEK_CLOSE_ACTOR, ownerActor(guildId)]),
      ));

    // AMOUNT PLUS FEE. B90.4 caught this: a charge stores the prize pool and our
    // margin in separate columns, and summing only the pool meant the fee never
    // left the wallet. The owner was billed $210, $200 came off their balance,
    // and the $10 was a discount nobody decided to give.
    const [spentRow] = await db.select({
      n: sql<number>`coalesce(sum(${schema.serverCharges.amount} + coalesce(${schema.serverCharges.feeAmount}, 0)), 0)`,
    }).from(schema.serverCharges).where(eq(schema.serverCharges.guildId, guildId));

    const earned = round2(Number(earnedRow?.n ?? 0));
    const paid = round2(Number(paidRow?.n ?? 0));
    const pending = round2(Number(pendingRow?.n ?? 0));
    const spent = round2(Number(spentRow?.n ?? 0));
    return {
      guildId, earned, paid, pending, spent,
      available: Math.max(0, round2(earned - paid - pending - spent)),
    };
  } catch {
    // An unreadable wallet is an EMPTY one, never a full one. Everything
    // downstream spends against this number.
    return empty;
  }
}

export type StatementRow = {
  at: Date;
  kind: "earned" | "withdrawn" | "spent";
  label: string;
  /** Positive in, negative out — the same convention as the vault ledger. */
  amount: number;
  status?: string;
};

/**
 * The statement. Every movement, newest first.
 *
 * Bounded: a console that grows with the age of the server is one that
 * eventually times out on the busiest owner.
 */
export async function statementFor(db: DB, guildId: string, limit = 60): Promise<StatementRow[]> {
  try {
    const payouts = await db.select({
      id: schema.serverPayouts.id,
      status: schema.serverPayouts.status,
      createdAt: schema.serverPayouts.createdAt,
      paidAt: schema.serverPayouts.paidAt,
      periodStart: schema.serverPayouts.periodStart,
      requestedBy: schema.serverPayouts.requestedBy,
    }).from(schema.serverPayouts)
      .where(eq(schema.serverPayouts.guildId, guildId))
      .orderBy(desc(schema.serverPayouts.createdAt))
      .limit(limit);

    // Line totals as a SEPARATE grouped query rather than a correlated subquery
    // in the select. The subquery version returned 0 for every row — a hand-written
    // `server_payout_lines l` inside a tagged template does not get the same
    // treatment as a schema reference, and the failure was silent: every earning
    // read as $0 and the statement looked like a list of nothing.
    const ids = payouts.map((p) => p.id);
    const lineRows = ids.length
      ? await db.select({
        payoutId: schema.serverPayoutLines.payoutId,
        n: sql<number>`coalesce(sum(${schema.serverPayoutLines.amount}), 0)`,
      }).from(schema.serverPayoutLines)
        .where(inArray(schema.serverPayoutLines.payoutId, ids))
        .groupBy(schema.serverPayoutLines.payoutId)
      : [];
    const totalBy = new Map(lineRows.map((r) => [r.payoutId, Number(r.n ?? 0)]));

    const charges = await db.select().from(schema.serverCharges)
      .where(eq(schema.serverCharges.guildId, guildId))
      .orderBy(desc(schema.serverCharges.createdAt))
      .limit(limit);

    const rows: StatementRow[] = [];
    for (const p of payouts) {
      const amount = round2(totalBy.get(p.id) ?? 0);
      if (p.requestedBy === WEEK_CLOSE_ACTOR) {
        rows.push({
          at: p.periodStart ?? p.createdAt,
          kind: "earned",
          label: p.periodStart
            ? `Weekly pool — week of ${p.periodStart.toISOString().slice(0, 10)}`
            : "Weekly pool",
          amount,
        });
      }
      // A payout is a WITHDRAWAL of money already earned, so it appears as its
      // own negative line rather than reducing the earning above it. An owner
      // reconciling a statement needs to see both events, not their net.
      //
      // Filtered to WALLET actors so the statement reconciles with the balance.
      // A hand-opened correction is real money and it is not a movement of this
      // wallet; showing it here would make the lines stop adding up to the
      // number at the top, which is the one thing a statement must never do.
      if (isWalletActor(p.requestedBy) && (p.status === "paid" || COMMITTED.includes(p.status))) {
        rows.push({
          at: p.paidAt ?? p.createdAt,
          kind: "withdrawn",
          label: p.status === "paid"
            ? "Paid out"
            : p.requestedBy === WEEK_CLOSE_ACTOR ? "Withdrawal in progress" : "You asked for this",
          amount: -amount,
          status: p.status,
        });
      }
    }
    for (const c of charges) {
      rows.push({
        at: c.createdAt,
        kind: "spent",
        label: c.label || "Private challenge",
        // What actually left the wallet, which is the prize pool and the fee.
        // A statement line smaller than the balance movement it explains is a
        // statement that stops adding up.
        amount: -round2(Number(c.amount ?? 0) + Number(c.feeAmount ?? 0)),
      });
    }
    return rows.sort((a, b) => +b.at - +a.at).slice(0, limit);
  } catch { return []; }
}

export type ChargeResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Take money out of a wallet for something the owner bought.
 *
 * Refuses to overdraw, and the refusal names the balance. An owner who is told
 * only "declined" assumes the platform is broken.
 *
 * Takes the handle it was given — this runs inside the transaction that creates
 * the thing being paid for, so the charge and the challenge land together or
 * neither does.
 */
export async function chargeWallet(
  db: DB,
  opts: { guildId: string; amount: number; fee: number; label: string; challengeId?: string },
): Promise<ChargeResult> {
  const amount = round2(Number(opts.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "That is not an amount." };

  // The balance has to cover the FEE as well. Checking only the amount would
  // let a wallet with exactly the prize pool in it buy a challenge that costs
  // the pool plus our margin, and the balance would go negative — which
  // `walletFor` then clamps to zero, hiding it.
  const fee = round2(Math.max(0, Number(opts.fee) || 0));
  const wallet = await walletFor(db, opts.guildId);
  if (amount + fee > wallet.available + 0.005) {
    return {
      ok: false,
      error: `That is ${money(amount + fee)} and the balance is ${money(wallet.available)}. `
        + (wallet.pending > 0
          ? `${money(wallet.pending)} is already committed to a withdrawal — cancel it to spend that here instead.`
          : "Earn more from the weekly pool, or make it smaller."),
    };
  }

  try {
    const id = uid();
    await db.insert(schema.serverCharges).values({
      id, guildId: opts.guildId, amount,
      feeAmount: fee,
      label: opts.label, challengeId: opts.challengeId ?? null,
    });
    // B91.4. An owner just spent their balance on a challenge for their own
    // members. It needs a metric and rules before it can be announced, and the
    // owner is now waiting on us.
    const { raiseAlert } = await import("@/lib/staff-alerts");
    await raiseAlert(db, {
      kind: "server.charge", desk: "ops",
      title: `A server bought a private challenge`,
      body: `${opts.label} — ${money(amount)} from their wallet. It cannot be announced until it has a metric and rules.`,
      href: `/admin/discord/${opts.guildId}`, refType: "charge", refId: id, once: true,
    });
    return { ok: true, id };
  } catch { return { ok: false, error: "Could not take the payment. Nothing was charged." }; }
}

/**
 * The smallest withdrawal we will open. **The only minimum on this platform.**
 *
 * ===== A DISTRIBUTION AND A WITHDRAWAL ARE NOT THE SAME THING =====
 *
 * They were treated as the same thing and it cost small servers real money.
 *
 *   DISTRIBUTION   the weekly pool divided into server wallets. A number moving
 *                  between two rows of our own database. No provider, no fee,
 *                  and therefore NO MINIMUM. If it is $0.50 it is $0.50. M2
 *                  removed the $25 floor that used to sit on it — and the money
 *                  under that floor was never held for later, it was printed
 *                  into a summary string and lost.
 *
 *   WITHDRAWAL     money leaving the wallet through Tremendous, to a person.
 *                  A provider transfer costs roughly a fixed amount whatever it
 *                  carries, so a $3 withdrawal spends most of itself getting
 *                  there. This is where a minimum is honest.
 *
 * ===== WHY $10 AND NOT $20 =====
 *
 * M3 lowered it with the ladder. The bar to start earning is now
 * `EARN_FLOOR` linked members, so the servers we are inviting are small and
 * their weekly share is small with it. A $20 gate on a server earning $2 a week
 * is ten weeks of watching a number climb before anything is real, which is
 * long enough to stop believing the number.
 *
 * Below this the money stays in the wallet, where it is still theirs and still
 * spendable on a private challenge for their own members — which starts lower
 * still, at `MIN_PRIZE_POOL`.
 */
export const MIN_WITHDRAWAL = 10;

/**
 * The owner asking for their balance.
 *
 * This opens a payout in `requested` — the same state staff open one in — and
 * it is deliberately the ONLY money-shaped thing an owner can do. It does not
 * approve, does not call a provider, and does not pay: a human still releases
 * it, exactly as before. What changed is who is allowed to ask.
 *
 * The amount is re-read from the wallet inside this call rather than trusted
 * from the form. A balance shown on a page five minutes ago is not a balance.
 */
export async function requestWithdrawal(
  db: DB,
  opts: { guildId: string; guildName?: string | null; amount: number; currency?: string },
): Promise<ChargeResult> {
  const amount = round2(Number(opts.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "That is not an amount." };

  const wallet = await walletFor(db, opts.guildId);
  if (amount < MIN_WITHDRAWAL) {
    return { ok: false, error: `The smallest withdrawal is ${money(MIN_WITHDRAWAL)} — a transfer any smaller spends most of itself in fees. It stays in your wallet until then.` };
  }
  if (amount > wallet.available + 0.005) {
    return {
      ok: false,
      error: `That is ${money(amount)} and your balance is ${money(wallet.available)}.`
        + (wallet.pending > 0 ? ` ${money(wallet.pending)} is already on its way out.` : ""),
    };
  }

  try {
    const id = uid();
    await db.insert(schema.serverPayouts).values({
      id,
      guildId: opts.guildId,
      guildName: opts.guildName ?? null,
      status: "requested",
      currency: (opts.currency ?? "USD").toUpperCase(),
      requestedBy: ownerActor(opts.guildId),
      requestedAt: new Date(),
      note: "Requested by the server owner from their wallet.",
    });
    await db.insert(schema.serverPayoutLines).values({
      id: uid(), payoutId: id, kind: "pool",
      label: "Withdrawal of wallet balance", amount,
    });
    return { ok: true, id };
  } catch { return { ok: false, error: "Could not open the withdrawal. Nothing has moved." }; }
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
