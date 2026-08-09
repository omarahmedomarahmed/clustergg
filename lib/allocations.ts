// What a week is allowed to spend. B88.2.
//
// ===== THE PROBLEM =====
//
// The daily CP ceiling was a number a human typed into a settings row (500) and
// the server pool was the whole server vault. Neither was connected to the money
// behind it, and there was no way to hold a reserve — a week with no sales paid
// nothing, and a week with one big sale paid all of it out.
//
// ===== THE SHAPE =====
//
// An admin RELEASES an amount for a week, per vault. That amount is the budget.
// What is not released is the reserve, and the reserve is the whole point: it is
// what pays gamers and servers through a week when nothing sold.
//
//   vault      = the bank
//   allocation = this week's budget
//   spent      = what has actually gone out
//   remaining  = allocation − spent
//
// Every number the gamer economy and the server pool derive comes from
// `remaining`, never from the vault balance.
//
// ===== THE ONE RULE THAT IS NOT NEGOTIABLE =====
//
// **An allocation can be raised mid-week. It can never be lowered.**
//
// Gamers have already been shown a daily ceiling computed from it, and servers
// have already been shown a pool. Lowering it after that takes back something
// people were told they had — and once a platform does that, no number it
// publishes is worth reading. Raising is safe: nobody is worse off.

import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { balances, cpSpentSince } from "@/lib/vaults";

/** The two vaults that are budgeted weekly. */
export const ALLOCATED_VAULTS = ["cp", "server"] as const;
export type AllocatedVault = (typeof ALLOCATED_VAULTS)[number];

export type Allocation = {
  week: string;
  vault: AllocatedVault;
  amount: number;
  locked: boolean;
  note: string | null;
  /**
   * Whether a row exists at all.
   *
   * NOT the same as `amount === 0`, and the difference is the whole migration
   * story. No row means nobody has ever released a budget for this week — the
   * feature is not in use — and everything downstream keeps its old behaviour.
   * A row of 0 means somebody deliberately paused the week.
   *
   * Collapsing the two would mean deploying this file silently stops every
   * gamer earning until an admin discovers a screen they have never seen.
   */
  exists: boolean;
};

/** Monday 00:00 UTC of the week a date falls in. */
export function weekStartOfDate(d = new Date()): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // getUTCDay: 0 = Sunday. Monday is the start, so Sunday is 6 days in.
  const shift = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - shift);
  return x;
}

/** The key an allocation is stored under. Same format the weekly close uses. */
export const weekKeyOf = (d = new Date()): string => weekStartOfDate(d).toISOString().slice(0, 10);

/**
 * How many days of this week are left, including today.
 *
 * 7 on Monday, 1 on Sunday. Never 0 — a divisor of zero on the last day would
 * hand one gamer the entire remaining allocation.
 */
export function daysLeftInWeek(now = new Date()): number {
  const start = weekStartOfDate(now);
  const elapsed = Math.floor((now.getTime() - start.getTime()) / 86400_000);
  return Math.max(1, 7 - Math.min(6, Math.max(0, elapsed)));
}

/** Read one allocation. Absent means nothing was released — which is zero, not "all of it". */
export async function allocationFor(
  db: DB, vault: AllocatedVault, week = weekKeyOf(),
): Promise<Allocation> {
  const empty: Allocation = { week, vault, amount: 0, locked: false, note: null, exists: false };
  try {
    const [row] = await db.select().from(schema.weekAllocations)
      .where(and(eq(schema.weekAllocations.week, week), eq(schema.weekAllocations.vault, vault)))
      .limit(1);
    if (!row) return empty;
    return {
      week, vault,
      amount: Number(row.amount ?? 0),
      locked: !!row.lockedAt,
      note: row.note ?? null,
      exists: true,
    };
  } catch {
    // No table yet reads as "nothing released", which is the safe direction:
    // nothing is spent rather than everything being available.
    return empty;
  }
}

export type SetResult = { ok: true; amount: number } | { ok: false; error: string };

/**
 * Release an amount for a week.
 *
 * Refuses to LOWER a locked allocation, and says why. That refusal is the whole
 * integrity of the number — see the header.
 */
export async function setAllocation(
  db: DB,
  opts: { vault: AllocatedVault; week?: string; amount: number; actorId: string; note?: string },
): Promise<SetResult> {
  const week = opts.week ?? weekKeyOf();
  const amount = Math.round(Number(opts.amount) * 100) / 100;
  // `Number.isFinite`, not `|| 0`: releasing ZERO is a real instruction — it is
  // how a week is paused without deleting anything — and a falsy check would
  // silently turn it into "unset".
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Release 0 or more." };

  const current = await allocationFor(db, opts.vault, week);

  // Never more than the vault holds. Releasing money that has not arrived is
  // how a pool gets promised and then cannot be paid.
  const bank = (await balances(db))[opts.vault];
  if (amount > bank + 0.005) {
    return {
      ok: false,
      error: `The ${opts.vault} vault holds ${bank.toLocaleString("en-US", { style: "currency", currency: "USD" })}. `
        + "You cannot release money that has not arrived — a pool promised out of an empty vault is one somebody has already been shown.",
    };
  }

  if (current.locked && amount < current.amount) {
    return {
      ok: false,
      error: `This week is locked at ${current.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} and can only go up. `
        + "Gamers have been shown a daily ceiling computed from it and servers have been shown a pool — lowering it now takes back something people were told they had.",
    };
  }

  try {
    await db.insert(schema.weekAllocations).values({
      id: uid(), week, vault: opts.vault, amount,
      actorId: opts.actorId, note: opts.note ?? null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [schema.weekAllocations.week, schema.weekAllocations.vault],
      set: { amount, actorId: opts.actorId, note: opts.note ?? null, updatedAt: new Date() },
    });
    return { ok: true, amount };
  } catch {
    return { ok: false, error: "Could not save that. Nothing changed." };
  }
}

/** Lock a week, so its allocation can only go up from here. Idempotent. */
export async function lockWeek(db: DB, vault: AllocatedVault, week = weekKeyOf()): Promise<void> {
  try {
    await db.update(schema.weekAllocations).set({ lockedAt: new Date() })
      .where(and(
        eq(schema.weekAllocations.week, week),
        eq(schema.weekAllocations.vault, vault),
      ));
  } catch { /* nothing released yet; there is nothing to lock */ }
}

export type WeekBudget = {
  week: string;
  vault: AllocatedVault;
  /** Released for this week. */
  allocated: number;
  /** Gone out of it so far. */
  spent: number;
  /** What is left to spend. Never negative. */
  remaining: number;
  /** In the vault and NOT released. Ours; never shown to a server owner. */
  reserve: number;
  locked: boolean;
  /** False when nobody has released a budget for this week. See `Allocation`. */
  exists: boolean;
};

/**
 * The week's budget, spent and remaining.
 *
 * `spent` is counted from the LEDGER, from the start of the week — not from a
 * running total somebody increments. A counter can drift from the rows; a query
 * over the rows cannot.
 */
export async function weekBudget(
  db: DB, vault: AllocatedVault, now = new Date(),
): Promise<WeekBudget> {
  const week = weekKeyOf(now);
  const [alloc, bank] = await Promise.all([allocationFor(db, vault, week), balances(db)]);
  const since = weekStartOfDate(now);
  // Only the CP vault has a per-credit outflow today. The server pool leaves in
  // one lump at the weekly close, and that is read where the close reads it.
  const spent = vault === "cp" ? await cpSpentSince(db, since) : 0;
  return {
    week, vault,
    allocated: alloc.amount,
    spent: Math.round(spent * 100) / 100,
    remaining: Math.max(0, Math.round((alloc.amount - spent) * 100) / 100),
    reserve: Math.max(0, Math.round((bank[vault] - alloc.amount) * 100) / 100),
    locked: alloc.locked,
    exists: alloc.exists,
  };
}
