// Who just pressed a button, and which server gets the credit for them.
//
// ===== THE FIRST BOT CLICK IS AN EVENT, NOT A LOOKUP (I5, A1) =====
//
// 12 §1: *"Pressing **any** bot button creates an account immediately, so every
// screen after it knows who they are."* And 12 §3: *"The parent is stamped at
// the **first click**, and counts once onboarding completes — **wherever** it
// completed."*
//
// Those are one moment and this is the only place it happens. Putting it in a
// screen handler would mean the parent is stamped by whichever screens somebody
// remembered — and A2 says a click in server A followed by onboarding in server
// B leaves A as the parent, which is only true if *every* door stamps.
//
// ===== THE MEMBER OBJECT IS LOAD-BEARING (12 §7) =====
//
// Discord's interaction payload **contains the member object**, so membership
// and the presser's current roles are proven on every press, free, with no API
// call. 12 §7's whole point is that we never list a guild's members — so the
// roles that arrive here are also the only way `guild_admins` ever learns who
// holds the mapped role (G5), and the registry says so in words.
//
// ===== WHAT THIS DELIBERATELY DOES NOT DO =====
//
// It stores **nothing but the Discord ID** (I5). No username, no avatar, no
// locale — all of which are sitting right there in the payload and all of which
// would be data held on somebody we have not yet asked the age of (I7).

import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { shadowGamerForDiscord, UnderThirteenError } from "../identity/gamers.ts";
import type { Interaction } from "./interactions.ts";

export type Presser = {
  /** Our `users.id`. Null when the identity is blocked or absent. */
  userId: string | null;
  discordId: string | null;
  guildId: string | null;
  /** Their roles in this guild, straight from the payload. Never polled. */
  roleIds: string[];
  /** True when this press is what created the row — the first click (I5). */
  created: boolean;
  /** Set when U3 refused the identity. The card says so; nothing is stored. */
  blocked: boolean;
};

/**
 * Identify the presser, creating the account if this is their first press.
 *
 * Never throws. A card path that could throw on identification would take down
 * every card for the one person it happened to (house rule 11), and the
 * refusal U3 raises is a card, not an error.
 */
export async function identifyPresser(
  db: DB,
  interaction: Interaction,
  now = new Date(),
): Promise<Presser> {
  const discordId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
  const guildId = interaction.guild_id ?? null;
  const roleIds = interaction.member?.roles ?? [];

  if (!discordId) {
    return { userId: null, discordId: null, guildId, roleIds, created: false, blocked: false };
  }

  const [before] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.discordId, discordId));

  let userId: string;
  try {
    // The parent is passed on **every** press and honoured on none but the
    // first: `shadowGamerForDiscord` returns early for an existing row, which
    // is the only thing standing between A1 and a parent that follows a gamer
    // from server to server.
    userId = await shadowGamerForDiscord(db, {
      discordId,
      parentGuildId: guildId,
      at: now,
    });
  } catch (e) {
    if (e instanceof UnderThirteenError) {
      return { userId: null, discordId, guildId, roleIds, created: false, blocked: true };
    }
    throw e;
  }

  // G5 — role holders are **accumulated from interaction payloads**, never
  // listed. Recorded on every press rather than only the first, because a
  // role granted after somebody's first click would otherwise never be seen.
  if (guildId && roleIds.length > 0) await recordSeenRoles(db, guildId, discordId, roleIds, now);

  return { userId, discordId, guildId, roleIds, created: !before, blocked: false };
}

/**
 * Record that we have **seen** this person holding the mapped admin role.
 *
 * G5 in one function: seen, not enumerated. Somebody who holds the role and
 * has never pressed a button will not appear on the registry, and the registry
 * says exactly that rather than implying the list is complete.
 */
export async function recordSeenRoles(
  db: DB,
  guildId: string,
  discordId: string,
  roleIds: string[],
  now = new Date(),
): Promise<boolean> {
  const [guild] = await db
    .select({ adminRoleId: schema.guilds.adminRoleId })
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId));
  if (!guild?.adminRoleId || !roleIds.includes(guild.adminRoleId)) return false;

  const [seen] = await db
    .select({ id: schema.guildAdmins.id })
    .from(schema.guildAdmins)
    .where(
      and(
        eq(schema.guildAdmins.guildId, guildId),
        eq(schema.guildAdmins.discordId, discordId),
      ),
    );

  if (seen) {
    await db
      .update(schema.guildAdmins)
      .set({ seenAt: now })
      .where(eq(schema.guildAdmins.id, seen.id));
    return true;
  }

  await db.insert(schema.guildAdmins).values({
    id: uid(),
    guildId,
    discordId,
    source: "mapped_role",
    seenAt: now,
  });
  return true;
}
