// The server-owner portal, and the community-challenge builder.
//
// S7 — **every portal page also exists as an admin bot card.** Owners live in
// Discord. That is why everything here returns data rather than markup: the
// page renders it and the bot's card renders the same object, so the two
// cannot drift into telling an owner different numbers.
//
// S9 — if the bot is removed the portal survives. Nothing here reads Discord;
// the earnings, the pool share and the history are all ours. Only
// re-announcing needs the bot, and that is the one thing that errors.

import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { newPortalKey, hashPortalKey, keyMatches } from "../core/keys.ts";
import { weekFor } from "../challenges/week.ts";
import { poolDivisionFor } from "../pool/score.ts";
import { createChallenge, attachInvoice, markScheduled } from "../challenges/lifecycle.ts";
import { createInvoice, markPaid } from "../money/invoices.ts";
import {
  COMMUNITY_TIERS,
  communityPriceCents,
  formatMoney,
  type CommunityTier,
} from "../money/amounts.ts";

/** Issue a key. Returned once, hashed at rest. */
export async function issueOwnerKey(db: DB, guildId: string): Promise<string> {
  const key = newPortalKey();
  await db
    .update(schema.guilds)
    .set({ portalKeyHash: hashPortalKey(key) })
    .where(eq(schema.guilds.guildId, guildId));
  return key;
}

export async function ownerByKey(db: DB, guildId: string, key: string) {
  const [guild] = await db
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId));
  if (!guild || !keyMatches(guild.portalKeyHash, key)) return null;
  return guild;
}

export type OwnerOverview = {
  guildId: string;
  name: string;
  /** Everything released to this server, ever. Derived from payouts. */
  lifetimeEarnedCents: number;
  /** Released and not yet paid — what they can withdraw. */
  availableCents: number;
  /** What this week would pay if it ended now. */
  thisWeekCents: number;
  kpis: { entrants: number; conversion: number; activation: number } | null;
  /** M12 — which challenges feed this week's pool. */
  thisWeekChallenges: { id: string; title: string; game: string }[];
  /** K7, said to the owner who needs to act on it. */
  notScoredReason: string | null;
};

export async function ownerOverview(
  db: DB,
  guildId: string,
  now = new Date(),
): Promise<OwnerOverview | null> {
  const [guild] = await db
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId));
  if (!guild) return null;

  const week = weekFor(now);
  const division = await poolDivisionFor(db, week.start, now);
  const share = division.shares.find((s) => s.guildId === guildId) ?? null;
  const dropped = division.dropped.find((d) => d.guildId === guildId) ?? null;

  const payouts = await db
    .select()
    .from(schema.serverPayouts)
    .where(eq(schema.serverPayouts.guildId, guildId));

  // Both figures are sums over rows, never a stored balance.
  const totals = await db
    .select({
      payoutId: schema.payoutLines.payoutId,
      total: sql<number>`coalesce(sum(${schema.payoutLines.amountCents}), 0)::int`,
    })
    .from(schema.payoutLines)
    .groupBy(schema.payoutLines.payoutId);
  const totalById = new Map(totals.map((t) => [t.payoutId, t.total]));

  const lifetimeEarnedCents = payouts
    .filter((p) => p.status === "released" || p.status === "paid")
    .reduce((sum, p) => sum + (totalById.get(p.id) ?? 0), 0);
  const availableCents = payouts
    .filter((p) => p.status === "released")
    .reduce((sum, p) => sum + (totalById.get(p.id) ?? 0), 0);

  const challenges =
    division.contributingChallengeIds.length > 0
      ? await db
          .select({
            id: schema.challenges.id,
            title: schema.challenges.title,
            game: schema.challenges.game,
          })
          .from(schema.challenges)
          .where(eq(schema.challenges.startAt, week.start))
      : [];

  return {
    guildId,
    name: guild.name,
    lifetimeEarnedCents,
    availableCents,
    thisWeekCents: share?.totalCents ?? 0,
    kpis: share
      ? { entrants: share.entrants, conversion: share.conversion, activation: share.activation }
      : null,
    thisWeekChallenges: challenges,
    notScoredReason: dropped?.reason ?? null,
  };
}

/** S6 — re-announce one challenge, or all of this week's. */
export async function reAnnounce(
  db: DB,
  guildId: string,
  challengeIds: string[],
): Promise<{ queued: number; error?: string }> {
  const [guild] = await db
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId));
  if (!guild) return { queued: 0, error: "Unknown server." };

  // S9 — the portal survives the bot's removal, and the error says what to do
  // rather than what happened.
  if (guild.removedAt || !guild.announceChannelId) {
    return {
      queued: 0,
      error: "Tell your admin to reinstall Cluster — we cannot post to this server.",
    };
  }

  const { enqueuePosts } = await import("../discord/post-queue.ts");
  const challenges = await db.select().from(schema.challenges);
  const wanted = new Set(challengeIds);
  const targets = challenges
    .filter((c) => wanted.has(c.id))
    .map((c) => ({
      channelId: guild.announceChannelId as string,
      guildId,
      payload: { content: `**${c.title}** — ${c.game}` },
      // A2 in docs/04-SURFACES.md: nothing fans out inline. Even one server
      // goes through the queue, so re-announcing all of this week's is the
      // same code path as one.
    }));

  const result = await enqueuePosts(targets);
  return { queued: result.queued };
}

export class CommunityBuilderRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunityBuilderRefused";
  }
}

/**
 * Build a community challenge.
 *
 * M26 — **no rate limit and no fee.** Owners farming visibility is the growth
 * engine, not an abuse, so there is deliberately no throttle here and adding
 * one later would need a ruling.
 *
 * M22/C1 — the money goes to the prize vault and Cluster only. That is handled
 * by `markPaid`'s `communityTier`, which routes through `communitySplitOf`.
 */
export async function buildCommunityChallenge(
  db: DB,
  input: {
    guildId: string;
    title: string;
    game: string;
    provider: string;
    tier: CommunityTier;
    startAt: Date;
    cadence?: "weekly" | "daily";
  },
): Promise<{ challengeId: string; invoiceId: string; priceCents: number }> {
  const tier = COMMUNITY_TIERS[input.tier];
  if (!tier) {
    throw new CommunityBuilderRefused(
      `There are two tiers. ${String(input.tier)} is not one of them.`,
    );
  }

  const challengeId = await createChallenge(db, {
    title: input.title,
    game: input.game,
    provider: input.provider,
    startAt: input.startAt,
    cadence: input.cadence ?? "weekly",
    visibility: "community",
    guildId: input.guildId,
    prizePoolCents: tier.prizeCents,
    places: tier.winners,
    // M25/C5 — you must join the server to get the key. The challenge IS the
    // server's advertising, and the key is what makes that true.
    accessKey: uid(),
  });

  const priceCents = communityPriceCents(input.tier);
  const invoiceId = await createInvoice(db, {
    payerType: "guild",
    payerId: input.guildId,
    lines: [
      {
        description:
          `Community challenge — ${formatMoney(tier.prizeCents)} prize pool, ` +
          `${tier.winners} winner${tier.winners === 1 ? "" : "s"}`,
        amountCents: priceCents,
        refType: "challenge",
        refId: challengeId,
      },
    ],
  });
  await attachInvoice(db, challengeId, invoiceId);

  return { challengeId, invoiceId, priceCents };
}

/** Pay for a community challenge. Routes owner money to prize + Cluster only. */
export async function payCommunityChallenge(
  db: DB,
  challengeId: string,
  tier: CommunityTier,
): Promise<void> {
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge?.invoiceId) {
    throw new CommunityBuilderRefused("That challenge has no bill.");
  }
  await markPaid(db, challenge.invoiceId, { communityTier: tier });
  await markScheduled(db, challengeId);
}

/** The owner's wallet: every payout, most recent first. */
export async function ownerWallet(db: DB, guildId: string) {
  const payouts = await db
    .select()
    .from(schema.serverPayouts)
    .where(eq(schema.serverPayouts.guildId, guildId))
    .orderBy(desc(schema.serverPayouts.weekStart));

  const lines = await db
    .select()
    .from(schema.payoutLines)
    .where(
      payouts.length
        ? sql`${schema.payoutLines.payoutId} in ${payouts.map((p) => p.id)}`
        : sql`false`,
    );

  return payouts.map((p) => ({
    ...p,
    lines: lines.filter((l) => l.payoutId === p.id),
    totalCents: lines
      .filter((l) => l.payoutId === p.id)
      .reduce((sum, l) => sum + l.amountCents, 0),
  }));
}

/** K7 — describing the community is what gets a server scored at all. */
export async function describeCommunity(
  db: DB,
  guildId: string,
  description: string,
): Promise<void> {
  const text = description.trim();
  if (text.length < 20) {
    throw new CommunityBuilderRefused(
      "Tell us a little more about the community — a sentence at least. This " +
        "is what gets your server into the weekly pool.",
    );
  }
  await db
    .update(schema.guilds)
    .set({ community: text })
    .where(eq(schema.guilds.guildId, guildId));
}

/** Members of this server who have entered something. */
export async function ownerMembers(db: DB, guildId: string) {
  return db
    .select({
      userId: schema.guildMembers.userId,
      displayName: schema.users.displayName,
      slug: schema.users.slug,
    })
    .from(schema.guildMembers)
    .innerJoin(schema.users, eq(schema.guildMembers.userId, schema.users.id))
    .where(and(eq(schema.guildMembers.guildId, guildId), eq(schema.users.status, "active")));
}
