// The guild registry — the page opened when an owner asks *"why am I not
// earning?"*
//
// 12 §8 lists eight sections and 05 §6 repeats them. This module assembles all
// eight into one object, because the page and the bot's admin card render the
// same answer and a second assembly is a second answer.
//
// ===== THE TWO RULES THAT SHAPE EVERY SECTION =====
//
// G3 — **refresh pulls owner and roles only. Never the member list.**
// G5 — **role holders are accumulated from interaction payloads**, never
//      listed, and **the page says so in words**: somebody who holds the role
//      and has never pressed a button will not appear. We do not take the
//      GUILD_MEMBERS intent to close that gap.
//
// The second is the one that needs saying out loud on the page. A list of role
// holders that is quietly incomplete is worse than no list, because admin will
// act on it — *"they don't have the role"* when the truth is *"we have never
// seen them press anything."*

import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { readEligibility } from "../pool/eligibility.ts";
import { analyticsView } from "../analytics/consent.ts";
import { pendingSpendRequests } from "../portal/spend.ts";
import { balanceOf } from "../money/ledger.ts";
import { TRANSFER_FREEZE_MS } from "../portal/permissions.ts";

export class RegistryRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryRefused";
  }
}

// ── The clocks ──────────────────────────────────────────────────────────────

/** T3 — the old owner has fourteen days to confirm, then admin arbitrates. */
export const TRANSFER_TIMEOUT_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * 12 §6 — an owner who has **never signed in** for four weeks may be
 * reassigned. Manually, never automatically, and the claimant must still hold
 * ADMINISTRATOR at that moment.
 */
export const REASSIGNMENT_AFTER_MS = 28 * 24 * 60 * 60 * 1000;

export type TransferState =
  | { state: "none" }
  | { state: "awaiting_confirmation"; since: Date; deadline: Date }
  | { state: "timed_out"; since: Date; deadline: Date }
  | { state: "confirmed"; at: Date; withdrawalFrozenUntil: Date };

export function transferStateOf(
  guild: { ownershipTransferAt: Date | null; transferConfirmedAt: Date | null },
  now: Date,
): TransferState {
  if (guild.transferConfirmedAt) {
    return {
      state: "confirmed",
      at: guild.transferConfirmedAt,
      // T4. The number itself lives in `lib/portal/permissions.ts`, where the
      // withdrawal gate reads it — imported, never retyped.
      withdrawalFrozenUntil: new Date(
        guild.transferConfirmedAt.getTime() + TRANSFER_FREEZE_MS,
      ),
    };
  }
  if (!guild.ownershipTransferAt) return { state: "none" };
  const deadline = new Date(guild.ownershipTransferAt.getTime() + TRANSFER_TIMEOUT_MS);
  return {
    // T5 — without a timeout, a vanished or hostile old owner locks the money
    // for ever. Timed out is not "confirmed by default": it is a state that
    // says a human must now decide.
    state: now.getTime() >= deadline.getTime() ? "timed_out" : "awaiting_confirmation",
    since: guild.ownershipTransferAt,
    deadline,
  };
}

/** Whether the four-week reassignment clock has run out. */
export function reassignmentState(
  guild: { ownerFirstSignInAt: Date | null; installedAt: Date },
  now: Date,
): { eligible: boolean; since: Date; at: Date } {
  // The clock starts at install, not at "the first time we tried to DM them" —
  // a DM that failed (12 §6) must not restart it, or an owner who blocks DMs
  // is unreachable and permanently un-reassignable.
  const since = guild.ownerFirstSignInAt ?? guild.installedAt;
  const at = new Date(since.getTime() + REASSIGNMENT_AFTER_MS);
  return {
    eligible: guild.ownerFirstSignInAt === null && now.getTime() >= at.getTime(),
    since,
    at,
  };
}


// ── The transfer flow ───────────────────────────────────────────────────────

/**
 * T2 — the old owner confirms.
 *
 * Only they can. A transfer confirmed by the *new* owner is a transfer with no
 * check at all, which is the thing T2 exists to prevent — and it is the
 * plausible mistake, because the new owner is the one asking for it.
 */
export async function confirmTransfer(
  db: DB,
  input: { guildId: string; byDiscordId: string },
  now = new Date(),
): Promise<void> {
  const [guild] = await db
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, input.guildId));
  if (!guild) throw new RegistryRefused("No such server.");
  if (!guild.ownershipTransferAt) {
    throw new RegistryRefused("There is no transfer to confirm on this server.");
  }
  if (guild.ownerDiscordId !== input.byDiscordId) {
    throw new RegistryRefused(
      "Only the outgoing owner can confirm a transfer. The incoming one " +
        "cannot confirm their own.",
    );
  }

  await db
    .update(schema.guilds)
    .set({ transferConfirmedAt: now })
    .where(eq(schema.guilds.guildId, input.guildId));
  await log(db, {
    actorId: input.byDiscordId,
    action: "guild.transfer.confirmed",
    guildId: input.guildId,
    detail: { from: guild.ownerDiscordId },
    now,
  });
}

/**
 * T3 — after fourteen days with no answer, Cluster admin arbitrates.
 *
 * Deliberately a separate function from `confirmTransfer` with a different
 * actor and its own audit action, so a timeout can never be mistaken for a
 * confirmation in the log. *"Nobody answered and admin decided"* and *"the
 * owner agreed"* are different facts about the same server.
 */
export async function arbitrateTransfer(
  db: DB,
  input: { guildId: string; actorId: string; newOwnerDiscordId: string; reason: string },
  now = new Date(),
): Promise<void> {
  const [guild] = await db
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, input.guildId));
  if (!guild) throw new RegistryRefused("No such server.");

  const state = transferStateOf(guild, now);
  if (state.state !== "timed_out") {
    throw new RegistryRefused(
      state.state === "awaiting_confirmation"
        ? `The outgoing owner still has until ${state.deadline
            .toISOString()
            .slice(0, 10)} to answer. Fourteen days, every time.`
        : "There is no timed-out transfer on this server to arbitrate.",
    );
  }

  await db
    .update(schema.guilds)
    .set({
      ownerDiscordId: input.newOwnerDiscordId,
      transferConfirmedAt: now,
      // The owner changed, so "has this owner ever signed in" is a question
      // about somebody else now.
      ownerFirstSignInAt: null,
    })
    .where(eq(schema.guilds.guildId, input.guildId));
  await log(db, {
    actorId: input.actorId,
    action: "guild.transfer.arbitrated",
    guildId: input.guildId,
    detail: { from: guild.ownerDiscordId, to: input.newOwnerDiscordId, reason: input.reason },
    now,
  });
}

/**
 * Reassign a server whose owner has never appeared.
 *
 * 12 §6 — four weeks, **manually, never automatically**, and *"the claimant
 * must still hold ADMINISTRATOR at that moment"*. That last clause is why
 * `claimantHoldsAdministrator` is an argument the caller must answer from a
 * live reading rather than something looked up from `guild_admins`: that table
 * is what we have *seen*, and a role somebody held in March is not a role they
 * hold today.
 */
export async function reassignOwner(
  db: DB,
  input: {
    guildId: string;
    actorId: string;
    newOwnerDiscordId: string;
    claimantHoldsAdministrator: boolean;
    reason: string;
  },
  now = new Date(),
): Promise<void> {
  const [guild] = await db
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, input.guildId));
  if (!guild) throw new RegistryRefused("No such server.");

  const clock = reassignmentState(guild, now);
  if (!clock.eligible) {
    throw new RegistryRefused(
      guild.ownerFirstSignInAt
        ? "This server's owner has signed in. Reassignment is only for an owner who never appears."
        : `Not yet — reassignment opens on ${clock.at.toISOString().slice(0, 10)}, four weeks after we first saw this server.`,
    );
  }
  if (!input.claimantHoldsAdministrator) {
    throw new RegistryRefused(
      "The claimant must hold ADMINISTRATOR on this server right now. Refresh " +
        "the server's roles and try again.",
    );
  }

  await db
    .update(schema.guilds)
    .set({ ownerDiscordId: input.newOwnerDiscordId, ownerFirstSignInAt: null })
    .where(eq(schema.guilds.guildId, input.guildId));
  await log(db, {
    actorId: input.actorId,
    action: "guild.owner.reassigned",
    guildId: input.guildId,
    detail: { from: guild.ownerDiscordId, to: input.newOwnerDiscordId, reason: input.reason },
    now,
  });
}

// ── The owner DM, and the failure that must not be swallowed ────────────────

export type OwnerDmState = "sent" | "blocked" | "failed";

/**
 * 12 §6 — **a failed DM is a recorded state the registry shows**, never an
 * error swallowed on a background path.
 *
 * A guild owner who blocks DMs from server members never receives ours, and
 * Discord says so quietly. Every owner-facing promise on the platform runs
 * through that DM until they sign in once — we have no email for them, because
 * Discord never gives us one — so a silent failure is an owner who is never
 * told they are earning money.
 */
export async function recordOwnerDm(
  db: DB,
  input: { guildId: string; state: OwnerDmState },
  now = new Date(),
): Promise<void> {
  await db
    .update(schema.guilds)
    .set({ ownerDmState: input.state })
    .where(eq(schema.guilds.guildId, input.guildId));
  if (input.state !== "sent") {
    await log(db, {
      actorId: null,
      action: "guild.owner_dm.failed",
      guildId: input.guildId,
      detail: { state: input.state },
      now,
    });
  }
}

// ── Admin corrections ───────────────────────────────────────────────────────

/**
 * G4 — admin can set a gamer's **age band** by hand. Logged.
 *
 * G9/U2: a gamer can never change their own, and a 13–17 gamer who turns 18
 * must contact support. This is that support path, and it is the only one.
 */
export async function setAgeBandByAdmin(
  db: DB,
  input: { userId: string; ageBand: "teen" | "adult"; actorId: string; reason: string },
  now = new Date(),
): Promise<void> {
  if (!input.actorId) {
    throw new RegistryRefused("An age band is changed by a person, and the change is logged.");
  }
  if (input.actorId === input.userId) {
    throw new RegistryRefused("A gamer can never set their own age band, including an admin's own.");
  }
  const [before] = await db
    .select({ ageBand: schema.users.ageBand })
    .from(schema.users)
    .where(eq(schema.users.id, input.userId));

  await db
    .update(schema.users)
    .set({ ageBand: input.ageBand })
    .where(eq(schema.users.id, input.userId));
  await db.insert(schema.auditLog).values({
    id: uid(),
    actorId: input.actorId,
    action: "user.age_band.set",
    refType: "user",
    refId: input.userId,
    detail: { from: before?.ageBand ?? null, to: input.ageBand, reason: input.reason },
    at: now,
  });
}

// ── The eight sections ──────────────────────────────────────────────────────

export async function guildRegistry(db: DB, guildId: string, now = new Date()) {
  const [guild] = await db.select().from(schema.guilds).where(eq(schema.guilds.guildId, guildId));
  if (!guild) return null;

  const seenAdmins = await db
    .select()
    .from(schema.guildAdmins)
    .where(eq(schema.guildAdmins.guildId, guildId))
    .orderBy(desc(schema.guildAdmins.seenAt));

  const audit = await db
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.refType, "guild"), eq(schema.auditLog.refId, guildId)))
    .orderBy(desc(schema.auditLog.at));

  const payouts = await db
    .select()
    .from(schema.serverPayouts)
    .where(eq(schema.serverPayouts.guildId, guildId))
    .orderBy(desc(schema.serverPayouts.weekStart));

  return {
    // 1 · Ownership
    ownership: {
      ownerDiscordId: guild.ownerDiscordId,
      /** 12 §8 asks for this explicitly: has the owner ever signed in. */
      hasEverSignedIn: guild.ownerFirstSignInAt !== null,
      firstSignInAt: guild.ownerFirstSignInAt,
      dmState: guild.ownerDmState,
      transfer: transferStateOf(guild, now),
      reassignment: reassignmentState(guild, now),
    },
    // 2 · Who installed it (G1 — captured at the redirect or lost forever)
    install: {
      installedAt: guild.installedAt,
      installedByDiscordId: guild.installedByDiscordId,
      installerWasOwner: guild.installerWasOwner,
      removedAt: guild.removedAt,
    },
    // 3 · Permissions
    permissions: {
      /** S5/P3 — the ID is what we stored. The name is what Discord shows. */
      adminRoleId: guild.adminRoleId,
      seenHolders: seenAdmins.map((a) => ({
        discordId: a.discordId,
        source: a.source,
        seenAt: a.seenAt,
      })),
      /**
       * G5, in words, on the page. Not a footnote: admin will otherwise read
       * this list as "who holds the role" and act on somebody's absence.
       */
      note:
        "These are the people we have **seen** holding ADMINISTRATOR or the " +
        "mapped role, from the interactions they sent us. Somebody who holds " +
        "the role and has never pressed a button will not appear here — we do " +
        "not read your member list to close that gap.",
    },
    // 4 · Pool eligibility
    eligibility: await readEligibility(db, guildId),
    inThisWeeksPool: guild.eligibleThisWeek === true,
    // 5 · Money
    money: {
      lifetimePayouts: payouts,
      pendingSpendRequests: await pendingSpendRequests(db, guildId),
      // Platform-level, and shown here so admin answering "why am I not
      // earning" has the vault in front of them.
      serverVaultCents: await balanceOf(db, "server"),
    },
    // 6 · Refresh — the button's own state lives with the button (guilds.ts)
    // 7 · Analytics
    analytics: await analyticsView(db, guildId, now),
    // 8 · Audit
    audit,
  };
}

async function log(
  db: DB,
  input: {
    actorId: string | null;
    action: string;
    guildId: string;
    detail: Record<string, unknown>;
    now: Date;
  },
): Promise<void> {
  await db.insert(schema.auditLog).values({
    id: uid(),
    actorId: input.actorId,
    action: input.action,
    refType: "guild",
    refId: input.guildId,
    detail: input.detail,
    at: input.now,
  });
}
