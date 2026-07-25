import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { getContent } from "@/lib/cms";
import { dmUser, getGuild, guildIconUrl } from "@/lib/discord/rest";
import { canAct, siteUrl } from "@/lib/discord/config";
import { linkButton, rows } from "@/lib/discord/components";
import { embedColor } from "@/lib/discord/cards";

// The server-owner growth loop.
//
// An owner installs the bot, watches their members join Cluster, and at a
// threshold of LINKED gamers their server unlocks a share of ad revenue. That
// is the whole reason a server owner would actively recruit for us rather than
// passively host a bot, so the counter has to be honest and always available.

export const DEFAULT_UNLOCK_THRESHOLD = 500;

export async function unlockThreshold(): Promise<number> {
  try {
    const c = await getContent(["discord.unlock.threshold"]);
    const n = Number(c["discord.unlock.threshold"]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_UNLOCK_THRESHOLD;
  } catch { return DEFAULT_UNLOCK_THRESHOLD; }
}

export type GuildRow = typeof schema.discordGuilds.$inferSelect;

export async function getGuildRow(guildId: string): Promise<GuildRow | null> {
  try {
    const db = await getDb();
    const [row] = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
    return row ?? null;
  } catch { return null; }
}

// Record an install (or re-install). Live guild metadata comes from Discord so
// the admin dashboards show real names and member counts, not IDs.
export async function upsertGuild(guildId: string, patch: Partial<GuildRow> = {}): Promise<void> {
  try {
    const db = await getDb();
    let meta: Partial<GuildRow> = {};
    if (canAct()) {
      const res = await getGuild(guildId);
      if (res.ok) {
        meta = {
          name: res.data.name,
          iconUrl: guildIconUrl(res.data),
          ownerDiscordId: res.data.owner_id ?? null,
          memberCount: res.data.approximate_member_count ?? 0,
        };
      }
    }
    const values = { guildId, status: "active" as const, removedAt: null, ...meta, ...patch };
    await db.insert(schema.discordGuilds).values(values)
      .onConflictDoUpdate({ target: schema.discordGuilds.guildId, set: values });
  } catch { /* onboarding still succeeded even if we couldn't record it */ }
}

export async function markGuildRemoved(guildId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.update(schema.discordGuilds)
      .set({ status: "removed", removedAt: new Date() })
      .where(eq(schema.discordGuilds.guildId, guildId));
  } catch { /* non-fatal */ }
}

// ===== Attribution =====

// Credit a server for a gamer. Called when someone uses the bot — that is the
// moment we know which server they came from.
export async function attributeMember(guildId: string, userId: string, via = "bot"): Promise<void> {
  if (!guildId || !userId) return;
  try {
    const db = await getDb();

    // `markMemberLinked` only fires at the moment someone links a game. Most
    // gamers will already have linked one BEFORE they first use the bot in a
    // server, so without this their row would sit at firstLinkedAt = null
    // forever and the server would be permanently undercounted — the worst
    // direction to be wrong in, since this number gates the owner's revenue.
    const [account] = await db.select({ createdAt: schema.linkedGameAccounts.createdAt })
      .from(schema.linkedGameAccounts)
      .where(eq(schema.linkedGameAccounts.userId, userId))
      .limit(1);

    await db.insert(schema.discordGuildMembers)
      .values({
        guildId, userId, attributedVia: via,
        firstLinkedAt: account ? (account.createdAt ?? new Date()) : null,
      })
      .onConflictDoNothing();

    if (account) void checkUnlock(guildId).catch(() => {});
  } catch { /* non-fatal */ }
}

// Called the first time a gamer links a game account. This is what counts
// toward the unlock — and it's set once, so a gamer can't be double-counted by
// linking a second game.
export async function markMemberLinked(userId: string): Promise<void> {
  try {
    const db = await getDb();
    // Read then write, rather than UPDATE ... RETURNING: the two drivers
    // (neon-http in production, PGlite in demo) don't share a returning() type.
    const pending = await db.select({ guildId: schema.discordGuildMembers.guildId })
      .from(schema.discordGuildMembers)
      .where(and(
        eq(schema.discordGuildMembers.userId, userId),
        isNull(schema.discordGuildMembers.firstLinkedAt),
      ));
    if (!pending.length) return;

    await db.update(schema.discordGuildMembers)
      .set({ firstLinkedAt: new Date() })
      .where(and(
        eq(schema.discordGuildMembers.userId, userId),
        isNull(schema.discordGuildMembers.firstLinkedAt),
      ));
    // A newly linked gamer may be the one that tips a server over the line.
    for (const r of pending) void checkUnlock(r.guildId).catch(() => {});
  } catch { /* non-fatal */ }
}

// ===== Counters =====

export type GuildStats = {
  guildId: string;
  name: string;
  memberCount: number;
  joined: number;      // members with a Cluster account
  linked: number;      // …who have linked a game — this is what unlocks revenue
  left: number;
  threshold: number;
  remaining: number;
  pct: number;
  unlocked: boolean;
  unlockedAt: Date | null;
  revenueSharePct: number;
};

export async function guildStats(guildId: string): Promise<GuildStats | null> {
  try {
    const db = await getDb();
    const [row, counts, threshold] = await Promise.all([
      getGuildRow(guildId),
      db.select({
        joined: sql<number>`count(*)`,
        linked: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
        left: sql<number>`count(${schema.discordGuildMembers.leftAt})`,
      }).from(schema.discordGuildMembers).where(eq(schema.discordGuildMembers.guildId, guildId)),
      unlockThreshold(),
    ]);

    const joined = Number(counts[0]?.joined ?? 0);
    const linked = Number(counts[0]?.linked ?? 0);
    const left = Number(counts[0]?.left ?? 0);
    return {
      guildId,
      name: row?.name || "This server",
      memberCount: row?.memberCount ?? 0,
      joined, linked, left,
      threshold,
      remaining: Math.max(0, threshold - linked),
      pct: Math.min(100, Math.round((linked / threshold) * 100)),
      unlocked: !!row?.adUnlockedAt || linked >= threshold,
      unlockedAt: row?.adUnlockedAt ?? null,
      revenueSharePct: row?.revenueSharePct ?? 70,
    };
  } catch { return null; }
}

// ===== The unlock =====

// Flip a server to ad-eligible once it crosses the threshold, and tell the
// owner. Idempotent: `adUnlockedAt` is only ever set once.
export async function checkUnlock(guildId: string): Promise<boolean> {
  const stats = await guildStats(guildId);
  if (!stats || stats.unlockedAt || stats.linked < stats.threshold) return false;

  try {
    const db = await getDb();
    await db.update(schema.discordGuilds)
      .set({ adUnlockedAt: new Date() })
      .where(and(
        eq(schema.discordGuilds.guildId, guildId),
        isNull(schema.discordGuilds.adUnlockedAt),
      ));
  } catch { return false; }

  const row = await getGuildRow(guildId);
  if (row?.ownerDiscordId && canAct()) {
    await dmUser(row.ownerDiscordId, {
      embeds: [{
        title: "Your server just unlocked ad revenue",
        description: [
          `**${stats.linked.toLocaleString()} of your members** have joined Cluster and linked a game account.`,
          "",
          `That crosses the ${stats.threshold.toLocaleString()} threshold, so **${row.name || "your server"}** is now earning a ${stats.revenueSharePct}% share of the ad revenue Cluster makes from your community.`,
          "",
          "Nothing else to do — it's active from now on. Run `/cluster server` any time to see where you stand.",
        ].join("\n"),
        color: embedColor("#34d399"),
      }],
      components: rows([linkButton("Open Cluster", siteUrl(), "🔗")]),
    }).catch(() => false);
  }
  return true;
}

// Every installed server with its growth numbers — the admin overview.
export async function listGuilds(): Promise<GuildStats[]> {
  try {
    const db = await getDb();
    const guilds = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.status, "active"));
    const stats = await Promise.all(guilds.map((g) => guildStats(g.guildId)));
    return stats
      .filter((s): s is GuildStats => !!s)
      .sort((a, b) => b.linked - a.linked);
  } catch { return []; }
}

// Servers eligible to receive bot ad posts.
export async function adEligibleGuilds(): Promise<GuildRow[]> {
  try {
    const db = await getDb();
    return db.select().from(schema.discordGuilds).where(and(
      eq(schema.discordGuilds.status, "active"),
      eq(schema.discordGuilds.adOptIn, true),
      isNotNull(schema.discordGuilds.adUnlockedAt),
    ));
  } catch { return []; }
}

// Servers that should receive announcements (challenge joins, tier ups).
export async function announcingGuilds(): Promise<GuildRow[]> {
  try {
    const db = await getDb();
    return db.select().from(schema.discordGuilds).where(and(
      eq(schema.discordGuilds.status, "active"),
      eq(schema.discordGuilds.announcementsEnabled, true),
      isNotNull(schema.discordGuilds.channelId),
    ));
  } catch { return []; }
}

// ===== Command analytics =====

export async function logCommand(entry: {
  guildId?: string | null; userId?: string | null; discordId?: string | null;
  command: string; screen?: string | null; arg?: string | null; latencyMs?: number;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.discordCommandLogs).values({
      id: uid(),
      guildId: entry.guildId ?? null,
      userId: entry.userId ?? null,
      discordId: entry.discordId ?? null,
      command: entry.command.slice(0, 64),
      screen: entry.screen?.slice(0, 64) ?? null,
      arg: entry.arg?.slice(0, 120) ?? null,
      latencyMs: entry.latencyMs ?? 0,
    });
  } catch { /* analytics must never break an interaction */ }
}
