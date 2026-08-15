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
import { weekFor } from "../challenges/week.ts";
import { poolDivisionFor, percentileRank } from "../pool/score.ts";
import { createChallenge, attachInvoice, markScheduled } from "../challenges/lifecycle.ts";
import { createInvoice, markPaid } from "../money/invoices.ts";
import {
  COMMUNITY_TIERS,
  communityPriceCents,
  formatMoney,
  KPI_WEIGHTS,
  type CommunityTier,
} from "../money/amounts.ts";

// ===== THE OWNER PORTAL KEY IS DELETED (S1) =====
//
// `issueOwnerKey` and `ownerByKey` used to live here. The credential is gone
// entirely, not deprecated: a portal is opened by a linked Discord identity
// that Discord says admins the guild, and by nothing else. Deleting the
// functions as well as the column matters — a key issuer with no column is one
// migration away from working again.

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

export type OwnerStanding = {
  /** 1 is first. Null when this server is not in the run at all. */
  position: number | null;
  /** How many servers are in the run. The denominator of the position. */
  of: number;
  score: number;
  /** Each KPI, its percentile rank, and its weight — so the page can say why. */
  kpis: { key: "entrants" | "conversion" | "activation"; value: number; rank: number; weight: number }[];
  /**
   * What would move it: the weakest KPI by rank, named, with what it means.
   *
   * ===== ONE SENTENCE, AND IT IS NOT "TRY HARDER" =====
   *
   * The standings page exists so an owner can act. A position with no lever is
   * a scoreboard, and a scoreboard is what the old model had. So the weakest
   * rank is picked here rather than in the page, because the bot's standings
   * card renders the same object and the two must not advise differently.
   */
  lever: string | null;
  /** K7 — dropped is not last place, and the page must not draw it as one. */
  droppedReason: string | null;
};

const KPI_MEANING: Record<"entrants" | "conversion" | "activation", string> = {
  entrants:
    "Entrants is volume — every member who joins a challenge from your server. " +
    "A gamer who is in two servers is worth half to each.",
  conversion:
    "Conversion is entrants ÷ linked members. Getting the members you already " +
    "have to link an account moves this more than recruiting does.",
  activation:
    "Activation is the share of your entrants who actually scored. A member " +
    "who joins and never plays lowers it.",
};

/**
 * Where this server stands this week, and the one thing that would move it.
 *
 * Computed from `poolDivisionFor` — the same call the public pool page, the
 * bot's card and Friday's close make. Ranking here rather than in the page is
 * house rule 2 applied to a position rather than to money: two surfaces that
 * each sort the shares themselves are two surfaces that can disagree about who
 * is third.
 */
export async function ownerStanding(
  db: DB,
  guildId: string,
  now = new Date(),
): Promise<OwnerStanding> {
  const week = weekFor(now);
  const division = await poolDivisionFor(db, week.start, now);
  const dropped = division.dropped.find((d) => d.guildId === guildId) ?? null;

  const ordered = [...division.shares].sort((a, b) => b.score - a.score);
  const index = ordered.findIndex((s) => s.guildId === guildId);
  const share = index >= 0 ? ordered[index] : null;

  if (!share) {
    return {
      position: null,
      of: ordered.length,
      score: 0,
      kpis: [],
      lever: null,
      droppedReason: dropped?.reason ?? null,
    };
  }

  // The rank of each KPI across the run, which is what the score is actually
  // built from — an absolute conversion rate says nothing without the field.
  const rankOf = (values: number[], value: number) =>
    percentileRank([...values, value]).at(-1) ?? 0;
  const kpis = ([
    ["entrants", share.entrants, KPI_WEIGHTS.entrants],
    ["conversion", share.conversion, KPI_WEIGHTS.conversion],
    ["activation", share.activation, KPI_WEIGHTS.activation],
  ] as const).map(([key, value, weight]) => ({
    key,
    value,
    rank: rankOf(
      ordered.map((s) => s[key]),
      value,
    ),
    weight,
  }));

  const weakest = [...kpis].sort((a, b) => a.rank - b.rank)[0];

  return {
    position: index + 1,
    of: ordered.length,
    score: share.score,
    kpis,
    lever: weakest ? KPI_MEANING[weakest.key] : null,
    droppedReason: dropped?.reason ?? null,
  };
}

/**
 * How an owner wants to be paid.
 *
 * ===== HOUSE RULE 5 LIVES HERE, NOT IN THE FORM =====
 *
 * A word from a fixed list and an opaque handle from the provider. The list is
 * closed so that "bank" cannot quietly become a free-text field somebody types
 * an IBAN into, and the handle is length-capped and rejected if it looks like
 * an account: a rule enforced only by a form's `maxlength` is a rule until
 * somebody posts to the endpoint directly.
 */
export const PAYOUT_PREFERENCES = ["bank", "paypal", "giftcard"] as const;
export type PayoutPreference = (typeof PAYOUT_PREFERENCES)[number];

/**
 * Does this look like an account, a card or an IBAN?
 *
 * ===== COUNT THE DIGITS, DO NOT MEASURE THE RUN =====
 *
 * The first version of this was `/\d[\d\s-]{10,}/` — a run of digits, spaces
 * and hyphens at least eleven characters long. It let
 * `"sort 20-00-00 acct 55779911"` straight through, because the word in the
 * middle breaks the run into two short ones. A UK bank account is a six-digit
 * sort code and an **eight**-digit number, and people write them with the
 * words in between, which is the single most likely thing to be typed into a
 * field labelled "how you want to be paid".
 *
 * So: split on anything that is not a digit, space or hyphen, and refuse if
 * any resulting group carries eight or more digits. Eight because that is the
 * shortest real account number; an opaque provider reference like
 * `acct_1QxZr9` has one or two.
 */
function accountShaped(handle: string): boolean {
  return handle
    .split(/[^\d\s-]+/)
    .some((group) => (group.match(/\d/g) ?? []).length >= 8);
}

export async function setPayoutPreference(
  db: DB,
  guildId: string,
  input: { preference: string; handle?: string | null },
): Promise<void> {
  if (!(PAYOUT_PREFERENCES as readonly string[]).includes(input.preference)) {
    throw new CommunityBuilderRefused(
      `${input.preference} is not one of the ways we pay. Pick one of: ` +
        `${PAYOUT_PREFERENCES.join(", ")}.`,
    );
  }
  const handle = input.handle?.trim() || null;
  if (handle && accountShaped(handle)) {
    throw new CommunityBuilderRefused(
      "That looks like an account number. We never store one — this field is " +
        "the reference your payment provider gave you, not your details.",
    );
  }
  await db
    .update(schema.guilds)
    .set({ payoutPreference: input.preference, payoutHandle: handle })
    .where(eq(schema.guilds.guildId, guildId));
}

export async function setOwnerContact(
  db: DB,
  guildId: string,
  input: { contactName?: string | null; contactEmail?: string | null; adminRoleId?: string | null },
): Promise<void> {
  // S5 — the role **ID**, never the name. A renamed role must not silently
  // revoke access, and it would if we keyed on what people rename.
  if (input.adminRoleId && !/^\d{5,}$/.test(input.adminRoleId.trim())) {
    throw new CommunityBuilderRefused(
      "That is not a role ID. Turn on Developer Mode in Discord, right-click " +
        "the role and Copy ID — a role name would stop working the moment " +
        "somebody renames it.",
    );
  }
  await db
    .update(schema.guilds)
    .set({
      ...(input.contactName !== undefined ? { contactName: input.contactName?.trim() || null } : {}),
      ...(input.contactEmail !== undefined
        ? { contactEmail: input.contactEmail?.trim() || null }
        : {}),
      ...(input.adminRoleId !== undefined
        ? { adminRoleId: input.adminRoleId?.trim() || null }
        : {}),
    })
    .where(eq(schema.guilds.guildId, guildId));
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
