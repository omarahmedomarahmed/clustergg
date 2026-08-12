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
export type ProofSpec = {
  kind: ProofKind;
  label: string;
  how: string;
  /**
   * Is the whole path built, end to end?
   *
   * A declared proof with no wiring behind it is a button that signs someone
   * in, returns them, and leaves the account exactly as unproven as before —
   * worse than no button. The UI only offers a proof that can finish.
   */
  wired: boolean;
};

export const OWNERSHIP_PROOF: Record<string, ProofSpec> = {
  // League: set your in-game profile icon to the one we name, then press check.
  // Works on a DEVELOPMENT Riot key — summoner-v4 is not a production-gated
  // endpoint — which is what makes this the only Riot proof we can ship today.
  "riot-lol": {
    kind: "riot-icon",
    label: "Profile icon check",
    how: "Change your League profile icon to the one we show, then press Verify. Change it back after.",
    wired: true,
  },
  // VALORANT rides on it. Riot accounts share one PUUID across League and
  // VALORANT, so a PUUID proven through League is the same person in VALORANT.
  // This is how VALORANT gets verified ownership without production approval,
  // which VAL-* endpoints require and a development key does not have.
  "riot-valorant": {
    kind: "riot-icon",
    label: "Riot account check",
    how: "Verify the same Riot account in League of Legends — VALORANT shares one Riot ID, so proving it once proves both.",
    // VALORANT is identity-only today (VAL-* stats need Riot production
    // approval), so there is no VALORANT row to stamp yet. The carry-over is
    // built and tested; it starts working the day VALORANT becomes linkable.
    wired: false,
  },
  // Dota: the Friend ID is derived from the SteamID, and Steam OpenID proves
  // the SteamID. Signing in with Steam is therefore proof of the Dota account.
  opendota: {
    kind: "steam-openid",
    label: "Sign in with Steam",
    how: "Sign in with Steam. Your Dota 2 Friend ID comes from your SteamID, so Steam proves it.",
    wired: true,
  },
  steam: {
    kind: "steam-openid",
    label: "Sign in with Steam",
    how: "Sign in with Steam — that IS the account.",
    wired: true,
  },
  // Fortnite: Epic's own OAuth returns the account id the stats are keyed to.
  fortnite: {
    kind: "epic-oauth",
    label: "Sign in with Epic",
    how: "Sign in with Epic Games. Your Epic account is the Fortnite account.",
    // Epic OAuth exists and returns an account id, but Fortnite's stats API is
    // keyed on the Epic DISPLAY NAME, not that id — so matching the signed-in
    // Epic account to the linked Fortnite row is a step that is not built yet.
    // Declared, not offered.
    wired: false,
  },
  // Mobile Legends already had the strongest proof on the platform: a code
  // Moonton mails into the game, which only the account holder can read.
  "mobile-legends": {
    kind: "vc", label: "In-game code",
    how: "Enter the code Moonton sends to your in-game mail.", wired: true,
  },
  // No ownership check exists. The PUBG API keys on player name and TRN on the
  // EA name; neither exposes anything only the owner could produce. Saying
  // "verified" here would be a lie, so these stay claimed.
  pubg: { kind: "none", label: "Not available", how: "PUBG's API has no ownership check. First claim holds the name.", wired: false },
  apex: { kind: "none", label: "Not available", how: "The Apex tracker API has no ownership check. First claim holds the name.", wired: false },
};

export function proofFor(providerId: string): ProofSpec {
  return OWNERSHIP_PROOF[providerId]
    ?? { kind: "none", label: "Not available", how: "This game has no ownership check yet.", wired: false };
}

/**
 * The SteamID64 → Dota 2 Friend ID conversion.
 *
 * Valve's account id is the low 32 bits of the SteamID64, which is why signing
 * in with Steam proves a Dota account: the Friend ID is not a separate
 * credential, it is derived from the SteamID that OpenID just authenticated.
 */
export function dotaAccountIdFromSteamId(steamId64: string): string | null {
  if (!/^\d{17}$/.test(steamId64.trim())) return null;
  try { return String(BigInt(steamId64.trim()) - 76561197960265728n); } catch { return null; }
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

/**
 * The message a gamer sees when the account is taken.
 *
 * ===== IT USED TO NAME AN ACTION THAT DOES NOT EXIST. G7. =====
 *
 * The unproven branch said "If it's really yours, verify ownership and it moves
 * to you", and there was no link, button or route anywhere on the page that
 * verified anything. Worse, for most games there could not be: the proof flow
 * lives on a LINKED account's row, and this message is exactly the moment we
 * refused to create that row. So the one instruction given was, for a Riot or
 * Chess.com account, impossible in principle rather than merely missing a link.
 *
 * There IS a real transfer path, and it is narrower than the old sentence
 * implied: signing in with the game's own account — Steam, Epic, Riot's own
 * OAuth — takes the account from somebody who only typed the name
 * (`app/api/auth/[provider]/callback`, which calls `transferClaim`). That works
 * without a linked row, because signing in creates one.
 *
 * So the message now branches on whether such a sign-in exists for this game,
 * and says the true thing in each case. `signInPath` is passed by the caller
 * rather than built here: this module knows about ownership, not about routes.
 */
export function conflictMessage(
  conflict: ClaimConflict,
  gameName: string,
  providerId?: string,
): string {
  if (conflict.proven) {
    return `That ${gameName} account is already verified by another gamer. If it's yours, contact support — we can move it once you prove ownership.`;
  }
  // A sign-in we can actually offer. `wired` matters as much as `kind`: Epic
  // OAuth exists and is declared, and the step that matches a signed-in Epic
  // account to a Fortnite row is not built — offering it would put us straight
  // back to naming an action that does not work.
  const proof = providerId ? proofFor(providerId) : null;
  const canSignIn = !!proof?.wired && /oauth|openid/.test(proof.kind);
  return canSignIn
    ? `That ${gameName} account is already linked to another Cluster gamer. ${proof!.label} instead and it moves to you — signing in proves it is yours, and a typed-in name doesn't.`
    : `That ${gameName} account is already linked to another Cluster gamer, and ${gameName} gives us no way for you to prove otherwise from here. Contact support if it's really yours.`;
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
