// The portal key follows ownership (B45).
//
// Discord overwrites a guild's `owner_id` when a server is transferred, and we
// read that field on every refresh — so we already SEE the change and did
// nothing with it. The old key kept working, which means the previous owner
// kept access to earnings, payout requests and the community's private numbers
// for a server that is no longer theirs.
//
// The rule from B4 is why this matters, and it is not negotiable: **the key
// goes to `owner_id` and to nobody else, ever.** If ownership moves, so does
// the key. Everything below is that sentence made mechanical.
//
// Three properties it has to hold:
//
//   1. **Rotate exactly once per change.** A refresh loop that rotates on every
//      read locks the new owner out as fast as it let them in.
//   2. **The new key goes to the NEW owner and to nobody else.** Not to the old
//      one, not to a channel, not into a log.
//   3. **A failed DM is loud.** "We rotated the key and could not deliver it"
//      is a locked-out customer; silence is a locked-out customer nobody knows
//      about.

import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";

export type KeyRotation =
  | { rotated: true; guildId: string; newOwner: string; delivered: boolean }
  | { rotated: false; reason: "same_owner" | "no_new_owner" | "no_guild" | "error" };

/** Admin has to hear about this either way — it changes who can see the money. */
async function tellAdmins(title: string, body: string) {
  try {
    const db = await getDb();
    // `admin` AND `superadmin`. Matching only "admin" is how the existing
    // `notifyAdmins` in app/actions/trophies.ts:48 came to notify nobody — no
    // account in this codebase has ever had that exact role.
    const admins = await db.select({ id: schema.users.id }).from(schema.users)
      .where(inArray(schema.users.role, ["admin", "superadmin"]));
    for (const a of admins) {
      await db.insert(schema.notifications).values({
        id: uid(), userId: a.id, type: "system", title, body, href: "/admin/discord",
      } as never).onConflictDoNothing();
    }
  } catch { /* the rotation already happened; a missing notice must not undo it */ }
}

/**
 * Handle a detected ownership change.
 *
 * Called with the owner we HAD and the owner Discord now reports. Returns
 * `same_owner` for the overwhelmingly common case, which is what makes it safe
 * to call on every guild read.
 */
export async function onOwnerChanged(
  guildId: string,
  previousOwner: string | null | undefined,
  nextOwner: string | null | undefined,
): Promise<KeyRotation> {
  // No change is the normal path and must be cheap: no writes, no DMs, no key.
  if (!nextOwner) return { rotated: false, reason: "no_new_owner" };
  if (previousOwner === nextOwner) return { rotated: false, reason: "same_owner" };
  // First time we have ever learned an owner is not a TRANSFER. Rotating there
  // would invalidate a key we just gave somebody at install.
  if (!previousOwner) return { rotated: false, reason: "same_owner" };

  try {
    const db = await getDb();
    const [guild] = await db.select().from(schema.discordGuilds)
      .where(inArray(schema.discordGuilds.guildId, [guildId])).limit(1);
    if (!guild) return { rotated: false, reason: "no_guild" };

    const { rotatePortalKey } = await import("@/lib/server-portal");
    const key = await rotatePortalKey(guildId);
    if (!key) return { rotated: false, reason: "error" };

    // The old key is dead the moment the column is overwritten — `rotatePortalKey`
    // replaces it rather than keeping a grace period, and that is deliberate:
    // a grace period on this key is a window in which a former owner can pull
    // a payout report for a community that is not theirs.

    let delivered = false;
    try {
      const { dmUser } = await import("@/lib/discord/rest");
      const { siteUrl } = await import("@/lib/discord/config");
      const res = await dmUser(nextOwner, {
        embeds: [{
          title: "You now own this server's Cluster portal",
          description: [
            `**${guild.name || guildId}** changed hands, so its portal key changed with it.`,
            "",
            `Your key: **\`${key}\`**`,
            "",
            "The previous key stopped working the moment this was sent. Anyone still holding it has no access to your earnings or payouts.",
            "",
            `Your portal: ${siteUrl()}/servers/${guild.slug ?? ""}`,
          ].join("\n"),
          color: 0x34d399,
        }],
      });
      delivered = !!res;
    } catch { delivered = false; }

    await tellAdmins(
      delivered ? "Server ownership changed — key rotated" : "KEY UNDELIVERED — server ownership changed",
      delivered
        ? `${guild.name || guildId} transferred. The portal key was rotated and DM'd to the new owner. The old key no longer works.`
        // Said as the problem it is. A rotated key nobody received is a locked
        // out customer, and the only thing worse is not knowing.
        : `${guild.name || guildId} transferred and the portal key was rotated, but we COULD NOT DM the new owner (${nextOwner}). `
          + `They are locked out until somebody sends it to them. The old owner's key no longer works either.`,
    );

    return { rotated: true, guildId, newOwner: nextOwner, delivered };
  } catch { return { rotated: false, reason: "error" }; }
}
