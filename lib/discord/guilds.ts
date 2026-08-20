// Registering a guild, and refreshing what Discord says about it.
//
// ===== REFRESH PULLS OWNER AND ROLES. NEVER THE MEMBER LIST (G3) =====
//
// Two calls, both of them cheap and neither of them paged:
//
//   `GET /guilds/{id}`        → `owner_id`, name, approximate member count
//   `GET /guilds/{id}/roles`  → every role and its permission bits
//
// That answers *who owns it* and *which roles carry ADMINISTRATOR*. It does
// not answer *who holds those roles*, and it is not supposed to: that lives
// only in the member list, which pages at 1,000 and needs a privileged intent.
// `guild_admins` accumulates holders from interactions instead (G5), and the
// registry says in words that the list is of people we have seen.
//
// The one place a member list is read at all is the analytics tab a server
// owner opted into (12 §7a), and that is a different module with a different
// consent — deliberately not this one.

import { eq, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { slugify } from "../core/utils.ts";

export type GuildRole = { id: string; name: string; permissions: string };

/**
 * Create or update a guild row at install time.
 *
 * Upsert rather than insert: reinstalling after a removal must resume
 * everything (S9), and the row was never deleted. It only clears `removedAt`
 * — it does not overwrite an owner we already know, because the install
 * redirect's view of ownership is one person's OAuth grant and the registry's
 * is the guild object itself.
 */
export async function registerGuild(
  db: DB,
  input: {
    guildId: string;
    name: string;
    installedByDiscordId?: string | null;
    installerWasOwner?: boolean | null;
    ownerDiscordId?: string | null;
    memberCount?: number;
  },
  now = new Date(),
): Promise<void> {
  const [existing] = await db
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, input.guildId));

  if (existing) {
    await db
      .update(schema.guilds)
      .set({
        name: input.name || existing.name,
        removedAt: null,
        // G1 — only ever written if it is not already known. The first
        // install is the capture; a reinstall by somebody else does not
        // rewrite who originally added the bot.
        installedByDiscordId: existing.installedByDiscordId ?? input.installedByDiscordId ?? null,
        installerWasOwner: existing.installerWasOwner ?? input.installerWasOwner ?? null,
        ownerDiscordId: existing.ownerDiscordId ?? input.ownerDiscordId ?? null,
        ...(input.memberCount !== undefined ? { memberCount: input.memberCount } : {}),
      })
      .where(eq(schema.guilds.guildId, input.guildId));
    return;
  }

  await db.insert(schema.guilds).values({
    guildId: input.guildId,
    name: input.name,
    slug: await freeGuildSlug(db, input.name, input.guildId),
    memberCount: input.memberCount ?? 0,
    installedByDiscordId: input.installedByDiscordId ?? null,
    installerWasOwner: input.installerWasOwner ?? null,
    ownerDiscordId: input.ownerDiscordId ?? null,
    installedAt: now,
  });
}

async function freeGuildSlug(db: DB, name: string, guildId: string): Promise<string> {
  const base = slugify(name) || `server-${guildId.slice(0, 6)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${guildId.slice(0, attempt + 2)}`;
    const [taken] = await db
      .select({ slug: schema.guilds.slug })
      .from(schema.guilds)
      .where(eq(schema.guilds.slug, candidate));
    if (!taken) return candidate;
  }
  return `server-${guildId}`;
}

/** How long the registry's Refresh button stays disabled. Two calls, not free. */
export const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export type RefreshResult =
  | { ok: true; ownerDiscordId: string | null; roles: GuildRole[]; transferDetected: boolean }
  | { ok: false; reason: string };

/**
 * The registry's Refresh button. **Owner and roles only.**
 *
 * `fetcher` is injected so the logic band can exercise the ownership-transfer
 * branch without a network — and so that a test asserting *"this never calls
 * the member list"* can assert it against a real recorded call list rather
 * than by reading the source.
 */
export async function refreshGuild(
  db: DB,
  guildId: string,
  fetcher: {
    guild: (id: string) => Promise<{ ownerId: string; name: string; memberCount?: number }>;
    roles: (id: string) => Promise<GuildRole[]>;
  },
  now = new Date(),
): Promise<RefreshResult> {
  const [row] = await db.select().from(schema.guilds).where(eq(schema.guilds.guildId, guildId));
  if (!row) return { ok: false, reason: "No such server." };

  const guild = await fetcher.guild(guildId);
  const roles = await fetcher.roles(guildId);

  // T1 — a transfer is detected here or at sign-in, and detection is all this
  // does. T2 requires the old owner to be notified and confirm, and T3 gives
  // them 14 days. Switching silently would hand the money to whoever staged a
  // transfer.
  const transferDetected =
    Boolean(row.ownerDiscordId) && row.ownerDiscordId !== guild.ownerId;

  await db
    .update(schema.guilds)
    .set({
      name: guild.name || row.name,
      ...(guild.memberCount !== undefined ? { memberCount: guild.memberCount } : {}),
      ...(row.ownerDiscordId ? {} : { ownerDiscordId: guild.ownerId }),
      ...(transferDetected && !row.ownershipTransferAt ? { ownershipTransferAt: now } : {}),
    })
    .where(eq(schema.guilds.guildId, guildId));

  return { ok: true, ownerDiscordId: row.ownerDiscordId ?? guild.ownerId, roles, transferDetected };
}

/** Whether the Refresh button may be pressed again yet. */
export function refreshAllowedAt(lastRefreshAt: Date | null): Date | null {
  return lastRefreshAt ? new Date(lastRefreshAt.getTime() + REFRESH_COOLDOWN_MS) : null;
}

/** Every guild with the bot, most recently installed first. */
export async function installedGuilds(db: DB) {
  return db
    .select()
    .from(schema.guilds)
    .orderBy(sql`${schema.guilds.installedAt} desc`);
}
