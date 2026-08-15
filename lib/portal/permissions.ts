// Who may do what on a server.
//
// ===== THE OWNER AND THE ADMINISTRATOR ARE TWO CHECKS, NOT ONE =====
//
// 12 §6 draws one line and every money rule sits on it:
//
//   Both:  view standings, analytics and members · re-announce · edit the
//          profile · add the bot · **request** a community challenge
//   Owner: **approve** a spend · **withdraw**
//
// There is deliberately no `isGuildManager` in this file. A single predicate
// doing both jobs is one careless call site away from letting an administrator
// withdraw, and that call site would look completely correct.
//
// P5 adds the case that catches people out: a **13–17 owner earns and may
// spend on community challenges, and may not withdraw.** They are the owner.
// The age gate is a second, independent question, and collapsing the two is
// the mutation the test plan asks for.

import type { Guild } from "../db/schema.ts";

export type GuildAccess =
  | { kind: "none" }
  | { kind: "administrator"; discordId: string }
  | { kind: "owner"; discordId: string }
  /** Demo mode with nothing configured. Fenced, and never reachable with a database. */
  | { kind: "demo" };

/**
 * What this Discord identity is on this guild.
 *
 * `seenAdmin` comes from `guild_admins` — people we have **seen** holding
 * ADMINISTRATOR or the mapped role (G5). It is honestly incomplete, which is
 * why an unseen administrator falls through to `none` and is routed to sign in
 * with Discord rather than told they are not allowed.
 */
export function guildAccessFor(input: {
  guild: Pick<Guild, "ownerDiscordId" | "adminRoleId">;
  discordId: string | null;
  seenAdmin: boolean;
  isDemo: boolean;
}): GuildAccess {
  if (input.discordId && input.guild.ownerDiscordId === input.discordId) {
    return { kind: "owner", discordId: input.discordId };
  }
  if (input.discordId && input.seenAdmin) {
    return { kind: "administrator", discordId: input.discordId };
  }
  if (input.isDemo) return { kind: "demo" };
  return { kind: "none" };
}

// ── The five capability questions. One function each, on purpose. ───────────

/** Everything an administrator can do. The generous half of the table. */
export function mayViewPortal(access: GuildAccess): boolean {
  return access.kind !== "none";
}

export function mayReAnnounce(access: GuildAccess): boolean {
  return access.kind !== "none";
}

export function mayEditProfile(access: GuildAccess): boolean {
  return access.kind !== "none";
}

/** An administrator may **request** a spend. That is the whole of their reach. */
export function mayRequestSpend(access: GuildAccess): boolean {
  return access.kind !== "none";
}

/**
 * Approving a spend is the owner's, and only the owner's.
 *
 * P5 — a 13–17 owner **may** approve a community-challenge spend. Exposure
 * now, cash at 18. So age is not consulted here, and that is deliberate: the
 * one place age matters is withdrawal.
 */
export function mayApproveSpend(access: GuildAccess): boolean {
  return access.kind === "owner" || access.kind === "demo";
}

export type WithdrawFacts = {
  access: GuildAccess;
  ageBand: string | null;
  country: string | null;
  /** T4 — a confirmed ownership transfer freezes withdrawal for seven days. */
  transferConfirmedAt?: Date | null;
  now?: Date;
};

export type WithdrawVerdict = { allowed: true } | { allowed: false; reason: string };

/** T4's window. Seven days from a confirmed transfer. */
export const TRANSFER_FREEZE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * May they withdraw?
 *
 * Four independent gates, each answered with the actual reason, because a
 * disabled button with no explanation is a support ticket. 12 §2's capability
 * table: **age 18+ · country · be the guild owner** — plus T4's freeze.
 */
export function mayWithdraw(facts: WithdrawFacts): WithdrawVerdict {
  const now = facts.now ?? new Date();

  // P1. First, because it is the one that is never about the person's
  // circumstances — an administrator is refused however old they are.
  if (facts.access.kind !== "owner" && facts.access.kind !== "demo") {
    return {
      allowed: false,
      reason:
        "Only the Discord server owner can withdraw. Administrators can do " +
        "everything else here — including requesting a community challenge, " +
        "which the owner then approves.",
    };
  }

  // P5. The teen owner earns and spends and does not withdraw. Separate from
  // the check above, and it must stay separate: collapsing them is the
  // mutation 09 asks the band to catch.
  if (facts.ageBand !== "adult") {
    return {
      allowed: false,
      reason:
        "You can earn and you can spend your balance on community challenges, " +
        "but withdrawing is 18+. Your balance keeps — contact support when you " +
        "turn 18.",
    };
  }

  if (!facts.country) {
    return {
      allowed: false,
      reason: "Set your country before withdrawing. It decides which entity pays you.",
    };
  }

  if (facts.transferConfirmedAt) {
    const until = new Date(facts.transferConfirmedAt.getTime() + TRANSFER_FREEZE_MS);
    if (now.getTime() < until.getTime()) {
      return {
        allowed: false,
        reason:
          `This server changed owner recently, so withdrawal is frozen until ` +
          `${until.toISOString().slice(0, 10)}. Seven days, every time — it is ` +
          `what stops a transfer being a way to take somebody else's earnings.`,
      };
    }
  }

  return { allowed: true };
}

/** A one-line label for the portal header. Owner and administrator read differently. */
export function accessLabel(access: GuildAccess): string {
  switch (access.kind) {
    case "owner":
      return "server owner";
    case "administrator":
      return "administrator";
    case "demo":
      return "demo";
    default:
      return "no access";
  }
}
