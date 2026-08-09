// This week's pool, while it is still running. B99.
//
// ===== WHY A PUBLIC PAGE AT ALL =====
//
// A server owner's income is a number computed on a Monday out of terms nobody
// outside the code has ever seen. That is not a deal, it is an allowance. The
// pool page is the argument that it IS a deal: here is the money, here is who
// is competing for it, here is what each of them has done, and here is what
// each would be paid if the week ended now.
//
// It is public rather than owner-only on purpose. A network whose payout table
// is visible to everybody is one an owner can check before installing, and the
// only reason to hide it would be that it does not survive being looked at.
//
// ===== WHAT IT IS NOT =====
//
// Not a promise, and the page says so in those words. Entrants are still
// arriving and the pool can be topped up before Sunday, so today's share is
// today's share. What is guaranteed is the METHOD, not the figure — which is
// why this file computes nothing of its own and calls `standingFor`, the same
// function that writes the cheques.

import type { DB } from "@/lib/db";
import { balances } from "@/lib/vaults";
import { allocationFor, weekKeyOf, weekStartOfDate, daysLeftInWeek } from "@/lib/allocations";
import { standingFor, type Standing } from "@/lib/week-standing";

export type LivePool = {
  /** The Monday that names this week. */
  week: string;
  /** Released for the week so far. */
  pool: number;
  /**
   * In the vault and NOT released.
   *
   * Shown as a single number with no breakdown, and deliberately: it is what
   * pays owners through a week when nothing sold, and an owner who can see it
   * exists has a reason to believe the pool will still be there in January.
   * What it is NOT is a figure anybody is owed.
   */
  reserve: number;
  /** Nobody has released a budget for this week yet. */
  allocated: boolean;
  daysLeft: number;
  standing: Standing;
};

export async function livePool(db: DB, now = new Date()): Promise<LivePool> {
  const week = weekKeyOf(now);
  const weekStart = weekStartOfDate(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000);

  const [alloc, bank] = await Promise.all([allocationFor(db, "server", week), balances(db)]);

  // BOUNDED BY THE VAULT, exactly as the close bounds it. An allocation is a
  // release against money that has arrived; showing a pool larger than the
  // vault would advertise money that cannot be paid.
  const pool = Math.max(0, Math.round(Math.min(alloc.amount, bank.server) * 100) / 100);

  const standing = await standingFor(db, { weekStart, weekEnd, pool });

  return {
    week,
    pool,
    reserve: Math.max(0, Math.round((bank.server - pool) * 100) / 100),
    allocated: alloc.exists,
    daysLeft: daysLeftInWeek(now),
    standing,
  };
}
