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
