import { and, eq, ne } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";

// Who owns a game account, and how we know.
//
// Two separate problems lived here, and both were invisible:
//
//   1. `linked_game_accounts` was unique on (user_id, provider, account_id) —
//      unique PER USER. Two Cluster gamers could hold the same Riot account,
//      both enter the same challenge on it, and both be paid from the same
//      week of play.
//   2. `verified` was set true the moment a provider's API answered. That
//      proves the account EXISTS. It does not prove the person typing it owns
//      it. Anyone could link Faker's account and wear his rank.
//
// The fix is one rule and one honest field.
//
//   The rule: an account belongs to one gamer. First claim holds it — EXCEPT
//   that a gamer who can PROVE ownership takes it from one who only claimed it.
//   Without that exception, uniqueness becomes a denial of service: squat on a
//   pro's account and the pro can never link it.
//
//   The field: `verifiedMethod` records how ownership was established, so the
//   difference between "we asked the API and it answered" and "they proved it"
//   is visible everywhere instead of being flattened into one boolean.

/** How ownership was established, weakest first. */
export const PROOF_METHODS = ["claimed", "exists", "icon", "vc", "oauth", "openid", "admin"] as const;
export type ProofMethod = (typeof PROOF_METHODS)[number];

/** Does this method actually prove the person owns the account? */
export function isProof(method: string): boolean {
  return ["icon", "vc", "oauth", "openid", "admin"].includes(method);
}

export type ProofKind = "riot-icon" | "steam-openid" | "epic-oauth" | "vc" | "none";

/**
 * What proof each game can actually offer.
 *
 * Deliberately per-provider and deliberately honest: three of the six live
 * games have a real ownership check available and three do not, and saying so
 * is better than implying a verification we can't perform. Ordered by the six
 * games that are live today.
 */
export const OWNERSHIP_PROOF: Record<string, { kind: ProofKind; label: string; how: string }> = {
  // League: set your in-game profile icon to the one we name, then press check.
  // Works on a DEVELOPMENT Riot key — summoner-v4 is not a production-gated
  // endpoint — which is what makes this the only Riot proof we can ship today.
  "riot-lol": {
    kind: "riot-icon",
    label: "Profile icon check",
    how: "Change your League profile icon to the one we show, then press Verify. Change it back after.",
  },
  // VALORANT rides on it. Riot accounts share one PUUID across League and
  // VALORANT, so a PUUID proven through League is the same person in VALORANT.
  // This is how VALORANT gets verified ownership without production approval,
  // which VAL-* endpoints require and a development key does not have.
  "riot-valorant": {
    kind: "riot-icon",
    label: "Riot account check",
    how: "Verify the same Riot account in League of Legends — VALORANT shares one Riot ID, so proving it once proves both.",
  },
  // Dota: the Friend ID is derived from the SteamID, and Steam OpenID proves
  // the SteamID. Signing in with Steam is therefore proof of the Dota account.
  opendota: {
    kind: "steam-openid",
    label: "Sign in with Steam",
    how: "Sign in with Steam. Your Dota 2 Friend ID comes from your SteamID, so Steam proves it.",
  },
  steam: {
    kind: "steam-openid",
    label: "Sign in with Steam",
    how: "Sign in with Steam — that IS the account.",
  },
  // Fortnite: Epic's own OAuth returns the account id the stats are keyed to.
  fortnite: {
    kind: "epic-oauth",
    label: "Sign in with Epic",
    how: "Sign in with Epic Games. Your Epic account is the Fortnite account.",
  },
  // Mobile Legends already had the strongest proof on the platform: a code
  // Moonton mails into the game, which only the account holder can read.
  "mobile-legends": { kind: "vc", label: "In-game code", how: "Enter the code Moonton sends to your in-game mail." },
  // No ownership check exists. The PUBG API keys on player name and TRN on the
  // EA name; neither exposes anything only the owner could produce. Saying
  // "verified" here would be a lie, so these stay claimed.
  pubg: { kind: "none", label: "Not available", how: "PUBG's API has no ownership check. First claim holds the name." },
  apex: { kind: "none", label: "Not available", how: "The Apex tracker API has no ownership check. First claim holds the name." },
};

export function proofFor(providerId: string) {
  return OWNERSHIP_PROOF[providerId] ?? { kind: "none" as ProofKind, label: "Not available", how: "This game has no ownership check yet." };
}

/** The Riot account id a proven League link authorizes for VALORANT, and back. */
const RIOT_SIBLINGS: Record<string, string[]> = {
  "riot-lol": ["riot-valorant"],
  "riot-valorant": ["riot-lol"],
};

export type ClaimConflict = {
  /** The row already holding this account. */
  accountId: string;
  userId: string;
  displayName: string;
  slug: string;
  /** Is the current holder's claim proven, or merely asserted? */
  proven: boolean;
};

/**
 * Who already holds this game account, if anyone but `userId`.
 *
 * Returns null when the account is free. The caller decides what to do with a
 * conflict, because the answer differs: a fresh link is refused, while a
 * completed ownership proof takes the account over.
 */
export async function accountHeldByOther(
  db: DB,
  providerId: string,
  providerAccountId: string,
  userId: string,
): Promise<ClaimConflict | null> {
  const rows = await db.select({
    accountId: schema.linkedGameAccounts.id,
    userId: schema.linkedGameAccounts.userId,
    verified: schema.linkedGameAccounts.verified,
    method: schema.linkedGameAccounts.verifiedMethod,
    displayName: schema.users.displayName,
    slug: schema.users.slug,
  })
    .from(schema.linkedGameAccounts)
    .innerJoin(schema.users, eq(schema.users.id, schema.linkedGameAccounts.userId))
    .where(and(
      eq(schema.linkedGameAccounts.provider, providerId),
      eq(schema.linkedGameAccounts.providerAccountId, providerAccountId),
      ne(schema.linkedGameAccounts.userId, userId),
    ))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    accountId: r.accountId, userId: r.userId,
    displayName: r.displayName, slug: r.slug,
    proven: r.verified && isProof(r.method),
  };
}

/** The message a gamer sees when the account is taken. */
export function conflictMessage(conflict: ClaimConflict, gameName: string): string {
  return conflict.proven
    ? `That ${gameName} account is already verified by another gamer. If it's yours, contact support — we can move it once you prove ownership.`
    : `That ${gameName} account is already linked to another Cluster gamer. If it's really yours, verify ownership and it moves to you.`;
}

/**
 * Hand a proven account over from an unproven claimant.
 *
 * Not a delete. The loser keeps their row, marked `disputed` and stripped of
 * the account id it was squatting on, so their challenge history and standings
 * survive for staff to look at. Deleting would cascade a season of results.
 */
export async function transferClaim(db: DB, fromAccountId: string): Promise<void> {
  await db.update(schema.linkedGameAccounts)
    .set({
      ownershipStatus: "disputed",
      verified: false,
      verifiedMethod: "claimed",
      syncStatus: "revoked",
      syncError: "Ownership of this account was proven by another gamer.",
    })
    .where(eq(schema.linkedGameAccounts.id, fromAccountId));
}

/** Providers a proof on `providerId` should also verify (Riot's shared PUUID). */
export function siblingProviders(providerId: string): string[] {
  return RIOT_SIBLINGS[providerId] ?? [];
}
