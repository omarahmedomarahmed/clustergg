import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { ADAPTERS } from "@/lib/providers/adapters";
import { getProvider, isProviderLive } from "@/lib/providers/registry";
import { syncAccount } from "@/lib/sync";
import { awardQuestAction } from "@/lib/quests";
import { announceAccountLinked } from "@/lib/discord/announce";
import { markMemberLinked } from "@/lib/discord/guilds";
import { accountHeldByOther, conflictMessage, proofFor } from "@/lib/account-ownership";

// Linking a game account, in one place.
//
// The website links through a server action with a cookie session; the Discord
// bot links on behalf of a gamer it identified by their Discord snowflake. Both
// must verify against the provider API, snapshot the first sync and award the
// same CP — otherwise a Discord link would be a second-class account.

export type LinkResult =
  | {
    ok: true; accountId: string; game: string; name: string;
    /** True only when we PROVED ownership, not merely that the account exists. */
    proven: boolean;
    /** Set when the game offers a proof the gamer still has to complete. */
    proofAvailable: boolean;
  }
  | { ok: false; error: string; conflict?: boolean };

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

  // One game account, one gamer.
  //
  // The unique index was on (user_id, provider, account_id) — unique PER USER —
  // so two Cluster gamers could hold the same Riot account, both enter the same
  // challenge on it, and both be paid for the same week of play. Checked here
  // as well as in the database because the message a person reads matters:
  // "someone else has this" is actionable, a constraint violation is not.
  const conflict = await accountHeldByOther(db, providerId, verified.accountId, userId);
  if (conflict) {
    // The provider id goes with it: which action we can honestly offer depends
    // on whether this game has a sign-in that proves ownership (G7).
    return { ok: false, conflict: true, error: conflictMessage(conflict, provider.game, providerId) };
  }

  // What we actually know at this moment.
  //
  // `adapter.verify()` proved the account EXISTS. It did not prove this person
  // owns it, and writing `verified: true` here — which is what used to happen —
  // put a verification tick on an unproven claim across the whole product. The
  // tick is now earned separately; see lib/account-ownership.ts.
  const proof = proofFor(providerId);
  const id = uid();
  await db.insert(schema.linkedGameAccounts).values({
    id, userId, provider: providerId,
    providerAccountId: verified.accountId, inGameName: verified.name,
    region: verified.region ?? region ?? null,
    verified: false, verifiedMethod: "exists", syncStatus: "pending",
  });

  const [account] = await db.select().from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.id, id)).limit(1);
  if (account) await syncAccount(db, account);
  await awardQuestAction(db, userId, "connect_account", { refType: "account", refId: id });

  // A linked game account is what counts toward a server's ad-revenue unlock,
  // so this is the moment the counter moves — and possibly crosses the line.
  void markMemberLinked(userId).catch(() => {});
  // Never awaited into the result — a failed announcement must not fail a link.
  // Awaited, not floated (B1.1, trap 6).
  //
  // `void …catch(() => {})` looks safe and is not: a floating promise in a
  // server action is killed when the response is sent, so the announcement
  // sometimes happened and sometimes did not, depending on how fast the caller
  // returned. Since B33 this only ENQUEUES — a couple of inserts, drained by
  // cron — so awaiting it costs almost nothing and makes it deterministic.
  // Its own errors are still swallowed: a link that succeeded must not fail
  // because Discord did.
  try { await announceAccountLinked(userId, provider.game); } catch { /* the link stands */ }

  return {
    ok: true, accountId: id, game: provider.game, name: verified.name,
    proven: false, proofAvailable: proof.kind !== "none",
  };
}
