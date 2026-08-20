// The four moments a guild owner is owed a DM.
//
// ===== WHY A DM AND NOT AN EMAIL =====
//
// `12-IDENTITY` §6 and `15-DELIVERY` §2. Discord **never gives us a guild
// owner's address**. Until they sign in on the web there is no email to send
// to, so a DM is not a nicer channel than an email — it is the only channel
// there is. `dmUser` was written, correct, and called by nothing, which meant a
// guild owner was never told Cluster was on their server and never told they
// had money waiting.
//
// Four moments, and every one of them is about money or about losing it:
//
//   L6  on install         — Cluster is here, admins can spend your earnings,
//                            only you can approve
//   L7  at every close     — what your server earned
//   L8  on transfer        — the 14-day timeout starts from a message that was
//                            actually sent
//   L9  before reassigning — *"reassigning somebody who was never told is
//                            indistinguishable from taking their money"*
//
// ===== EVERY ONE GOES THROUGH THE QUEUE (L11) =====
//
// Never inline. A per-guild loop inside a request is in `10-SETUP` §8's outage
// table already, and the week close would run one per server. Enqueuing is a
// row; the cron drains it with the same backoff, the same give-up budget and
// the same failure recording as an announcement — and the drain is where L10's
// state is written, because the drain is where the outcome is known.
//
// Nothing here throws. L5 again: the close writes the payouts and *then* tells
// people, and a DM that cannot be queued must not unwind a week.

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { formatMoney } from "../money/amounts.ts";
import { siteUrl } from "../discord/config.ts";
import { enqueuePosts } from "../discord/post-queue.ts";

export const DM_KINDS = [
  "guild_installed",
  "owner_earnings",
  "ownership_transfer",
  "reassignment_warning",
] as const;
export type DmKind = (typeof DM_KINDS)[number];

/**
 * Queue one DM. Fenced, and returns whether a row was written.
 *
 * "Queued" is not "delivered" and this deliberately cannot tell you which —
 * the answer lands in `deliveries` when the cron drains it. A function that
 * reported success here would be reporting that we intend to send something,
 * which is the exact claim the old delivery ledger made and could not keep.
 */
async function queueDm(input: {
  discordId: string;
  guildId: string | null;
  kind: DmKind;
  content: string;
}): Promise<boolean> {
  try {
    const result = await enqueuePosts([
      {
        dmUserId: input.discordId,
        guildId: input.guildId,
        kind: input.kind,
        payload: { content: input.content },
      },
    ]);
    return result.queued === 1;
  } catch (e) {
    console.error(`[delivery] could not queue a ${input.kind} DM`, e);
    return false;
  }
}

/**
 * L6 — Cluster is on your server, and here is what that means for your money.
 *
 * Sent to **whoever installed it**, which is not always the owner: G1 records
 * `installedByDiscordId` at the redirect or loses it forever, and the two are
 * told different things because they can do different things.
 */
export async function dmGuildInstalled(
  db: DB,
  input: { guildId: string; discordId: string },
): Promise<boolean> {
  const [guild] = await db
    .select({ name: schema.guilds.name, ownerDiscordId: schema.guilds.ownerDiscordId })
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, input.guildId));
  const name = guild?.name ?? "your server";
  const isOwner = guild?.ownerDiscordId === input.discordId;

  return queueDm({
    discordId: input.discordId,
    guildId: input.guildId,
    kind: "guild_installed",
    content: [
      `**Cluster is on ${name}.**`,
      "",
      "Your members can enter weekly challenges, and the server earns from what",
      "they do. Every server's earnings are public — nobody has to take our word",
      `for what they made: ${siteUrl()}/pool`,
      "",
      isOwner
        ? "Your admins can create community challenges out of those earnings, and " +
          "**only you can approve one.** Nobody else on the server can move that money."
        : "The server **owner** is the only person who can approve spending those " +
          "earnings or withdraw them — that is not something an admin can be given.",
      "",
      `Your server's portal: ${siteUrl()}/portal/server/${input.guildId}`,
    ].join("\n"),
  });
}

/** L7 — what the server earned, at every close, signed in or not. */
export async function dmOwnerEarnings(
  db: DB,
  input: { guildId: string; weekStart: Date; amountCents: number },
): Promise<boolean> {
  const [guild] = await db
    .select({ name: schema.guilds.name, ownerDiscordId: schema.guilds.ownerDiscordId })
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, input.guildId));
  if (!guild?.ownerDiscordId) return false;

  return queueDm({
    discordId: guild.ownerDiscordId,
    guildId: input.guildId,
    kind: "owner_earnings",
    content: [
      `**${guild.name} earned ${formatMoney(input.amountCents)}** in the week of ` +
        `${input.weekStart.toISOString().slice(0, 10)}.`,
      "",
      `Every server's share is public: ${siteUrl()}/pool`,
      `Yours, with the working: ${siteUrl()}/portal/server/${input.guildId}`,
    ].join("\n"),
  });
}

/**
 * L8 — the outgoing owner is told, and T3's fourteen days start from here.
 *
 * The clock is the point. A confirmation window that starts from a message
 * nobody sent is a window that expires against somebody who was never asked.
 */
export async function dmOwnershipTransfer(
  db: DB,
  input: { guildId: string; outgoingDiscordId: string; incomingDiscordId?: string | null },
): Promise<boolean> {
  const [guild] = await db
    .select({ name: schema.guilds.name })
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, input.guildId));

  return queueDm({
    discordId: input.outgoingDiscordId,
    guildId: input.guildId,
    kind: "ownership_transfer",
    content: [
      `**Discord says ${guild?.name ?? "your server"} has a new owner.**`,
      "",
      "On Cluster that means the money moves with it — withdrawals, community",
      "challenge approvals, the payout preference.",
      "",
      "**You have 14 days to tell us if this is wrong.** Withdrawals are frozen",
      "for 7 days either way, so nothing can leave while this is being sorted out.",
      "",
      `Reply here, or open ${siteUrl()}/portal/server/${input.guildId}`,
    ].join("\n"),
  });
}

/**
 * L9 — before a 4-week reassignment, not after.
 *
 * *"Reassigning somebody who was never told is indistinguishable from taking
 * their money."* The guard on this is a refusal, not a reminder: a guild whose
 * owner was never successfully told cannot be reassigned at all.
 */
export async function dmReassignmentWarning(
  db: DB,
  input: { guildId: string },
): Promise<boolean> {
  const [guild] = await db
    .select({ name: schema.guilds.name, ownerDiscordId: schema.guilds.ownerDiscordId })
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, input.guildId));
  if (!guild?.ownerDiscordId) return false;

  return queueDm({
    discordId: guild.ownerDiscordId,
    guildId: input.guildId,
    kind: "reassignment_warning",
    content: [
      `**${guild.name} has earnings waiting and nobody has claimed them.**`,
      "",
      "Cluster has been on your server for four weeks and the owner account has",
      "never signed in. If nothing changes, we will pass the ability to withdraw",
      "to a server admin — which means somebody else decides what happens to that",
      "money.",
      "",
      `Sign in once and it stays yours: ${siteUrl()}/portal/server/${input.guildId}`,
    ].join("\n"),
  });
}
