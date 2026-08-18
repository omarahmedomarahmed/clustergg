// Who may see an owner card.
//
// S2 — on install, **only the guild owner** has admin.
// S3 — the guild owner maps an admin role, the same way they pick a channel.
// S4 — anyone holding that role then gets the portal key, the admin cards,
//      everything.
// S5 — **store the role ID, not the name.** A renamed role must not silently
//      revoke access, and it would: a name is the thing people change, and an
//      owner who renames "Staff" to "Team" would lock their whole team out
//      with no error anybody could connect to what they did.
// S8 — **admin cards are never public messages. Ever.**
//
// That last one is enforced by making it impossible to return an owner card
// that is not ephemeral, rather than by remembering to set a flag.

import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import type { Interaction, ScreenResult } from "./interactions.ts";

export type AdminCheck =
  | { allowed: true; because: "guild_owner" | "admin_role" }
  | { allowed: false; reason: string };

/**
 * Whether this member may act as a server admin here.
 *
 * `guildOwnerId` comes from the interaction rather than from our own row,
 * because Discord is the authority on who owns a guild and ownership can
 * transfer without telling us.
 */
export async function checkAdmin(
  db: DB,
  input: { guildId: string | null; memberRoleIds: string[]; userId: string | null; guildOwnerId?: string | null },
): Promise<AdminCheck> {
  if (!input.guildId || !input.userId) {
    return { allowed: false, reason: "That card only works inside a server." };
  }

  if (input.guildOwnerId && input.userId === input.guildOwnerId) {
    return { allowed: true, because: "guild_owner" };
  }

  const [guild] = await db
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, input.guildId));

  // ===== S2, ASKED OF THE ROW RATHER THAN OF THE CALLER =====
  //
  // *"On install, only the guild owner has admin."* That was true of this
  // function only when a caller passed `guildOwnerId` — and the screen-registry
  // wrapper never did, because it has a guild id and not a guild. So every
  // owner card refused the owner with *"no admin role is mapped yet"*, which
  // is the state every server is in on the day it installs.
  //
  // The fact is in the row this function has already read. Asking a caller to
  // supply what the query returns is how the two ended up disagreeing, and the
  // parameter above stays only because `ownerOnly` has the id and not the row.
  if (guild?.ownerDiscordId && input.userId === guild.ownerDiscordId) {
    return { allowed: true, because: "guild_owner" };
  }

  if (!guild) {
    // S9 — if the bot was removed the portal survives, and the error says what
    // to do rather than what happened.
    return {
      allowed: false,
      reason: "Cluster is not installed here. Tell your admin to reinstall Cluster.",
    };
  }

  if (!guild.adminRoleId) {
    return {
      allowed: false,
      reason:
        "No admin role is mapped yet. The server owner can map one in Cluster's " +
        "settings — the same way they pick an announcement channel.",
    };
  }

  // The comparison is on the ID. Renaming the role changes nothing here, which
  // is the entire point of storing it this way.
  if (input.memberRoleIds.includes(guild.adminRoleId)) {
    return { allowed: true, because: "admin_role" };
  }

  return {
    allowed: false,
    reason: "That is for server admins. Ask whoever runs this server.",
  };
}

/**
 * Wrap an owner-only screen.
 *
 * Everything this returns is ephemeral, including the refusal — S8 has no
 * exceptions, and a refusal posted publicly would announce to a whole server
 * that somebody tried. The flag is set here rather than by each screen, so a
 * screen cannot forget it.
 */
export function ownerOnly(
  handler: (ctx: { interaction: Interaction; db: DB }) => Promise<ScreenResult>,
): (ctx: { interaction: Interaction; db: DB; guildOwnerId?: string | null }) => Promise<ScreenResult> {
  return async (ctx) => {
    const check = await checkAdmin(ctx.db, {
      guildId: ctx.interaction.guild_id ?? null,
      memberRoleIds: ctx.interaction.member?.roles ?? [],
      userId: ctx.interaction.member?.user?.id ?? ctx.interaction.user?.id ?? null,
      guildOwnerId: ctx.guildOwnerId ?? null,
    });
    if (!check.allowed) {
      return { content: check.reason, ephemeral: true };
    }
    const result = await handler(ctx);
    return { ...result, ephemeral: true };
  };
}

/**
 * Have we **seen this person** holding admin on **this guild**?
 *
 * ===== THE PAIR, NOT THE GUILD =====
 *
 * `guild_admins` is G5's honest, incomplete record: a row exists because we
 * watched somebody press a button while holding ADMINISTRATOR or the mapped
 * role. The row is a **pair**, and so is the question.
 *
 * The server portal asked it with only the guild in the `where`, so any gamer
 * who had ever linked Discord was an administrator of every server that had
 * ever seen one — the whole portal, the members list, the analytics, the
 * community-challenge request. One missing `and()` between "somebody here is
 * staff" and "you are".
 *
 * It lives here, beside the code that writes the rows, so there is one place
 * that knows what a `guild_admins` row means.
 */
export async function hasSeenAdmin(
  db: DB,
  guildId: string,
  discordId: string | null | undefined,
): Promise<boolean> {
  if (!discordId) return false;
  const rows = await db
    .select({ id: schema.guildAdmins.id })
    .from(schema.guildAdmins)
    .where(
      and(
        eq(schema.guildAdmins.guildId, guildId),
        eq(schema.guildAdmins.discordId, discordId),
      ),
    );
  return rows.length > 0;
}

/** Map an admin role. Stores the ID; the name is never persisted. */
export async function mapAdminRole(
  db: DB,
  guildId: string,
  roleId: string,
): Promise<void> {
  if (!/^\d+$/.test(roleId)) {
    // A Discord snowflake is digits. Anything else is a name somebody typed,
    // and storing it would be the exact defect S5 forbids.
    throw new Error(
      `An admin role is stored by ID, not by name — "${roleId}" is not an ID. ` +
        `A renamed role must not silently revoke access.`,
    );
  }
  await db
    .update(schema.guilds)
    .set({ adminRoleId: roleId })
    .where(eq(schema.guilds.guildId, guildId));
}
