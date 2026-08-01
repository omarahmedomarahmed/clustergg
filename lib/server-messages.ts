import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";

// The conversation between a server owner and Cluster.
//
// An owner who installs a bot and then has a question has, in every other
// product, nowhere to put it. Here the bot IS the support channel: they write
// to it, staff answer from the console, and the answer arrives as a DM from the
// same bot. One thread per server, from the owner's side indistinguishable from
// talking to the bot.
//
// One Discord constraint shapes the whole design and is worth stating plainly:
// we do not request the Message Content intent, so the bot CANNOT read the text
// of a DM sent to it. Free-typed DMs are invisible to us by design — asking for
// that intent means Discord verification and reading every message in every
// server, which is not a trade worth making for a support inbox. So the owner's
// side of the conversation comes from places where Discord hands us the text:
// a modal in `/cluster admin`, or their portal. Outbound DMs need no intent at
// all, which is why the reply can still arrive as a normal message from the bot.

export type ServerMessage = typeof schema.serverMessages.$inferSelect;

const MAX_BODY = 2000;

export type SendResult = { ok: true; id: string } | { ok: false; reason: "empty" | "unknown_server" | "error" };

/** The owner writing to us — from their portal or from a Discord modal. */
export async function ownerSend(input: {
  guildId: string;
  body: string;
  discordUserId?: string | null;
  source?: "portal" | "discord";
}): Promise<SendResult> {
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, reason: "empty" };
  try {
    const db = await getDb();
    const [guild] = await db.select({ guildId: schema.discordGuilds.guildId })
      .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, input.guildId)).limit(1);
    if (!guild) return { ok: false, reason: "unknown_server" };

    const id = uid();
    await db.insert(schema.serverMessages).values({
      id,
      guildId: input.guildId,
      sender: "owner",
      body: body.slice(0, MAX_BODY),
      discordUserId: input.discordUserId ?? null,
      source: input.source ?? "portal",
      // The owner has obviously read their own message; staff have not.
      readByOwner: true,
      readByAdmin: false,
    });
    return { ok: true, id };
  } catch { return { ok: false, reason: "error" }; }
}

/**
 * Staff replying — recorded, then delivered as a DM from the bot.
 *
 * The record is written FIRST and the delivery attempted after, so a reply is
 * never lost because Discord was unreachable. `deliveredAt` is what tells the
 * console the difference between "sent" and "typed": an owner with closed DMs
 * has to be chased another way, and staff can only know that if we say so.
 */
export async function adminReply(input: {
  guildId: string;
  body: string;
  /** Who to DM. Falls back to the server's recorded owner. */
  discordUserId?: string | null;
}): Promise<SendResult> {
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, reason: "empty" };
  try {
    const db = await getDb();
    const [guild] = await db.select({
      guildId: schema.discordGuilds.guildId,
      name: schema.discordGuilds.name,
      ownerDiscordId: schema.discordGuilds.ownerDiscordId,
    }).from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, input.guildId)).limit(1);
    if (!guild) return { ok: false, reason: "unknown_server" };

    const target = input.discordUserId || guild.ownerDiscordId || null;
    const id = uid();
    await db.insert(schema.serverMessages).values({
      id,
      guildId: input.guildId,
      sender: "admin",
      body: body.slice(0, MAX_BODY),
      discordUserId: target,
      source: "admin",
      readByAdmin: true,
      readByOwner: false,
    });

    void deliver(id, target, body, guild.name ?? "your server").catch(() => {});
    return { ok: true, id };
  } catch { return { ok: false, reason: "error" }; }
}

async function deliver(id: string, discordUserId: string | null, body: string, serverName: string): Promise<void> {
  const db = await getDb();
  const fail = async (reason: string) => {
    await db.update(schema.serverMessages).set({ deliveryError: reason })
      .where(eq(schema.serverMessages.id, id)).catch(() => {});
  };

  if (!discordUserId) return fail("no_owner_on_record");
  try {
    const { canAct, siteUrl } = await import("@/lib/discord/config");
    if (!canAct()) return fail("bot_not_configured");

    const { dmUser } = await import("@/lib/discord/rest");
    const { linkButton, rows } = await import("@/lib/discord/components");
    const ok = await dmUser(discordUserId, {
      content: `**Cluster** — about **${serverName}**\n\n${body.slice(0, MAX_BODY)}`,
      components: rows([linkButton("Reply on your dashboard", `${siteUrl()}/servers`, "💬")]),
    });
    if (!ok) return fail("dm_blocked");
    await db.update(schema.serverMessages)
      .set({ deliveredAt: new Date(), deliveryError: null })
      .where(eq(schema.serverMessages.id, id));
  } catch { await fail("error"); }
}

export async function threadFor(guildId: string, limit = 100): Promise<ServerMessage[]> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.serverMessages)
      .where(eq(schema.serverMessages.guildId, guildId))
      .orderBy(desc(schema.serverMessages.createdAt)).limit(limit);
    // Oldest first for reading; newest-first only to apply the limit.
    return rows.reverse();
  } catch { return []; }
}

export async function markRead(guildId: string, side: "admin" | "owner"): Promise<void> {
  try {
    const db = await getDb();
    const col = side === "admin" ? { readByAdmin: true } : { readByOwner: true };
    await db.update(schema.serverMessages).set(col).where(and(
      eq(schema.serverMessages.guildId, guildId),
      // Only the other side's messages need marking — your own are read by
      // definition, and updating them churns rows for nothing.
      eq(schema.serverMessages.sender, side === "admin" ? "owner" : "admin"),
    ));
  } catch { /* an unread badge that lingers is not worth failing a page load */ }
}

export type InboxRow = {
  guildId: string;
  name: string;
  iconUrl: string | null;
  slug: string | null;
  lastBody: string;
  lastSender: string;
  lastAt: Date;
  unread: number;
  /** A staff reply that never reached Discord — the thing to chase. */
  undelivered: number;
};

/**
 * Every server with something to say, newest first.
 *
 * Ordered by the last message rather than by unread count on purpose: a support
 * inbox is a queue of conversations, and the oldest unanswered one is the one
 * that costs you a server.
 */
export async function inbox(limit = 100): Promise<InboxRow[]> {
  try {
    const db = await getDb();
    const msgs = await db.select({
      guildId: schema.serverMessages.guildId,
      sender: schema.serverMessages.sender,
      body: schema.serverMessages.body,
      createdAt: schema.serverMessages.createdAt,
      readByAdmin: schema.serverMessages.readByAdmin,
      deliveredAt: schema.serverMessages.deliveredAt,
      deliveryError: schema.serverMessages.deliveryError,
    }).from(schema.serverMessages)
      .orderBy(desc(schema.serverMessages.createdAt))
      .limit(2000);
    if (!msgs.length) return [];

    const byGuild = new Map<string, InboxRow>();
    for (const m of msgs) {
      const row = byGuild.get(m.guildId) ?? {
        guildId: m.guildId, name: m.guildId, iconUrl: null, slug: null,
        lastBody: m.body, lastSender: m.sender, lastAt: m.createdAt,
        unread: 0, undelivered: 0,
      };
      if (m.sender === "owner" && !m.readByAdmin) row.unread++;
      if (m.sender === "admin" && !m.deliveredAt && m.deliveryError) row.undelivered++;
      byGuild.set(m.guildId, row);
    }

    const ids = [...byGuild.keys()];
    const guilds = await db.select({
      guildId: schema.discordGuilds.guildId,
      name: schema.discordGuilds.name,
      iconUrl: schema.discordGuilds.iconUrl,
      slug: schema.discordGuilds.slug,
    }).from(schema.discordGuilds)
      .where(sql`${schema.discordGuilds.guildId} in ${ids}`);
    for (const g of guilds) {
      const row = byGuild.get(g.guildId);
      if (row) { row.name = g.name || g.guildId; row.iconUrl = g.iconUrl; row.slug = g.slug; }
    }

    return [...byGuild.values()]
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
      .slice(0, limit);
  } catch { return []; }
}

/** How many servers are waiting on a reply — the badge on the admin nav. */
export async function unreadServerMessages(): Promise<number> {
  try {
    const db = await getDb();
    const rows = await db.select({ guildId: schema.serverMessages.guildId })
      .from(schema.serverMessages)
      .where(and(
        eq(schema.serverMessages.sender, "owner"),
        eq(schema.serverMessages.readByAdmin, false),
      ));
    return new Set(rows.map((r) => r.guildId)).size;
  } catch { return 0; }
}
