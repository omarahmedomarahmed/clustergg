// Owner payouts. They open as drafts, and a human releases them.
//
// A3, and docs/02-MONEY.md §4: **the weekly close computes; a human
// releases.** A job that moved money on its own is one nobody could stop on a
// Sunday — and the whole weekend routine exists because a person is meant to
// be looking at these numbers before they leave.
//
// A4 — a payout's total is its lines: the flat share and the scored share,
// separately, so an owner asking "why this number" gets an answer rather than
// a total.

import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { balanceOf, post } from "./ledger.ts";
import { formatMoney } from "./amounts.ts";

export type PayoutStatus = "draft" | "released" | "paid" | "cancelled";

export type PayoutLineInput = {
  kind: "flat" | "scored";
  description: string;
  amountCents: number;
};

/**
 * Open a draft payout for a server for a week. Idempotent per (guild, week).
 *
 * Re-running the weekly close must not create a second payout — the close is
 * exactly the kind of job that gets run twice while somebody works out why the
 * first run looked wrong.
 */
export async function draftPayout(
  db: DB,
  input: { guildId: string; weekStart: Date; lines: PayoutLineInput[] },
): Promise<string> {
  const { withTx } = await import("../db/tx.ts");
  return withTx(db, async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.serverPayouts)
      .where(
        and(
          eq(schema.serverPayouts.guildId, input.guildId),
          eq(schema.serverPayouts.weekStart, input.weekStart),
        ),
      );

    if (existing) {
      // A released or paid payout is a decision a human made. Recomputing over
      // the top of it would silently change a number somebody signed off.
      if (existing.status !== "draft") return existing.id;
      await tx.delete(schema.payoutLines).where(eq(schema.payoutLines.payoutId, existing.id));
      await tx.insert(schema.payoutLines).values(
        input.lines.map((l) => ({ id: uid(), payoutId: existing.id, ...l })),
      );
      return existing.id;
    }

    const id = uid();
    await tx.insert(schema.serverPayouts).values({
      id,
      guildId: input.guildId,
      weekStart: input.weekStart,
      status: "draft",
    });
    if (input.lines.length > 0) {
      await tx.insert(schema.payoutLines).values(
        input.lines.map((l) => ({ id: uid(), payoutId: id, ...l })),
      );
    }
    return id;
  });
}

/** A4 — the total is the lines, recomputed. */
export async function payoutTotal(db: DB, payoutId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.payoutLines.amountCents}), 0)::int` })
    .from(schema.payoutLines)
    .where(eq(schema.payoutLines.payoutId, payoutId));
  return row?.total ?? 0;
}

export class PayoutNotReleasable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutNotReleasable";
  }
}

/**
 * Release a payout. **The only thing that moves money out of vault 3**, and it
 * requires an actor.
 *
 * `actorId` is required rather than optional, and that is the enforcement: a
 * cron job has no actor, so a cron job cannot call this. The rule "a job never
 * moves money" is expressed as a signature that a job cannot satisfy rather
 * than as a comment asking it not to.
 */
export async function releasePayout(
  db: DB,
  payoutId: string,
  actorId: string,
): Promise<{ amountCents: number }> {
  if (!actorId) {
    throw new PayoutNotReleasable(
      "Releasing money requires a person. A job computes; a human releases.",
    );
  }
  const { withTx } = await import("../db/tx.ts");
  return withTx(db, async (tx) => {
    const [payout] = await tx
      .select()
      .from(schema.serverPayouts)
      .where(eq(schema.serverPayouts.id, payoutId));
    if (!payout) throw new PayoutNotReleasable(`No such payout: ${payoutId}`);
    if (payout.status !== "draft") {
      throw new PayoutNotReleasable(
        `That payout is already ${payout.status}. Releasing twice would pay twice.`,
      );
    }

    const amountCents = await payoutTotal(tx, payoutId);
    if (amountCents <= 0) {
      throw new PayoutNotReleasable("A payout of nothing is not a payout.");
    }

    const vault = await balanceOf(tx, "server");
    if (amountCents > vault) {
      throw new PayoutNotReleasable(
        `The server vault holds ${formatMoney(vault)} and this payout is ` +
          `${formatMoney(amountCents)}. Money that is not there cannot be released.`,
      );
    }

    await tx
      .update(schema.serverPayouts)
      .set({ status: "released", releasedAt: new Date(), releasedBy: actorId })
      .where(eq(schema.serverPayouts.id, payoutId));

    await post(
      db,
      [
        {
          vault: "server",
          amount: -amountCents,
          kind: "payout",
          refType: "payout",
          refId: payoutId,
          reason: `Payout released to ${payout.guildId} for week of ${payout.weekStart
            .toISOString()
            .slice(0, 10)}`,
          actorId,
        },
      ],
      { tx },
    );

    return { amountCents };
  });
}

export async function markPayoutPaid(db: DB, payoutId: string, actorId: string): Promise<void> {
  const [payout] = await db
    .select()
    .from(schema.serverPayouts)
    .where(eq(schema.serverPayouts.id, payoutId));
  if (!payout) throw new PayoutNotReleasable(`No such payout: ${payoutId}`);
  if (payout.status !== "released") {
    throw new PayoutNotReleasable(
      `Only a released payout can be marked paid; that one is ${payout.status}.`,
    );
  }
  await db
    .update(schema.serverPayouts)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(schema.serverPayouts.id, payoutId));
  void actorId;
}
