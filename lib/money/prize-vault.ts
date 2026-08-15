// The prize vault, which is a liability ledger.
//
// ===== THE INVARIANT =====
//
//   prizeVault.balance == Σ(value of every unredeemed money-trophy
//                           held by a live account)
//
// docs/02-MONEY.md calls this "the most important accounting rule on the
// platform, and the one most likely to be built wrong". Every trophy worth
// money is backed by real money sitting in vault 2. If every holder redeemed
// in the same instant, we could pay all of them.
//
// ===== WHY IT IS AN INVARIANT AND NOT A GUARD =====
//
// V1: **a redeem is impossible for a trophy the vault does not account for.**
// Not "refused" — impossible. The difference is the whole design:
//
//   * A *guarded* system awards a trophy, then checks at redemption whether
//     there is money for it. A duplicate award passes every check until two
//     people try to cash the same dollar, and by then one of them has been
//     told they won.
//   * An *invariant* system moves money at the moment a trophy is awarded.
//     There is no second copy to award, because the money is the record. A
//     duplicate award fails at award time, when it is a bug, rather than at
//     payout time, when it is a broken promise.
//
// So `awardTrophy` and `payRedemption` both write ledger rows, and `check`
// recomputes both sides from scratch. Nothing here trusts a running total.

import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { balanceOf } from "./ledger.ts";

export type VaultState =
  | "green"
  | "unallocated"
  | "unclaimed"
  | "over_allocated"
  | "orphaned";

export type PrizeVaultCheck = {
  /** `sum(ledger)` for vault 2. */
  balanceCents: number;
  /** Σ unredeemed money-trophies on live accounts — the liability. */
  liabilityCents: number;
  /** Money held for trophies whose holder deleted their account. */
  orphanedCents: number;
  /** balance − liability − orphaned. Zero is green. */
  differenceCents: number;
  state: VaultState;
  holds: boolean;
  /** Said in the words the console shows, so the screen cannot paraphrase it. */
  explanation: string;
};

/**
 * Recompute both sides and compare.
 *
 * This is the check docs/07-DATA-MODEL.md wants running continuously as a live
 * indicator on the admin dashboard, not in a nightly report. A nightly report
 * tells you the promise was broken yesterday.
 */
export async function checkPrizeVault(db: DB): Promise<PrizeVaultCheck> {
  const balanceCents = await balanceOf(db, "prize");

  // The liability: every trophy holding that has not been redeemed, whose
  // holder still exists. A `user_trophy` outlives its holder deliberately (T6)
  // so the money stays accounted for — which is why the join is to a LIVE
  // account and the orphans are counted separately rather than dropped.
  const [live] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.trophies.valueCents}), 0)::int` })
    .from(schema.userTrophies)
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .innerJoin(schema.users, eq(schema.userTrophies.userId, schema.users.id))
    .where(
      and(
        isNull(schema.userTrophies.redeemedAt),
        isNull(schema.userTrophies.sweptAt),
        eq(schema.users.status, "active"),
      ),
    );

  const [orphans] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.trophies.valueCents}), 0)::int` })
    .from(schema.userTrophies)
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .leftJoin(schema.users, eq(schema.userTrophies.userId, schema.users.id))
    .where(
      and(
        isNull(schema.userTrophies.redeemedAt),
        isNull(schema.userTrophies.sweptAt),
        sql`(${schema.users.id} is null or ${schema.users.status} <> 'active')`,
      ),
    );

  const liabilityCents = live?.total ?? 0;
  const orphanedCents = orphans?.total ?? 0;
  const differenceCents = balanceCents - liabilityCents - orphanedCents;

  const state = classify({ balanceCents, liabilityCents, orphanedCents, differenceCents });
  return {
    balanceCents,
    liabilityCents,
    orphanedCents,
    differenceCents,
    state,
    holds: differenceCents === 0 && state !== "over_allocated",
    explanation: EXPLANATION[state],
  };
}

/**
 * The five states, in the order they must be tested.
 *
 * Over-allocation is checked first because it is the only one that is a
 * failure rather than a phase. The vault cycling amber → amber → green with
 * every challenge is normal, and the console should read as a rhythm rather
 * than an alarm — but trophies worth more than the vault holds is a promise we
 * cannot keep, and it must never be reported as merely "unclaimed".
 */
function classify(c: {
  balanceCents: number;
  liabilityCents: number;
  orphanedCents: number;
  differenceCents: number;
}): VaultState {
  if (c.differenceCents < 0) return "over_allocated";
  if (c.orphanedCents > 0) return "orphaned";
  if (c.differenceCents > 0) {
    return c.liabilityCents === 0 ? "unallocated" : "unclaimed";
  }
  return "green";
}

const EXPLANATION: Record<VaultState, string> = {
  green: "Every dollar in the prize vault sits on a gamer's profile.",
  unallocated: "Money is in, and not yet promised to any trophy.",
  unclaimed: "Trophies are assigned to a challenge that has not ended yet.",
  over_allocated:
    "Trophies are worth more than the prize vault holds. This must be " +
    "impossible — it is guarded at assignment — so something has written to " +
    "the vault outside the ledger.",
  orphaned:
    "A holder deleted their account. The money is real and can never be " +
    "claimed; sweep it to Cluster so the balance equals live liability again.",
};

export class OverAllocationError extends Error {
  constructor(readonly shortfallCents: number) {
    super(
      "That award would promise more money than the prize vault holds. " +
        "Every money-trophy is backed by real money, so this is refused " +
        "rather than recorded.",
    );
    this.name = "OverAllocationError";
  }
}

/**
 * The reason the invariant cannot be broken by an award.
 *
 * Checked inside the caller's transaction, after the row lock, so two
 * concurrent awards cannot both read the same headroom and both take it. That
 * is not theoretical: it is the exact defect `lib/db/tx.ts` exists to fix,
 * and the comment at the top of that file is the story of it happening.
 */
export async function assertHeadroom(tx: DB, addingCents: number): Promise<void> {
  if (addingCents <= 0) return;
  const check = await checkPrizeVault(tx);
  if (check.differenceCents < addingCents) {
    throw new OverAllocationError(addingCents - check.differenceCents);
  }
}
