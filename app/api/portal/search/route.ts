import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

// Find your own portal by typing its name.
//
// A brand contact knows their company's name and nothing else about our URL
// scheme; making them find a slug is the reason "where do I log in" is a
// support email. So the login page has a search box.
//
// It deliberately does NOT list. Two characters minimum, matches only, capped
// at ten: the customer list is not something to publish, and an endpoint that
// answers the empty query with every brand we work with is exactly that. It
// also never returns the key, the contact email or anything else — only the
// name and the slug the login form needs to post.
const MIN_QUERY = 2;
const LIMIT = 10;

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") === "server" ? "server" : "brand";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) return NextResponse.json({ results: [] });

  const like = `%${q.replace(/[%_]/g, "")}%`;
  try {
    const db = await getDb();
    if (kind === "server") {
      const rows = await db.select({
        name: schema.discordGuilds.name,
        slug: schema.discordGuilds.slug,
        guildId: schema.discordGuilds.guildId,
        iconUrl: schema.discordGuilds.iconUrl,
      }).from(schema.discordGuilds)
        .where(and(eq(schema.discordGuilds.status, "active"), ilike(schema.discordGuilds.name, like)))
        .limit(LIMIT);
      return NextResponse.json({
        results: rows.map((r) => ({ name: r.name, slug: r.slug ?? r.guildId, imageUrl: r.iconUrl })),
      });
    }

    const rows = await db.select({
      name: schema.brands.name,
      slug: schema.brands.slug,
      id: schema.brands.id,
      logoUrl: schema.brands.logoUrl,
    }).from(schema.brands)
      .where(and(eq(schema.brands.status, "active"), ilike(schema.brands.name, like)))
      .limit(LIMIT);
    return NextResponse.json({
      results: rows.map((r) => ({ name: r.name, slug: r.slug ?? r.id, imageUrl: r.logoUrl })),
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
