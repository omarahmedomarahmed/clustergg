import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { ADAPTERS } from "@/lib/providers/adapters";
import { getProvider, isProviderLive } from "@/lib/providers/registry";
import { syncAccount } from "@/lib/sync";
import { evaluateBadgesForUser } from "@/lib/badges";
import { awardQuestAction } from "@/lib/quests";
import { announceAccountLinked } from "@/lib/discord/announce";

// Linking a game account, in one place.
//
// The website links through a server action with a cookie session; the Discord
// bot links on behalf of a gamer it identified by their Discord snowflake. Both
// must verify against the provider API, snapshot the first sync and award the
// same CP — otherwise a Discord link would be a second-class account.

export type LinkResult =
  | { ok: true; accountId: string; game: string; name: string }
  | { ok: false; error: string };

export async function linkGameAccountFor(
  userId: string,
  providerId: string,
  identifier: string,
  region?: string,
): Promise<LinkResult> {
  const provider = getProvider(providerId);
  const adapter = ADAPTERS[providerId];
  if (!provider || !adapter) return { ok: false, error: "Unknown provider." };
  if (!identifier.trim()) return { ok: false, error: `Enter your ${provider.identifierLabel}.` };
  if (!isProviderLive(provider)) {
    return { ok: false, error: `${provider.name} needs ${provider.envVars.join(" + ")} configured by the platform admin.` };
  }

  // The account has to actually exist — this is what makes Cluster stats real
  // rather than self-reported.
  const verified = await adapter.verify(identifier.trim(), region);
  if (!verified.ok) return { ok: false, error: verified.error };

  const db = await getDb();
  const [existing] = await db.select().from(schema.linkedGameAccounts).where(and(
    eq(schema.linkedGameAccounts.userId, userId),
    eq(schema.linkedGameAccounts.provider, providerId),
    eq(schema.linkedGameAccounts.providerAccountId, verified.accountId),
  )).limit(1);
  if (existing) return { ok: false, error: "That account is already linked." };

  const id = uid();
  await db.insert(schema.linkedGameAccounts).values({
    id, userId, provider: providerId,
    providerAccountId: verified.accountId, inGameName: verified.name,
    region: verified.region ?? region ?? null, verified: true, syncStatus: "pending",
  });

  const [account] = await db.select().from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.id, id)).limit(1);
  if (account) await syncAccount(db, account);
  try { await evaluateBadgesForUser(db, userId); } catch { /* non-fatal */ }
  await awardQuestAction(db, userId, "connect_account", { refType: "account", refId: id });

  // Never awaited into the result — a failed announcement must not fail a link.
  void announceAccountLinked(userId, provider.game).catch(() => {});

  return { ok: true, accountId: id, game: provider.game, name: verified.name };
}
