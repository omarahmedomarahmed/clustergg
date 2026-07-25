import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// The join between a Discord user and a Cluster account.
//
// Nothing new is needed here: signing in with Discord already writes an
// `oauth_identities` row with provider="discord" and providerUserId set to the
// Discord snowflake. That snowflake is exactly what every interaction hands us,
// so the bot recognises someone the moment they've signed in on the web once.

export type LinkedGamer = {
  userId: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
};

export async function gamerForDiscordId(discordId: string): Promise<LinkedGamer | null> {
  try {
    const db = await getDb();
    const [row] = await db.select({
      userId: schema.users.id,
      slug: schema.users.slug,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
    })
      .from(schema.oauthIdentities)
      .innerJoin(schema.users, eq(schema.oauthIdentities.userId, schema.users.id))
      .where(and(eq(schema.oauthIdentities.provider, "discord"), eq(schema.oauthIdentities.providerUserId, discordId)))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

// Where we send someone who isn't linked yet. `next` returns them to the page
// that prompted the sign-in, so a Discord click lands somewhere useful.
export function signInUrl(site: string, next = "/feed"): string {
  return `${site}/api/auth/discord?next=${encodeURIComponent(next)}`;
}

// Using the bot IS the sign-up.
//
// Requiring a trip to the website before someone can see their own card is the
// single biggest drop-off in the funnel, and it buys nothing: the interaction
// Discord just sent us is signed, and it carries the same snowflake, handle and
// avatar the OAuth callback would have. So the first `/cluster` creates the
// profile there and then.
//
// The row is identical to one made by Discord sign-in — same
// `oauth_identities` join key — so when they do visit the site and continue
// with Discord, they land in the account they already have rather than a
// duplicate. No session is created here; this grants an identity, not a login.
export async function ensureGamerForDiscord(
  discordId: string,
  handle: string,
  avatarUrl?: string | null,
): Promise<LinkedGamer | null> {
  const existing = await gamerForDiscordId(discordId);
  if (existing) return existing;

  try {
    const db = await getDb();
    const { uid, slugify } = await import("@/lib/utils");
    const name = (handle || "").trim() || `gamer-${discordId.slice(-5)}`;

    let slug = slugify(name) || `gamer-${uid().slice(0, 5).toLowerCase()}`;
    const [taken] = await db.select({ id: schema.users.id })
      .from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
    if (taken) slug = `${slug}-${uid().slice(0, 4).toLowerCase()}`;

    const userId = uid();
    await db.insert(schema.users).values({
      id: userId,
      displayName: name,
      slug,
      avatarUrl: avatarUrl ?? null,
      role: "user",
      primarySignupProvider: "discord",
      discordUsername: name,
      isVerified: true,
    });
    await db.insert(schema.oauthIdentities).values({
      id: uid(), userId, provider: "discord", providerUserId: discordId,
    }).onConflictDoNothing();

    // Losing this race means someone else created the same identity a moment
    // ago; read it back rather than returning the row we may have lost.
    return (await gamerForDiscordId(discordId)) ?? {
      userId, slug, displayName: name, avatarUrl: avatarUrl ?? null,
    };
  } catch { return null; }
}

// The avatar URL for a Discord user, from the fields an interaction carries.
export function discordAvatarUrl(id: string, avatar?: string | null): string | null {
  return avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=256` : null;
}
