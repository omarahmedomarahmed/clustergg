// Who owns a guild, who admins it, and who we have actually seen.
//
// ===== THREE FACTS, THREE DIFFERENT WAYS OF KNOWING THEM =====
//
//   **Owner** — Discord's `owner` flag on `/users/@me/guilds`, or the guild
//   object's `owner_id`. Discovered at sign-in, at link, or on refresh (S0).
//   Only this person touches money (P1).
//
//   **Administrator / mapped role** — the ADMINISTRATOR permission bit, or a
//   role ID the owner mapped by hand (P2, P3). Opens the portal; touches no
//   money.
//
//   **Seen holding it** — G5. Accumulated from interaction payloads, because
//   *who holds a role* lives only in the member list and we do not read one.
//   The registry says so in words rather than implying the list is complete.
//
// The first two are separate functions on purpose. A single `isGuildManager`
// doing both jobs is one edit away from letting an administrator withdraw.

import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { hasAdministrator, type DiscordGuildSummary } from "../auth/discord.ts";

/**
 * Record what Discord just told us about this person's guilds.
 *
 * Only touches guilds we already know about — a gamer who owns fifty servers
 * without Cluster in them is not fifty rows in our database.
 */
export async function recordGuildOwnership(
  db: DB,
  discordId: string,
  guilds: DiscordGuildSummary[],
  now = new Date(),
): Promise<{ owns: string[]; admins: string[] }> {
  const known = await db.select().from(schema.guilds);
  const byId = new Map(known.map((g) => [g.guildId, g]));

  const owns: string[] = [];
  const admins: string[] = [];

  for (const g of guilds) {
    const row = byId.get(g.id);
    if (!row) continue;

    if (g.owner) {
      owns.push(g.id);
      // ===== OWNERSHIP TRANSFER IS DETECTED HERE (T1) =====
      //
      // Discord says this person owns the guild and we have somebody else on
      // file. We do not silently switch — T2 requires the old owner be
      // notified and confirm, with a 14-day timeout (T3). All this does is
      // start the clock.
      if (row.ownerDiscordId && row.ownerDiscordId !== discordId && !row.ownershipTransferAt) {
        await db
          .update(schema.guilds)
          .set({ ownershipTransferAt: now })
          .where(eq(schema.guilds.guildId, g.id));

        // ===== L8 — THE CLOCK STARTS FROM A MESSAGE SOMEBODY SENT =====
        //
        // T3's fourteen days are a window for the outgoing owner to say this
        // is wrong. A window that opens against somebody who was never told is
        // not a window, it is a countdown — and until now nothing told them,
        // because `dmUser` had no callers.
        //
        // After the write and fenced, so a queue failure cannot leave the
        // clock unstarted: an unstarted clock means the transfer is never
        // resolved at all, which is worse than an un-DMed one that the
        // registry will show as un-DMed.
        const { dmOwnershipTransfer } = await import("../delivery/dm.ts");
        await dmOwnershipTransfer(db, {
          guildId: g.id,
          outgoingDiscordId: row.ownerDiscordId,
          incomingDiscordId: discordId,
        });
      } else if (!row.ownerDiscordId) {
        await db
          .update(schema.guilds)
          .set({ ownerDiscordId: discordId, ownerFirstSignInAt: row.ownerFirstSignInAt ?? now })
          .where(eq(schema.guilds.guildId, g.id));
      } else if (row.ownerDiscordId === discordId && !row.ownerFirstSignInAt) {
        // P4 — the portal existed before they ever signed up. This is the
        // moment it stops being "waiting" and starts the weekly email (12 §6),
        // and it also stops the 4-week reassignment clock.
        await db
          .update(schema.guilds)
          .set({ ownerFirstSignInAt: now })
          .where(eq(schema.guilds.guildId, g.id));
      }
    }

    if (g.owner || hasAdministrator(g.permissions)) {
      admins.push(g.id);
      await seeAdmin(db, { guildId: g.id, discordId, source: "administrator", at: now });
    }
  }

  return { owns, admins };
}

/**
 * Note that we have seen somebody holding admin rights on a guild.
 *
 * G5 — this is an accumulation, never a listing. It is fed from OAuth grants
 * and from interaction payloads, both of which tell us about **one** person
 * who chose to show up. Somebody who holds the role and never presses a button
 * will not appear, and the registry says exactly that.
 */
export async function seeAdmin(
  db: DB,
  input: { guildId: string; discordId: string; source: "administrator" | "mapped_role"; at?: Date },
): Promise<void> {
  const at = input.at ?? new Date();
  const [existing] = await db
    .select()
    .from(schema.guildAdmins)
    .where(
      and(
        eq(schema.guildAdmins.guildId, input.guildId),
        eq(schema.guildAdmins.discordId, input.discordId),
      ),
    );

  if (existing) {
    await db
      .update(schema.guildAdmins)
      .set({ seenAt: at, source: input.source })
      .where(eq(schema.guildAdmins.id, existing.id));
    return;
  }
  await db.insert(schema.guildAdmins).values({
    id: uid(),
    guildId: input.guildId,
    discordId: input.discordId,
    source: input.source,
    seenAt: at,
  });
}

export async function adminsSeenFor(db: DB, guildId: string) {
  return db.select().from(schema.guildAdmins).where(eq(schema.guildAdmins.guildId, guildId));
}

/** The guilds this Discord identity owns, as far as we know. */
export async function guildsOwnedBy(db: DB, discordId: string | null | undefined) {
  if (!discordId) return [];
  return db.select().from(schema.guilds).where(eq(schema.guilds.ownerDiscordId, discordId));
}
