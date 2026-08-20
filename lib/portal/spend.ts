// Request → approve. The one gap between an administrator and the owner's money.
//
// ===== 12 §6, THE TWO ROWS THAT ARE NOT SHARED =====
//
// | Action | Guild owner | Administrator / mapped role |
// |---|---|---|
// | **Request** a community challenge | ✅ | ✅ |
// | **Approve** a community-challenge spend | ✅ | ❌ |
// | **Withdraw** | ✅ | ❌ |
//
// P1 — **only the Discord guild owner touches money. One person.** An
// administrator can build the whole thing, name it, pick the tier and the day,
// and cannot spend a cent of the balance. That is not a UI state; it is two
// functions with two different gates, and `approveSpend` re-derives the
// access rather than trusting what the caller says it is.
//
// P5 — a **13–17 owner may approve.** Exposure now, cash at 18. Age is checked
// at withdrawal and nowhere else, and collapsing the two questions is the
// mutation the test plan asks the band to catch.

import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import {
  identityOf,
  mayApproveSpend,
  mayRequestSpend,
  type GuildAccess,
} from "./permissions.ts";
import type { CommunityTier } from "../money/amounts.ts";

export class SpendRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendRefused";
  }
}

export type CommunityRequestPayload = {
  title: string;
  game: string;
  provider: string;
  startAt: string;
  cadence?: "weekly" | "daily";
};

/**
 * An administrator asks.
 *
 * Nothing is billed and nothing is built. What exists afterwards is a row the
 * owner can see and answer — which is the entire point of the state: 07's
 * *"there is nowhere else to hold a pending request."*
 */
export async function requestCommunitySpend(
  db: DB,
  input: {
    guildId: string;
    access: GuildAccess;
    tier: CommunityTier;
    payload: CommunityRequestPayload;
  },
  now = new Date(),
): Promise<string> {
  if (!mayRequestSpend(input.access)) {
    throw new SpendRefused(
      "You need to be signed in with a Discord account that admins this " +
        "server to request a community challenge.",
    );
  }

  const requestedBy = identityOf(input.access);
  if (!requestedBy) throw new SpendRefused("We could not tell who is asking.");

  const id = uid();
  await db.insert(schema.spendRequests).values({
    id,
    guildId: input.guildId,
    requestedBy,
    kind: "community_challenge",
    tier: input.tier,
    payload: input.payload,
    state: "pending",
    createdAt: now,
  });
  return id;
}

/**
 * The guild owner answers.
 *
 * ===== THE ACCESS IS RE-DERIVED, NOT TAKEN ON TRUST =====
 *
 * `access` is passed in because the caller has already resolved it from the
 * request, and re-resolving it here would need `next/headers` and make this
 * unassertable. What is **not** taken on trust is the identity written into
 * `approvedBy`: it comes from the access shape, never from an argument, so
 * there is no parameter an administrator's form could set to name the owner.
 *
 * On approval the challenge is built and billed. Building it earlier would put
 * a bill on the guild before the owner said yes, and `07`'s C3 makes every
 * challenge past `draft` carry an invoice — so the draft *is* the commitment.
 */
export async function approveCommunitySpend(
  db: DB,
  input: { requestId: string; access: GuildAccess },
  now = new Date(),
): Promise<{ challengeId: string; invoiceId: string; priceCents: number }> {
  if (!mayApproveSpend(input.access)) {
    throw new SpendRefused(
      "Only the Discord server owner can approve a spend. You can request " +
        "one and they will see it waiting — everything else on this portal is " +
        "yours to use.",
    );
  }

  const [request] = await db
    .select()
    .from(schema.spendRequests)
    .where(eq(schema.spendRequests.id, input.requestId));
  if (!request) throw new SpendRefused("That request does not exist.");
  if (request.state !== "pending") {
    // Not an error state to hide: two owners on one screen is a real thing,
    // and "somebody already answered this" is the useful sentence.
    throw new SpendRefused(
      `That request was already ${request.state}. Nothing was spent twice.`,
    );
  }

  const { buildCommunityChallenge } = await import("./owner.ts");
  const payload = request.payload as unknown as CommunityRequestPayload;
  const built = await buildCommunityChallenge(db, {
    guildId: request.guildId,
    title: payload.title,
    game: payload.game,
    provider: payload.provider,
    tier: (request.tier ?? 1) as CommunityTier,
    startAt: new Date(payload.startAt),
    cadence: payload.cadence,
  });

  await db
    .update(schema.spendRequests)
    .set({
      state: "approved",
      approvedBy: identityOf(input.access),
      approvedAt: now,
      challengeId: built.challengeId,
    })
    .where(eq(schema.spendRequests.id, input.requestId));

  return built;
}

/**
 * The owner says no.
 *
 * Rejecting is the owner's too. An administrator who could reject could bury
 * another administrator's request, which is a smaller version of the same
 * authority.
 */
export async function rejectCommunitySpend(
  db: DB,
  input: { requestId: string; access: GuildAccess; reason?: string },
  now = new Date(),
): Promise<void> {
  if (!mayApproveSpend(input.access)) {
    throw new SpendRefused("Only the Discord server owner can answer a spend request.");
  }
  const [request] = await db
    .select()
    .from(schema.spendRequests)
    .where(eq(schema.spendRequests.id, input.requestId));
  if (!request) throw new SpendRefused("That request does not exist.");
  if (request.state !== "pending") {
    throw new SpendRefused(`That request was already ${request.state}.`);
  }

  await db
    .update(schema.spendRequests)
    .set({
      state: "rejected",
      approvedBy: identityOf(input.access),
      approvedAt: now,
      rejectedReason: input.reason ?? null,
    })
    .where(eq(schema.spendRequests.id, input.requestId));
}

/** What is waiting for the owner. Shown on the portal and on the guild registry. */
export async function pendingSpendRequests(db: DB, guildId: string) {
  return db
    .select()
    .from(schema.spendRequests)
    .where(
      and(
        eq(schema.spendRequests.guildId, guildId),
        eq(schema.spendRequests.state, "pending"),
      ),
    )
    .orderBy(desc(schema.spendRequests.createdAt));
}

