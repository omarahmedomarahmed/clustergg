// Finding the person you meant to send a trophy to (B5.1, inside B49).
//
// The gift box asked for a "profile name" in a plain text input. A typo was a
// rejected purchase at best; the name of a REAL DIFFERENT GAMER was a trophy on
// a stranger's profile with no way back, because a gift has no refund path and
// should not have one — the trophy is already on their profile and is already
// redeemable for cash.
//
// So the fix is not better error copy. It is: you pick a person from a list,
// you see their face and their name, and only then do points move.
//
// This is a deliberately NARROWER search than `searchGamers`, which the bot
// uses. Two rules it adds:
//
//   1. **Only public profiles.** Somebody who set their profile to followers or
//      private opted out of being findable, and a gift box is a people
//      directory however friendly it looks. They can still be gifted — by
//      someone who knows their exact @slug, which is the thing you only have if
//      they gave it to you.
//   2. **Public fields only, and never an email.** Name, slug, avatar, and the
//      Discord handle they chose to display. Nothing here is anything a profile
//      page does not already show to a signed-out visitor.

import { and, eq, ilike, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type GiftCandidate = {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  discordUsername: string | null;
  /** Why this row matched, so the list can say so rather than look arbitrary. */
  matchedOn: "name" | "profile" | "Discord";
};

/** Below this, a query matches most of the platform and means nothing. */
export const MIN_QUERY = 2;
export const MAX_RESULTS = 8;

export async function giftSearch(
  query: string,
  opts: { excludeUserId?: string | null; limit?: number } = {},
): Promise<GiftCandidate[]> {
  const q = query.trim().replace(/^@/, "");
  if (q.length < MIN_QUERY) return [];
  const limit = Math.min(opts.limit ?? MAX_RESULTS, MAX_RESULTS);

  try {
    const db = await getDb();
    const like = `%${q}%`;
    const rows = await db.select({
      id: schema.users.id,
      slug: schema.users.slug,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      coverUrl: schema.users.bannerUrl,   // the profile cover art (B49 confirms the PERSON)
      discordUsername: schema.users.discordUsername,
    }).from(schema.users)
      .where(and(
        eq(schema.users.status, "active"),
        eq(schema.users.profileVisibility, "public"),
        // You cannot gift yourself — `buyTrophy` already treats it as a
        // self-purchase, so offering it here would be offering a no-op.
        opts.excludeUserId ? ne(schema.users.id, opts.excludeUserId) : undefined,
        or(
          ilike(schema.users.displayName, like),
          ilike(schema.users.slug, like),
          ilike(schema.users.discordUsername, like),
        ),
      ))
      // A prefix match is what you meant; a substring match is what you might
      // have meant. Ordered so typing "no" puts Nova above Techno.
      .orderBy(sql`case when lower(${schema.users.displayName}) like lower(${q + "%"}) then 0
                       when lower(${schema.users.slug}) like lower(${q + "%"}) then 1
                       else 2 end`, schema.users.displayName)
      .limit(limit);

    const needle = q.toLowerCase();
    return rows.map((r) => ({
      slug: r.slug,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      coverUrl: r.coverUrl,
      discordUsername: r.discordUsername,
      matchedOn:
        r.displayName.toLowerCase().includes(needle) ? "name"
        : r.slug.toLowerCase().includes(needle) ? "profile"
        : "Discord",
    }));
  } catch { return []; }
}

/**
 * The one person a gift is about to go to.
 *
 * Read again at CONFIRM rather than trusted from the list the browser is
 * holding: the list was rendered at some point in the past, and the thing it
 * decides is irreversible.
 */
export async function giftRecipient(slug: string): Promise<GiftCandidate | null> {
  const cleaned = slug.trim().replace(/^@/, "");
  if (!cleaned) return null;
  try {
    const db = await getDb();
    const [row] = await db.select({
      slug: schema.users.slug,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      coverUrl: schema.users.bannerUrl,   // the profile cover art (B49 confirms the PERSON)
      discordUsername: schema.users.discordUsername,
      status: schema.users.status,
    }).from(schema.users).where(eq(schema.users.slug, cleaned)).limit(1);
    // By EXACT slug, and visibility is not checked here on purpose: knowing
    // somebody's exact profile link is the thing you only have if they gave it
    // to you, so a private profile can still be gifted by a friend. It just is
    // not enumerable from the search box above.
    if (!row || row.status !== "active") return null;
    return { ...row, matchedOn: "profile" };
  } catch { return null; }
}
