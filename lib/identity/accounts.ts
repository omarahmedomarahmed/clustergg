// Linking a game account, and what "verified" is allowed to mean.
//
// Two rules do most of the work here, and they pull against each other:
//
//   L1 — one game account belongs to one gamer. Unique on
//        `(provider, providerAccountId)` across every user.
//   L2 — a gamer who *proves* ownership takes the account from one who only
//        claimed it. Without L2, L1 is a denial of service: type somebody
//        else's summoner name first and they can never link it.
//
// And the distinction that content rule C5 rests on: `verified: true` with
// method `exists` means the account is real. It does not mean this person owns
// it. Only `icon`, `oauth`, `openid` and `admin` are proof, and nothing a
// human reads may call an account verified without one of them.

import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { withTx } from "../db/tx.ts";

/** Every way an account can come to be believed. */
export const VERIFY_METHODS = [
  "claimed",
  "exists",
  "icon",
  "oauth",
  "openid",
  "admin",
] as const;
export type VerifyMethod = (typeof VERIFY_METHODS)[number];

/**
 * The methods that are actually proof of ownership.
 *
 * `claimed` is "they typed it". `exists` is "the publisher says this account
 * is real" — which is a fact about the account, not about the person.
 */
const PROOF: ReadonlySet<string> = new Set(["icon", "oauth", "openid", "admin"]);

/** True only when ownership was proven. The only thing that may be called verified. */
export function isProven(method: string | null | undefined): boolean {
  return PROOF.has(method ?? "");
}

export class AccountTakenError extends Error {
  constructor(readonly provider: string, readonly providerAccountId: string) {
    super(
      "That game account is already linked to another gamer who has proven " +
        "they own it. If it is yours, prove ownership and it moves to you.",
    );
    this.name = "AccountTakenError";
  }
}

/**
 * Link a game account to a gamer.
 *
 * The contested case is the whole function. When the account is already
 * linked:
 *
 *   * to this same gamer — update in place, keeping the stronger of the two
 *     verification methods. A re-link must never *downgrade* a proven account
 *     to a claim.
 *   * to somebody else who only claimed it, and this gamer has proof — it
 *     moves. That is L2.
 *   * to somebody else who proved it — refused, whatever this gamer has.
 *     Proof does not beat proof; first proof wins, and a dispute is a support
 *     question, not a race.
 */
export async function linkAccount(
  db: DB,
  input: {
    userId: string;
    provider: string;
    providerAccountId: string;
    inGameName?: string | null;
    region?: string | null;
    verifiedMethod: VerifyMethod;
  },
): Promise<{ id: string; moved: boolean }> {
  return withTx(db, async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.linkedGameAccounts)
      .where(
        and(
          eq(schema.linkedGameAccounts.provider, input.provider),
          eq(schema.linkedGameAccounts.providerAccountId, input.providerAccountId),
        ),
      );

    const incomingIsProof = isProven(input.verifiedMethod);

    if (existing && existing.userId === input.userId) {
      // Keep the stronger claim. Re-running the linker with a weaker method —
      // which a retry after a failed proof does — must not undo the proof.
      const keepProof = isProven(existing.verifiedMethod) && !incomingIsProof;
      await tx
        .update(schema.linkedGameAccounts)
        .set({
          inGameName: input.inGameName ?? existing.inGameName,
          region: input.region ?? existing.region,
          verified: true,
          verifiedMethod: keepProof ? existing.verifiedMethod : input.verifiedMethod,
          syncStatus: "ok",
          syncError: null,
        })
        .where(eq(schema.linkedGameAccounts.id, existing.id));
      return { id: existing.id, moved: false };
    }

    if (existing) {
      if (isProven(existing.verifiedMethod) || !incomingIsProof) {
        throw new AccountTakenError(input.provider, input.providerAccountId);
      }
      // L2: proof takes the account from a claim. The row moves rather than
      // being deleted and recreated, so anything hanging off its id — a
      // baseline, an observation — is not orphaned by the transfer.
      await tx
        .update(schema.linkedGameAccounts)
        .set({
          userId: input.userId,
          inGameName: input.inGameName ?? existing.inGameName,
          region: input.region ?? existing.region,
          verified: true,
          verifiedMethod: input.verifiedMethod,
          syncStatus: "ok",
          syncError: null,
        })
        .where(eq(schema.linkedGameAccounts.id, existing.id));
      return { id: existing.id, moved: true };
    }

    const id = uid();
    await tx.insert(schema.linkedGameAccounts).values({
      id,
      userId: input.userId,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      inGameName: input.inGameName ?? null,
      region: input.region ?? null,
      verified: true,
      verifiedMethod: input.verifiedMethod,
    });
    return { id, moved: false };
  });
}

export async function accountsFor(db: DB, userId: string) {
  return db
    .select()
    .from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.userId, userId));
}
