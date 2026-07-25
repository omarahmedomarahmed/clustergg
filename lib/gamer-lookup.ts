import { and, eq, ilike, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getProvider, PROVIDERS } from "@/lib/providers/registry";

// Finding a gamer by something a human would actually type.
//
// Nobody knows another player's Cluster slug. They know the tag they see in
// game ("hikaru"), or a Discord handle. This resolves all of those to a Cluster
// account, and it is shared by the bot's `/cluster show <game> <tag>` and by
// the website's search — so the same query works in both places.

export type FoundGamer = {
  userId: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  matchedOn: "in-game name" | "Discord" | "Cluster name";
  game?: string | null;
  inGameName?: string | null;
};

// All providers that back a given game name (Chess has two, for instance).
function providerIdsForGame(game: string): string[] {
  const needle = game.trim().toLowerCase();
  return PROVIDERS
    .filter((p) => p.game.toLowerCase() === needle || p.name.toLowerCase() === needle || p.id === needle)
    .map((p) => p.id);
}

// `/cluster show valorant SomeTag` — a specific game account, anywhere on the
// platform, not just in the caller's own server.
export async function findByInGameName(game: string, tag: string): Promise<FoundGamer | null> {
  const cleaned = tag.trim();
  if (!cleaned) return null;
  try {
    const db = await getDb();
    const providerIds = providerIdsForGame(game);

    const rows = await db.select({
      userId: schema.users.id, slug: schema.users.slug, displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl, provider: schema.linkedGameAccounts.provider,
      inGameName: schema.linkedGameAccounts.inGameName,
    })
      .from(schema.linkedGameAccounts)
      .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
      .where(and(
        eq(schema.users.status, "active"),
        or(
          // Exact first, then a prefix — riot IDs carry a #tag people often drop.
          ilike(schema.linkedGameAccounts.inGameName, cleaned),
          ilike(schema.linkedGameAccounts.inGameName, `${cleaned}#%`),
        ),
      ))
      .limit(25);

    const scoped = providerIds.length ? rows.filter((r) => providerIds.includes(r.provider)) : rows;
    const hit = scoped[0] ?? rows[0];
    if (!hit) return null;
    return {
      userId: hit.userId, slug: hit.slug, displayName: hit.displayName, avatarUrl: hit.avatarUrl,
      matchedOn: "in-game name",
      game: getProvider(hit.provider)?.game ?? null,
      inGameName: hit.inGameName,
    };
  } catch { return null; }
}

// `/cluster show discord <handle>` — the whole profile behind a Discord name.
export async function findByDiscordName(handle: string): Promise<FoundGamer | null> {
  const cleaned = handle.trim().replace(/^@/, "");
  if (!cleaned) return null;
  try {
    const db = await getDb();
    // A raw snowflake is exact; anything else matches the stored handle.
    const isSnowflake = /^\d{15,25}$/.test(cleaned);
    if (isSnowflake) {
      const [row] = await db.select({
        userId: schema.users.id, slug: schema.users.slug,
        displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl,
      })
        .from(schema.oauthIdentities)
        .innerJoin(schema.users, eq(schema.oauthIdentities.userId, schema.users.id))
        .where(and(
          eq(schema.oauthIdentities.provider, "discord"),
          eq(schema.oauthIdentities.providerUserId, cleaned),
        )).limit(1);
      return row ? { ...row, matchedOn: "Discord" } : null;
    }

    const [row] = await db.select({
      userId: schema.users.id, slug: schema.users.slug,
      displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl,
    })
      .from(schema.users)
      .where(and(eq(schema.users.status, "active"), ilike(schema.users.discordUsername, cleaned)))
      .limit(1);
    return row ? { ...row, matchedOn: "Discord" } : null;
  } catch { return null; }
}

// One search box, every identity a gamer has. Used by the website's search page
// so "hikaru" finds the person, not nothing.
export async function searchGamers(query: string, limit = 20): Promise<FoundGamer[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const db = await getDb();
    const like = `%${q}%`;

    const [byName, byAccount] = await Promise.all([
      db.select({
        userId: schema.users.id, slug: schema.users.slug, displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl, discordUsername: schema.users.discordUsername,
      })
        .from(schema.users)
        .where(and(
          eq(schema.users.status, "active"),
          or(
            ilike(schema.users.displayName, like),
            ilike(schema.users.slug, like),
            ilike(schema.users.discordUsername, like),
          ),
        ))
        .limit(limit),
      db.select({
        userId: schema.users.id, slug: schema.users.slug, displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl, provider: schema.linkedGameAccounts.provider,
        inGameName: schema.linkedGameAccounts.inGameName,
      })
        .from(schema.linkedGameAccounts)
        .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
        .where(and(
          eq(schema.users.status, "active"),
          ilike(schema.linkedGameAccounts.inGameName, like),
        ))
        .limit(limit),
    ]);

    const out = new Map<string, FoundGamer>();
    // Game-account matches rank first: if you typed an in-game name, that's who
    // you meant.
    for (const r of byAccount) {
      out.set(r.userId, {
        userId: r.userId, slug: r.slug, displayName: r.displayName, avatarUrl: r.avatarUrl,
        matchedOn: "in-game name", game: getProvider(r.provider)?.game ?? null, inGameName: r.inGameName,
      });
    }
    for (const r of byName) {
      if (out.has(r.userId)) continue;
      out.set(r.userId, {
        userId: r.userId, slug: r.slug, displayName: r.displayName, avatarUrl: r.avatarUrl,
        matchedOn: r.discordUsername && r.discordUsername.toLowerCase().includes(q.toLowerCase()) ? "Discord" : "Cluster name",
      });
    }
    return [...out.values()].slice(0, limit);
  } catch { return []; }
}

// Autocomplete source for `/cluster show`: in-game names for one game.
export async function inGameNameChoices(game: string, q: string, limit = 20): Promise<{ name: string; value: string }[]> {
  try {
    const db = await getDb();
    const providerIds = providerIdsForGame(game);
    if (!providerIds.length) return [];
    const rows = await db.select({
      inGameName: schema.linkedGameAccounts.inGameName,
      displayName: schema.users.displayName,
      provider: schema.linkedGameAccounts.provider,
    })
      .from(schema.linkedGameAccounts)
      .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
      .where(and(
        eq(schema.users.status, "active"),
        q ? ilike(schema.linkedGameAccounts.inGameName, `%${q}%`) : sql`true`,
      ))
      .limit(100);
    return rows
      .filter((r) => providerIds.includes(r.provider))
      .slice(0, limit)
      .map((r) => ({ name: `${r.inGameName} · ${r.displayName}`.slice(0, 100), value: r.inGameName.slice(0, 100) }));
  } catch { return []; }
}
