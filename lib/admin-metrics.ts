import { count, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { MetricKey } from "@/lib/admin-nav";

// Every number the admin side reports, from one query pass.
//
// Each console used to count its own rows on its own page, so the dashboard
// couldn't show a total without duplicating the query, and no two pages agreed
// on what "users" meant. One loader, one definition per metric, and both the
// command centre and the analytics page read from it.

export type MetricDef = {
  key: MetricKey;
  label: string;
  /** What this number actually counts. Shown on the analytics page and in the
   *  exported report, because a metric without a definition is a rumour. */
  definition: string;
  group: "growth" | "discord" | "competition" | "revenue" | "content";
  /** Where to go to act on it. */
  href?: string;
  /** Higher is better? Used only for how a delta is coloured. */
  goodWhenUp?: boolean;
};

export const METRICS: MetricDef[] = [
  { key: "users", label: "Gamers", definition: "Every user row. A Discord user is created the first time they run a bot command, so this counts bot users too.", group: "growth", href: "/admin/users", goodWhenUp: true },
  { key: "linkedAccounts", label: "Linked game accounts", definition: "Rows in linked_game_accounts — one per game account a gamer has connected. This is the number advertisers care about.", group: "growth", href: "/admin/linked-accounts", goodWhenUp: true },
  { key: "syncErrors", label: "Accounts failing sync", definition: "Linked accounts whose last sync errored. Each one is a gamer whose stats are stale.", group: "growth", href: "/admin/linked-accounts" },
  { key: "posts", label: "Posts", definition: "Feed posts that haven't been deleted.", group: "content", goodWhenUp: true },

  { key: "guilds", label: "Servers running the bot", definition: "Discord servers with the bot installed and not removed.", group: "discord", href: "/admin/discord", goodWhenUp: true },
  { key: "guildMembers", label: "Reach", definition: "Combined member count of every server running the bot — the audience the bot can address.", group: "discord", href: "/admin/discord", goodWhenUp: true },
  { key: "botCommands", label: "Bot interactions", definition: "Every logged slash command and button press, across all servers.", group: "discord", href: "/admin/discord/analytics", goodWhenUp: true },
  { key: "challengeRequests", label: "Challenge requests waiting", definition: "Server owners who asked to run a challenge and are waiting on our review.", group: "discord", href: "/admin/discord/requests" },
  { key: "serverMessages", label: "Servers waiting on a reply", definition: "Server owners who wrote to us and haven't been answered. Counted per server, not per message — one owner asking three things is one conversation.", group: "discord", href: "/admin/messages" },

  { key: "games", label: "Games", definition: "Active games in the catalog.", group: "content", href: "/admin/games" },
  { key: "planets", label: "Planets", definition: "Active planets — one per game.", group: "content", href: "/admin/spaces" },
  { key: "planetRequests", label: "Planet requests waiting", definition: "Gamers asking for a game we don't carry yet.", group: "content", href: "/admin/spaces/requests" },

  { key: "challenges", label: "Live challenges", definition: "Challenges with status active.", group: "competition", href: "/admin/challenges", goodWhenUp: true },
  { key: "quests", label: "Quests", definition: "Active quests.", group: "competition", href: "/admin/quests" },
  { key: "leaderboards", label: "Leaderboards", definition: "Active boards. A game can run several — this counts all of them.", group: "competition", href: "/admin/leaderboards" },
  { key: "trophies", label: "Trophies awarded", definition: "Trophies handed to winners.", group: "competition", href: "/admin/trophies", goodWhenUp: true },
  { key: "redeems", label: "Redemptions waiting", definition: "Winners asking to cash a trophy in. Each is money we owe.", group: "competition", href: "/admin/redeems" },

  { key: "brandEnquiries", label: "New enquiries", definition: "Brands who asked to buy and have not been contacted yet. Each one is a reply we owe.", group: "revenue", href: "/admin/brand-enquiries", goodWhenUp: true },
  { key: "brands", label: "Brands", definition: "Advertisers with a portal.", group: "revenue", href: "/admin/brands", goodWhenUp: true },
  { key: "creatives", label: "Creatives", definition: "Ad artwork loaded and ready to run.", group: "revenue", href: "/admin/creatives" },
  { key: "placements", label: "Placements", definition: "Slots a creative can appear in.", group: "revenue", href: "/admin/placements" },
  { key: "adImpressions", label: "Ad impressions", definition: "Every time a creative was rendered to someone.", group: "revenue", href: "/admin/ads/analytics", goodWhenUp: true },
  { key: "adClicks", label: "Ad clicks", definition: "Every click on a creative.", group: "revenue", href: "/admin/ads/analytics", goodWhenUp: true },

  { key: "images", label: "Cached cards", definition: "Rendered cards held in Blob and reused instead of re-rendered — the bot's whole speed story.", group: "content", href: "/admin/storage" },
];

export type Metrics = Record<MetricKey, number>;

const ZERO = Object.fromEntries(METRICS.map((m) => [m.key, 0])) as Metrics;

// `since` narrows the time-bounded metrics (interactions, impressions, clicks,
// posts). The stock counts — how many games exist — ignore it, because "games
// created in the last 7 days" is not a useful reading of that number.
export async function loadMetrics(since?: Date): Promise<Metrics> {
  const out: Metrics = { ...ZERO };
  try {
    const db = await getDb();
    const one = async (key: MetricKey, run: () => Promise<{ c: number | string }[]>) => {
      try { out[key] = Number((await run())[0]?.c ?? 0); } catch { /* leave at 0 */ }
    };
    await Promise.all([
      one("users", () => db.select({ c: count() }).from(schema.users)),
      one("linkedAccounts", () => db.select({ c: count() }).from(schema.linkedGameAccounts)),
      one("syncErrors", () => db.select({ c: count() }).from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.syncStatus, "error"))),
      one("posts", () => db.select({ c: count() }).from(schema.posts).where(sql`${schema.posts.deletedAt} IS NULL`)),

      one("guilds", () => db.select({ c: count() }).from(schema.discordGuilds).where(sql`${schema.discordGuilds.removedAt} IS NULL`)),
      one("guildMembers", () => db.select({ c: sql<number>`coalesce(sum(${schema.discordGuilds.memberCount}), 0)` })
        .from(schema.discordGuilds).where(sql`${schema.discordGuilds.removedAt} IS NULL`)),
      one("botCommands", () => since
        ? db.select({ c: count() }).from(schema.discordCommandLogs).where(gte(schema.discordCommandLogs.createdAt, since))
        : db.select({ c: count() }).from(schema.discordCommandLogs)),
      one("challengeRequests", () => db.select({ c: count() }).from(schema.challengeRequests).where(eq(schema.challengeRequests.status, "pending"))),
      // Per SERVER rather than per message: three questions from one owner is
      // one conversation to answer, and a badge that counts messages makes a
      // chatty owner look like a backlog.
      one("serverMessages", () => db
        .select({ c: sql<number>`count(distinct ${schema.serverMessages.guildId})` })
        .from(schema.serverMessages)
        .where(sql`${schema.serverMessages.sender} = 'owner' and ${schema.serverMessages.readByAdmin} = false`)),

      one("games", () => db.select({ c: count() }).from(schema.games).where(eq(schema.games.isActive, true))),
      one("planets", () => db.select({ c: count() }).from(schema.spaces).where(eq(schema.spaces.isActive, true))),
      one("planetRequests", () => db.select({ c: count() }).from(schema.spaceRequests).where(eq(schema.spaceRequests.status, "pending"))),

      one("challenges", () => db.select({ c: count() }).from(schema.challenges).where(eq(schema.challenges.status, "active"))),
      one("quests", () => db.select({ c: count() }).from(schema.quests).where(eq(schema.quests.isActive, true))),
      one("leaderboards", () => db.select({ c: count() }).from(schema.leaderboards).where(eq(schema.leaderboards.isActive, true))),
      one("trophies", () => db.select({ c: count() }).from(schema.userTrophies)),
      one("redeems", () => db.select({ c: count() }).from(schema.trophyRedeems).where(eq(schema.trophyRedeems.status, "pending"))),

      one("brandEnquiries", () => db.select({ c: count() }).from(schema.brandEnquiries).where(eq(schema.brandEnquiries.status, "new"))),
      one("brands", () => db.select({ c: count() }).from(schema.brands)),
      one("creatives", () => db.select({ c: count() }).from(schema.adCampaignCreatives)),
      one("placements", () => db.select({ c: count() }).from(schema.adPlacements)),
      one("adImpressions", () => since
        ? db.select({ c: count() }).from(schema.adImpressions).where(gte(schema.adImpressions.createdAt, since))
        : db.select({ c: count() }).from(schema.adImpressions)),
      one("adClicks", () => since
        ? db.select({ c: count() }).from(schema.adClicks).where(gte(schema.adClicks.createdAt, since))
        : db.select({ c: count() }).from(schema.adClicks)),

      one("images", () => db.select({ c: count() }).from(schema.cardRenders)),
    ]);
  } catch { /* an admin page with zeroes beats an admin page with a stack trace */ }
  return out;
}

// The two-sided read every metric page wants: the number now, and the number
// over a window, so a total can be shown next to its recent movement.
export async function metricsWithWindow(days: number): Promise<{ total: Metrics; window: Metrics; days: number }> {
  const since = new Date(Date.now() - days * 86400000);
  const [total, win] = await Promise.all([loadMetrics(), loadMetrics(since)]);
  return { total, window: win, days };
}

// Anything with a queue behind it, so "what needs me today" is one read rather
// than a tour of eight pages.
export function attentionOf(m: Metrics): { label: string; value: number; href: string; tone: "warn" | "danger" }[] {
  return [
    { label: "challenge requests waiting", value: m.challengeRequests, href: "/admin/discord/requests", tone: "warn" as const },
    { label: "trophy redemptions waiting", value: m.redeems, href: "/admin/redeems", tone: "warn" as const },
    { label: "planet requests waiting", value: m.planetRequests, href: "/admin/spaces/requests", tone: "warn" as const },
    { label: "accounts failing sync", value: m.syncErrors, href: "/admin/linked-accounts", tone: "danger" as const },
  ].filter((r) => r.value > 0);
}
