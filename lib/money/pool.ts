// Vault 3 → the weekly pool, and the half rule.
//
// Vault 3 accumulates 25% of everything sold. It does **not** flow
// automatically into the weekly pool: allocation is a deliberate admin action,
// every week (M8, A7).
//
// ===== THE HALF RULE, AND WHY IT IS NOT CAUTION =====
//
//   pool ≤ vault ÷ 2, always.
//
// Money arrives for challenges that have not run yet. If a week's income were
// allocated in full, one strong sales week would empty the vault into one pool
// and the next quiet week would pay nobody — and, worse, there would be
// nothing left to claw a refund back from. docs/02-MONEY.md §7 is explicit:
// when a brand pulls out after a pool has already been paid, the clawback
// comes from the held half. **The half rule is the refund mechanism**, not a
// safety margin.
//
// A2 — an allocation can be **raised, never lowered.** A server owner who saw
// "$21 so far" on Wednesday and $14 on Friday has been told a lie, and it does
// not matter which number was right.

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { balanceOf, post } from "./ledger.ts";
import { POOL_MAX_FRACTION_OF_VAULT, formatMoney } from "./amounts.ts";

export class PoolAllocationRefused extends Error {
  constructor(
    readonly requestedCents: number,
    readonly vaultCents: number,
    readonly maxCents: number,
  ) {
    super(
      `A weekly pool may never exceed half the server vault. The vault holds ` +
        `${formatMoney(vaultCents)}, so the most that can be allocated is ` +
        `${formatMoney(maxCents)} — ${formatMoney(requestedCents)} was asked ` +
        `for. The held half funds refunds, disputes and quiet weeks.`,
    );
    this.name = "PoolAllocationRefused";
  }
}

export class PoolAllocationLowered extends Error {
  constructor(readonly fromCents: number, readonly toCents: number) {
    super(
      `A pool allocation can be raised but never lowered — it is already ` +
        `${formatMoney(fromCents)} and owners have been shown that number. ` +
        `${formatMoney(toCents)} would take it back.`,
    );
    this.name = "PoolAllocationLowered";
  }
}

/** The ceiling, so the admin screen and the guard read the same number. */
export function maxAllocationCents(serverVaultCents: number): number {
  return Math.floor(serverVaultCents * POOL_MAX_FRACTION_OF_VAULT);
}

/**
 * Allocate into a week's pool. Refused above half the vault, with the reason.
 *
 * The vault balance is read **inside the transaction**, after the write lock
 * that the unique index on `week_start` gives us, so two admins allocating at
 * once cannot both see the same headroom and both take it.
 */
export async function allocateToPool(
  db: DB,
  input: { weekStart: Date; amountCents: number; actorId?: string | null },
): Promise<{ allocatedCents: number; vaultCents: number; maxCents: number }> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("A pool allocation is a positive whole number of cents.");
  }

  const { withTx } = await import("../db/tx.ts");
  return withTx(db, async (tx) => {
    const vaultCents = await balanceOf(tx, "server");
    const maxCents = maxAllocationCents(vaultCents);

    const [existing] = await tx
      .select()
      .from(schema.poolAllocations)
      .where(eq(schema.poolAllocations.weekStart, input.weekStart));

    // The ceiling applies to the TOTAL in the pool, not to each increment.
    // Otherwise "allocate half, twice" walks straight through the rule.
    if (input.amountCents > maxCents) {
      throw new PoolAllocationRefused(input.amountCents, vaultCents, maxCents);
    }
    if (existing && input.amountCents < existing.amountCents) {
      throw new PoolAllocationLowered(existing.amountCents, input.amountCents);
    }

    const delta = input.amountCents - (existing?.amountCents ?? 0);

    if (existing) {
      await tx
        .update(schema.poolAllocations)
        .set({ amountCents: input.amountCents, actorId: input.actorId ?? null })
        .where(eq(schema.poolAllocations.id, existing.id));
    } else {
      await tx.insert(schema.poolAllocations).values({
        id: uid(),
        weekStart: input.weekStart,
        amountCents: input.amountCents,
        actorId: input.actorId ?? null,
      });
    }

    // The money does not leave vault 3 here. An allocation earmarks; a
    // released payout moves. Posting the debit now would let a pool that is
    // never released quietly shrink the vault, and the next week's ceiling
    // would be computed from a balance that is missing money nobody spent.
    if (delta !== 0) {
      await post(
        db,
        [
          {
            vault: "server",
            amount: 0,
            kind: "pool_allocation",
            refType: "pool",
            refId: input.weekStart.toISOString(),
            reason:
              `Week of ${input.weekStart.toISOString().slice(0, 10)}: pool ` +
              `set to ${formatMoney(input.amountCents)} of a ` +
              `${formatMoney(vaultCents)} vault`,
            actorId: input.actorId ?? null,
          },
        ],
        { tx },
      );
    }

    return { allocatedCents: input.amountCents, vaultCents, maxCents };
  });
}

export async function poolForWeek(db: DB, weekStart: Date): Promise<number> {
  const [row] = await db
    .select()
    .from(schema.poolAllocations)
    .where(eq(schema.poolAllocations.weekStart, weekStart));
  return row?.amountCents ?? 0;
}
