// Redemption: turning a money-trophy into money.
//
// ===== FOUR CONDITIONS, AND THE FOURTH IS THE ONE THAT MATTERS =====
//
// R1 requires 18+, a verified email, an allowed country, **and a trophy the
// vault accounts for.**
//
// The first three are policy and could be argued about. The fourth is
// structural: V1 says a redeem is *impossible* for a trophy the vault does not
// account for, and impossible is a stronger word than refused. It is what makes
// a duplicate award and a double payout the same kind of error — one that
// cannot reach a payment provider, because the money it would draw on does not
// exist in the ledger.
//
// T1/T2 — **any $0 trophy is unredeemable, enforced at the redeem action, not
// merely hidden in the UI.** A collectable is a collectable however you got to
// the button.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { mayRedeem } from "../identity/age.ts";
import { isCountryAllowed } from "../identity/countries.ts";
import { formatMoney } from "../money/amounts.ts";
import { authSecret } from "../core/secret.ts";

/** R5 — a preference word. Never an instrument. */
export const REDEEM_METHODS = ["bank", "giftcard", "paypal"] as const;
export type RedeemMethod = (typeof REDEEM_METHODS)[number];

export const REDEMPTION_STATES = [
  "pending",
  "approved",
  "sent",
  "paid",
  "cancelled",
  "rejected",
] as const;
export type RedemptionState = (typeof REDEMPTION_STATES)[number];

export class RedemptionRefused extends Error {
  constructor(
    readonly code:
      | "zero_value"
      | "under_18"
      | "email_unverified"
      | "country"
      | "not_yours"
      | "already_redeemed"
      | "unaccounted",
    message: string,
  ) {
    super(message);
    this.name = "RedemptionRefused";
  }
}

// ===== EMAIL VERIFICATION MOVED TO `lib/identity/verify.ts` =====
//
// It is no longer redemption's alone. I7a — the email signup door verifies at
// signup, and **that is the same verification**, never asked twice. Two copies
// would eventually disagree about whether a given gamer had done it.
//
// Re-exported so every existing call site is unchanged.
export {
  beginEmailVerification,
  confirmEmailVerification,
  emailIsVerified,
  looksLikeEmail,
} from "../identity/verify.ts";

/** The old name, kept for the redemption flow that already called it. */
export async function startEmailVerification(
  db: DB,
  userId: string,
  email: string,
): Promise<{ code: string }> {
  const { beginEmailVerification } = await import("../identity/verify.ts");
  return { code: await beginEmailVerification(db, userId, email) };
}

export type Eligibility = { ok: true; amountCents: number } | { ok: false; code: string; reason: string };

/**
 * Whether this gamer may redeem this holding — checked before anything moves.
 *
 * Exposed separately so the profile page can grey a button *and* the action
 * can refuse, from the same function. Two implementations of "may they redeem"
 * is how a UI ends up kinder than the rule, or crueller.
 */
export async function checkEligibility(
  db: DB,
  userTrophyId: string,
  userId: string,
): Promise<Eligibility> {
  const [holding] = await db
    .select({
      holding: schema.userTrophies,
      trophy: schema.trophies,
    })
    .from(schema.userTrophies)
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .where(eq(schema.userTrophies.id, userTrophyId));

  if (!holding) return { ok: false, code: "not_yours", reason: "That trophy does not exist." };
  if (holding.holding.userId !== userId) {
    return { ok: false, code: "not_yours", reason: "That trophy is not yours." };
  }
  if (holding.holding.redeemedAt) {
    return { ok: false, code: "already_redeemed", reason: "You have already cashed that one out." };
  }

  // T1/T2 — at the action, not merely hidden. Checked FIRST, because it is the
  // kindest refusal to hit: it is not about them.
  if (holding.trophy.valueCents === 0) {
    return {
      ok: false,
      code: "zero_value",
      reason:
        "That one is a collectable — it is yours forever, and it was never " +
        "worth money. Nothing to cash out.",
    };
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, code: "not_yours", reason: "That trophy is not yours." };

  // G7/G10 — a teen keeps the trophy and is told when they can have it, rather
  // than being told no.
  if (!mayRedeem(user.ageBand)) {
    return {
      ok: false,
      code: "under_18",
      reason:
        `Your ${formatMoney(holding.trophy.valueCents)} trophy keeps — we hold it ` +
        `for five years. Contact support when you turn 18 and they will move you.`,
    };
  }

  if (!user.emailVerifiedAt) {
    return {
      ok: false,
      code: "email_unverified",
      reason: "Verify an email address first. This is the only time we ask for one.",
    };
  }

  if (!isCountryAllowed(user.country)) {
    return {
      ok: false,
      code: "country",
      reason: "We cannot pay out to that country.",
    };
  }

  return { ok: true, amountCents: holding.trophy.valueCents };
}

/**
 * Request a redemption.
 *
 * The vault check is the point. `assertAccounted` runs inside the transaction
 * and asks the ledger whether this trophy's money is actually there — so a
 * trophy awarded by a bug, or awarded twice, cannot reach a payment provider.
 */
export async function requestRedemption(
  db: DB,
  input: { userTrophyId: string; userId: string; method: RedeemMethod; providerHandle?: string | null },
): Promise<string> {
  const { withTx } = await import("../db/tx.ts");
  const { lockGamer } = await import("../db/tx.ts");

  return withTx(db, async (tx) => {
    // The lock first, before the read whose answer the write depends on. Two
    // redeem requests for the same gamer landing together would otherwise both
    // see an unredeemed trophy.
    await lockGamer(tx, input.userId);

    const eligibility = await checkEligibility(tx, input.userTrophyId, input.userId);
    if (!eligibility.ok) {
      throw new RedemptionRefused(
        eligibility.code as RedemptionRefused["code"],
        eligibility.reason,
      );
    }

    await assertAccounted(tx, input.userTrophyId);

    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, input.userId));
    const id = uid();
    await tx.insert(schema.redemptions).values({
      id,
      userTrophyId: input.userTrophyId,
      userId: input.userId,
      status: "pending",
      method: input.method,
      providerHandle: input.providerHandle ?? null,
      country: user.country ?? "",
      amountCents: eligibility.amountCents,
    });
    return id;
  });
}

/**
 * V1 — a redeem is impossible for a trophy the vault does not account for.
 *
 * "Accounted for" means: the prize vault holds at least as much as the sum of
 * every unredeemed money-trophy including this one. If it does not, something
 * awarded a trophy that no invoice funded, and paying it would take money that
 * belongs to a different gamer's trophy.
 */
export async function assertAccounted(tx: DB, userTrophyId: string): Promise<void> {
  const { checkPrizeVault } = await import("../money/prize-vault.ts");
  const check = await checkPrizeVault(tx);
  if (check.state === "over_allocated") {
    throw new RedemptionRefused(
      "unaccounted",
      "That trophy is not accounted for in the prize vault, so it cannot be " +
        "cashed out. This is a platform fault, not yours — support has been " +
        "alerted and your trophy is safe.",
    );
  }
  void userTrophyId;
}

export async function approveRedemption(db: DB, id: string, actorId: string): Promise<void> {
  await move(db, id, "pending", "approved", { approvedAt: new Date() }, actorId);
}

export async function markSent(db: DB, id: string, actorId: string, providerHandle?: string) {
  await move(
    db,
    id,
    "approved",
    "sent",
    { sentAt: new Date(), ...(providerHandle ? { providerHandle } : {}) },
    actorId,
  );
}

/**
 * Mark paid. **R4 — the prize vault falls by exactly that trophy's value.**
 *
 * This is the only debit the prize vault ever takes for a redemption, and it
 * happens here rather than at request or approval because until the money has
 * actually gone, the liability is still ours.
 */
export async function markRedemptionPaid(db: DB, id: string, actorId: string): Promise<void> {
  const { withTx } = await import("../db/tx.ts");
  const { post } = await import("../money/ledger.ts");

  await withTx(db, async (tx) => {
    const [redemption] = await tx
      .select()
      .from(schema.redemptions)
      .where(eq(schema.redemptions.id, id));
    if (!redemption) throw new Error(`No such redemption: ${id}`);
    if (redemption.status !== "sent") {
      throw new Error(
        `Only a sent redemption can be marked paid; that one is ${redemption.status}.`,
      );
    }

    const now = new Date();
    await tx
      .update(schema.redemptions)
      .set({ status: "paid", paidAt: now })
      .where(eq(schema.redemptions.id, id));

    // The holding is marked redeemed, which removes it from the liability side
    // of the invariant — and the ledger falls by the same amount at the same
    // instant, which keeps both sides equal. Doing one without the other is
    // the only way to break the invariant from inside this module.
    await tx
      .update(schema.userTrophies)
      .set({ redeemedAt: now })
      .where(eq(schema.userTrophies.id, redemption.userTrophyId));

    await post(
      db,
      [
        {
          vault: "prize",
          amount: -redemption.amountCents,
          kind: "redemption",
          refType: "redemption",
          refId: id,
          reason: `${formatMoney(redemption.amountCents)} paid to ${redemption.userId}`,
          actorId,
        },
      ],
      { tx },
    );
  });
}

export async function rejectRedemption(
  db: DB,
  id: string,
  actorId: string,
  reason: string,
): Promise<void> {
  await move(db, id, null, "rejected", { rejectedReason: reason }, actorId);
}

async function move(
  db: DB,
  id: string,
  from: RedemptionState | null,
  to: RedemptionState,
  set: Record<string, unknown>,
  actorId: string,
): Promise<void> {
  if (!actorId) throw new Error("Moving a redemption requires a person.");
  const [redemption] = await db
    .select()
    .from(schema.redemptions)
    .where(eq(schema.redemptions.id, id));
  if (!redemption) throw new Error(`No such redemption: ${id}`);
  if (from && redemption.status !== from) {
    throw new Error(`A ${redemption.status} redemption cannot become ${to}.`);
  }
  await db
    .update(schema.redemptions)
    .set({ status: to, ...set })
    .where(eq(schema.redemptions.id, id));
}

/**
 * R3 — deletion is refused while a redemption is in flight.
 *
 * Money already handed to a provider cannot be paid to a record that no longer
 * exists, and a payment that bounces back to a deleted account is money nobody
 * can return.
 */
export async function redemptionsInFlight(db: DB, userId: string) {
  return db
    .select()
    .from(schema.redemptions)
    .where(
      and(
        eq(schema.redemptions.userId, userId),
        or(
          eq(schema.redemptions.status, "pending"),
          eq(schema.redemptions.status, "approved"),
          eq(schema.redemptions.status, "sent"),
        ),
      ),
    );
}
