import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid, slugify } from "@/lib/utils";
import { newPortalKey } from "@/lib/portal-auth";
import { guildStats, type GuildStats } from "@/lib/discord/guilds";

// The server-owner portal.
//
// A server owner has no Cluster account and shouldn't need one to see what
// their community is worth. So this works exactly like the brand portal: a slug
// they can remember, a key we DM them, and their own numbers behind it.
//
// The tiers are the product. Each one is a real capability unlocked by a real
// number, so an owner recruiting for us is doing it for something concrete
// rather than for goodwill.

export type TierKey = "seed" | "monetized" | "broadcaster" | "sponsored";

export type Tier = {
  key: TierKey;
  name: string;
  threshold: number;
  badge: string;
  unlocks: string;
  detail: string;
};

export const TIERS: Tier[] = [
  {
    key: "seed",
    name: "Seed Server",
    threshold: 0,
    badge: "🌱",
    unlocks: "Private challenges for your community",
    detail: "Request challenges, run them for your members, and appear on Cluster with your own logo and invite.",
  },
  {
    key: "monetized",
    name: "Monetized Server",
    threshold: 500,
    badge: "💠",
    unlocks: "Ad revenue share",
    detail: "You earn a share of what Cluster makes from ads shown to your community.",
  },
  {
    key: "broadcaster",
    name: "Broadcaster",
    threshold: 1000,
    badge: "📡",
    unlocks: "Carry other servers' challenges",
    detail: "Public challenges and other servers' competitions can run in your server — and you're paid to carry them.",
  },
  {
    key: "sponsored",
    name: "Sponsored Server",
    threshold: 5000,
    badge: "👑",
    unlocks: "Brand-sponsored challenges, 100% of the fee",
    detail:
      "Brands sponsor challenges directly in your server and you keep the whole fee. "
      + "Smaller servers now carry YOUR challenges instead of the other way round.",
  },
];

export function tierFor(linked: number): { current: Tier; next: Tier | null; progressPct: number } {
  const sorted = [...TIERS].sort((a, b) => a.threshold - b.threshold);
  let current = sorted[0];
  for (const t of sorted) if (linked >= t.threshold) current = t;
  const next = sorted.find((t) => t.threshold > linked) ?? null;
  const span = next ? next.threshold - current.threshold : 1;
  const done = next ? linked - current.threshold : span;
  // Floored, not rounded: at 499 of 500 this must not read "100%". Telling an
  // owner they've arrived when they haven't is the one error this bar can make.
  return { current, next, progressPct: Math.max(0, Math.min(100, Math.floor((done / span) * 100))) };
}

export function badgesFor(linked: number, challengesRun: number): { badge: string; name: string; earned: boolean }[] {
  const out = TIERS.map((t) => ({ badge: t.badge, name: t.name, earned: linked >= t.threshold }));
  out.push({ badge: "🏆", name: "First Challenge", earned: challengesRun >= 1 });
  out.push({ badge: "🔥", name: "Five Challenges", earned: challengesRun >= 5 });
  return out;
}

// ===== Identity =====

export type PortalServer = typeof schema.discordGuilds.$inferSelect;

export async function getServerBySlugOrId(slugOrId: string): Promise<PortalServer | null> {
  try {
    const db = await getDb();
    const [bySlug] = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.slug, slugOrId)).limit(1);
    if (bySlug) return bySlug;
    const [byId] = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.guildId, slugOrId)).limit(1);
    return byId ?? null;
  } catch { return null; }
}

// Give a server its portal identity. Called at install, and idempotent — a
// re-install must not rotate a key the owner has already saved.
export async function ensurePortal(guildId: string): Promise<{ slug: string; key: string } | null> {
  try {
    const db = await getDb();
    const [row] = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
    if (!row) return null;
    if (row.slug && row.portalKey) return { slug: row.slug, key: row.portalKey };

    let slug = row.slug ?? (slugify(row.name || "") || `server-${guildId.slice(-6)}`);
    if (!row.slug) {
      const [taken] = await db.select({ guildId: schema.discordGuilds.guildId })
        .from(schema.discordGuilds).where(eq(schema.discordGuilds.slug, slug)).limit(1);
      if (taken && taken.guildId !== guildId) slug = `${slug}-${guildId.slice(-4)}`;
    }
    const key = row.portalKey ?? newPortalKey();
    await db.update(schema.discordGuilds).set({ slug, portalKey: key })
      .where(eq(schema.discordGuilds.guildId, guildId));
    return { slug, key };
  } catch { return null; }
}

// Staff rotating a compromised key.
export async function rotatePortalKey(guildId: string): Promise<string | null> {
  try {
    const db = await getDb();
    const key = newPortalKey();
    await db.update(schema.discordGuilds).set({ portalKey: key })
      .where(eq(schema.discordGuilds.guildId, guildId));
    return key;
  } catch { return null; }
}

// ===== Analytics =====

// One event on a server's public challenge page. Recorded fire-and-forget:
// analytics must never be able to break a page render.
export async function recordServerEvent(
  guildId: string,
  type: "challenge_view" | "invite_click" | "member_joined",
  opts: { challengeId?: string | null; userId?: string | null; sessionId?: string | null } = {},
): Promise<void> {
  if (!guildId) return;
  try {
    const db = await getDb();
    await db.insert(schema.serverEvents).values({
      id: uid(), guildId, type,
      challengeId: opts.challengeId ?? null,
      userId: opts.userId ?? null,
      sessionId: opts.sessionId ?? null,
    });
  } catch { /* non-fatal */ }
}

export type FunnelRow = { challengeId: string | null; views: number; inviteClicks: number; joined: number };

// The value exchange, per challenge: people looked, people clicked through to
// your invite, people joined you. That's what a server gets out of putting a
// competition on Cluster, and it should be measured rather than asserted.
export async function serverFunnel(guildId: string, days = 30): Promise<{ totals: FunnelRow; byChallenge: FunnelRow[] }> {
  const empty: FunnelRow = { challengeId: null, views: 0, inviteClicks: 0, joined: 0 };
  try {
    const db = await getDb();
    const since = new Date(Date.now() - days * 86400000);
    const rows = await db.select({
      challengeId: schema.serverEvents.challengeId,
      type: schema.serverEvents.type,
      n: sql<number>`count(*)`,
    })
      .from(schema.serverEvents)
      .where(and(eq(schema.serverEvents.guildId, guildId), sql`${schema.serverEvents.createdAt} >= ${since}`))
      .groupBy(schema.serverEvents.challengeId, schema.serverEvents.type);

    const byId = new Map<string, FunnelRow>();
    const totals = { ...empty };
    for (const r of rows) {
      const key = r.challengeId ?? "—";
      const row = byId.get(key) ?? { challengeId: r.challengeId, views: 0, inviteClicks: 0, joined: 0 };
      const n = Number(r.n ?? 0);
      if (r.type === "challenge_view") { row.views += n; totals.views += n; }
      else if (r.type === "invite_click") { row.inviteClicks += n; totals.inviteClicks += n; }
      else if (r.type === "member_joined") { row.joined += n; totals.joined += n; }
      byId.set(key, row);
    }
    return { totals, byChallenge: [...byId.values()].sort((a, b) => b.views - a.views) };
  } catch { return { totals: empty, byChallenge: [] }; }
}

// ===== The board =====

export type BoardRow = {
  guildId: string; slug: string | null; name: string; iconUrl: string | null;
  linked: number; challenges: number; tier: Tier; rank: number;
};

// Every server, ranked by the number that actually matters: how many gamers
// they brought to Cluster. Owners see where they stand, which is the entire
// point of a leaderboard.
export async function serverBoard(limit = 100): Promise<BoardRow[]> {
  try {
    const db = await getDb();
    const guilds = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.status, "active")).limit(limit);

    const counts = await db.select({
      guildId: schema.discordGuildMembers.guildId,
      linked: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
    }).from(schema.discordGuildMembers).groupBy(schema.discordGuildMembers.guildId);
    const linkedBy = new Map(counts.map((c) => [c.guildId, Number(c.linked ?? 0)]));

    const challenges = await db.select({ guildId: schema.challenges.guildId, n: sql<number>`count(*)` })
      .from(schema.challenges).groupBy(schema.challenges.guildId);
    const chBy = new Map(challenges.map((c) => [c.guildId ?? "", Number(c.n ?? 0)]));

    return guilds
      .map((g) => {
        const linked = linkedBy.get(g.guildId) ?? 0;
        return {
          guildId: g.guildId,
          slug: g.slug,
          name: g.name || g.guildId,
          iconUrl: g.iconUrl,
          linked,
          challenges: chBy.get(g.guildId) ?? 0,
          tier: tierFor(linked).current,
          rank: 0,
        };
      })
      .sort((a, b) => b.linked - a.linked || b.challenges - a.challenges)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  } catch { return []; }
}

// Everything one portal renders.
export type PortalData = {
  server: PortalServer;
  stats: GuildStats;
  tier: ReturnType<typeof tierFor>;
  badges: ReturnType<typeof badgesFor>;
  funnel: Awaited<ReturnType<typeof serverFunnel>>;
  rank: number;
  totalServers: number;
};

export async function portalData(server: PortalServer): Promise<PortalData | null> {
  const stats = await guildStats(server.guildId);
  if (!stats) return null;
  const [funnel, board, challenges] = await Promise.all([
    serverFunnel(server.guildId),
    serverBoard(),
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.select({ id: schema.challenges.id })
          .from(schema.challenges).where(eq(schema.challenges.guildId, server.guildId));
        return rows.length;
      } catch { return 0; }
    })(),
  ]);
  const me = board.find((b) => b.guildId === server.guildId);
  return {
    server,
    stats,
    tier: tierFor(stats.linked),
    badges: badgesFor(stats.linked, challenges),
    funnel,
    rank: me?.rank ?? board.length + 1,
    totalServers: board.length,
  };
}

// Commands run by this server's members — the owner's view of what their
// community actually does with the bot.
export async function serverCommandFeed(guildId: string, limit = 30) {
  try {
    const db = await getDb();
    return db.select({
      command: schema.discordCommandLogs.command,
      screen: schema.discordCommandLogs.screen,
      arg: schema.discordCommandLogs.arg,
      createdAt: schema.discordCommandLogs.createdAt,
      displayName: schema.users.displayName,
      slug: schema.users.slug,
    })
      .from(schema.discordCommandLogs)
      .leftJoin(schema.users, eq(schema.discordCommandLogs.userId, schema.users.id))
      .where(eq(schema.discordCommandLogs.guildId, guildId))
      .orderBy(desc(schema.discordCommandLogs.createdAt))
      .limit(limit);
  } catch { return []; }
}
