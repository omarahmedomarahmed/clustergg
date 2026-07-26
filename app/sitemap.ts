import type { MetadataRoute } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { POSTS } from "@/lib/blog";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://clustergg.com";

// Every page worth indexing, generated from the database rather than a list
// someone has to remember to update.
//
// Two rules: nothing behind auth (a crawler gets a redirect, which costs
// crawl budget and teaches Google the URL is worthless), and nothing that
// needs a key. Profiles, planets, challenges and server pages are public by
// design — they're what people share.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const statics: MetadataRoute.Sitemap = ([
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/discord-bot`, changeFrequency: "weekly", priority: 0.95 },
    { url: `${SITE}/servers`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/planets`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/leaderboards`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/quests`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/login`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/signup`, changeFrequency: "yearly", priority: 0.4 },
  ] as const).map((e) => ({ ...e, lastModified: now }));

  const blog: MetadataRoute.Sitemap = POSTS.map((p) => ({
    url: `${SITE}/blog/${p.slug}`,
    lastModified: new Date(p.updated ?? p.published),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const dynamicEntries: MetadataRoute.Sitemap = [];
  try {
    const db = await getDb();
    const [planets, profiles, servers, quests] = await Promise.all([
      db.select({ slug: schema.spaces.slug }).from(schema.spaces)
        .where(eq(schema.spaces.isActive, true)).limit(200),
      // Public profiles only, most-seen first — a crawler that stops early
      // should have taken the pages people actually look at.
      // Only profiles set to public. "followers" and "private" both mean a
      // crawler would get a page the owner didn't choose to publish.
      db.select({ slug: schema.users.slug, created: schema.users.createdAt })
        .from(schema.users)
        .where(eq(schema.users.profileVisibility, "public"))
        .orderBy(desc(schema.users.profileViews)).limit(2000),
      db.select({ slug: schema.discordGuilds.slug }).from(schema.discordGuilds)
        .where(sql`${schema.discordGuilds.removedAt} IS NULL AND ${schema.discordGuilds.slug} IS NOT NULL`).limit(500),
      db.select({ key: schema.quests.key }).from(schema.quests)
        .where(eq(schema.quests.isActive, true)).limit(50),
    ]);

    for (const p of planets) {
      dynamicEntries.push({ url: `${SITE}/planets/${p.slug}`, lastModified: now, changeFrequency: "daily", priority: 0.7 });
    }
    for (const u of profiles) {
      dynamicEntries.push({ url: `${SITE}/u/${u.slug}`, lastModified: u.created ?? now, changeFrequency: "weekly", priority: 0.5 });
    }
    for (const s of servers) {
      if (s.slug) dynamicEntries.push({ url: `${SITE}/servers/${s.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
    }
    for (const q of quests) {
      dynamicEntries.push({ url: `${SITE}/quests/${q.key}`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
    }
  } catch { /* a partial sitemap beats a 500 */ }

  return [...statics, ...blog, ...dynamicEntries];
}
