"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers/registry";
import {
  accountHeldByOther, proofFor, siblingProviders, transferClaim,
} from "@/lib/account-ownership";

// Proving a game account is yours.
//
// Linking asks the provider whether an account exists. This asks whether it is
// YOURS, which is a different question and the only one that should ever put a
// verification tick on a profile or let someone collect a prize.

export type VerifyState = {
  error?: string;
  ok?: boolean;
  /** The icon to set, when a Riot challenge has just been issued. */
  challenge?: { iconId: number; imageUrl: string; expiresAt: string };
} | undefined;

/** The caller's account, or null — never another gamer's. */
async function myAccount(userId: string, accountId: string) {
  const db = await getDb();
  const [acc] = await db.select().from(schema.linkedGameAccounts).where(and(
    eq(schema.linkedGameAccounts.id, accountId),
    eq(schema.linkedGameAccounts.userId, userId),
  )).limit(1);
  return acc ?? null;
}

/**
 * Issue an ownership challenge.
 *
 * Riot: a random starter profile icon, valid for 15 minutes. Random per attempt
 * so nobody can pre-set it, and short-lived so a screenshot proves nothing
 * later. Only the person logged into the account can change its icon.
 */
export async function startAccountProof(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const me = await requireUser();
  const accountId = String(formData.get("accountId") ?? "");
  const acc = await myAccount(me.id, accountId);
  if (!acc) return { error: "That account isn't on your profile." };

  const proof = proofFor(acc.provider);
  if (proof.kind !== "riot-icon") {
    return { error: `${getProvider(acc.provider)?.name ?? "This game"} is verified a different way — ${proof.how}` };
  }
  if (!process.env.RIOT_API_KEY) return { error: "Riot verification isn't switched on yet. Ask an admin to set RIOT_API_KEY." };

  const { newIconChallenge, iconImageUrl, currentIconId } = await import("@/lib/providers/riot-verify");
  // Never pick the icon they already have — it would prove nothing.
  const now = await currentIconId(acc.providerAccountId, acc.region ?? "euw1");
  const challenge = newIconChallenge(now);

  const db = await getDb();
  await db.update(schema.linkedGameAccounts)
    .set({ proofChallenge: { kind: "riot-icon", iconId: challenge.iconId }, proofExpiresAt: new Date(challenge.expiresAt) })
    .where(eq(schema.linkedGameAccounts.id, acc.id));

  revalidatePath("/settings/connections");
  revalidatePath("/profile");
  return { ok: true, challenge: { iconId: challenge.iconId, imageUrl: iconImageUrl(challenge.iconId), expiresAt: challenge.expiresAt } };
}

/**
 * Check the challenge and, if it holds, hand over the tick.
 *
 * A completed proof also TAKES the account from anyone who merely claimed it.
 * Without that, one-account-one-gamer becomes a denial of service: squat on a
 * pro's Riot ID and the pro can never link it. A claim that was itself proven
 * is never taken — that needs a human.
 */
export async function confirmAccountProof(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const me = await requireUser();
  const accountId = String(formData.get("accountId") ?? "");
  const acc = await myAccount(me.id, accountId);
  if (!acc) return { error: "That account isn't on your profile." };

  const challenge = (acc.proofChallenge ?? {}) as { kind?: string; iconId?: number };
  if (challenge.kind !== "riot-icon" || typeof challenge.iconId !== "number") {
    return { error: "Start the check first — we'll show you which icon to set." };
  }
  if (acc.proofExpiresAt && acc.proofExpiresAt.getTime() < Date.now()) {
    return { error: "That check expired. Start it again for a fresh icon." };
  }

  const { checkIconProof } = await import("@/lib/providers/riot-verify");
  const res = await checkIconProof(acc.providerAccountId, challenge.iconId, acc.region ?? "euw1");
  if (!res.ok) return { error: res.error };

  const db = await getDb();

  // Take it from an unproven claimant, if there is one.
  const clash = await accountHeldByOther(db, acc.provider, acc.providerAccountId, me.id);
  if (clash?.proven) {
    return { error: "Another gamer has already proven ownership of this account. Contact support if that's wrong." };
  }
  if (clash) await transferClaim(db, clash.accountId);

  const stamp = { verified: true, verifiedMethod: "icon", verifiedAt: new Date(), proofChallenge: null, proofExpiresAt: null, ownershipStatus: "ok" };
  await db.update(schema.linkedGameAccounts).set(stamp).where(eq(schema.linkedGameAccounts.id, acc.id));

  // One Riot account is one PUUID across League and VALORANT, so proving it in
  // League proves the same human in VALORANT — which is how VALORANT gets a
  // verified owner without the production key its VAL-* endpoints require.
  for (const sibling of siblingProviders(acc.provider)) {
    await db.update(schema.linkedGameAccounts).set(stamp).where(and(
      eq(schema.linkedGameAccounts.userId, me.id),
      eq(schema.linkedGameAccounts.provider, sibling),
      eq(schema.linkedGameAccounts.providerAccountId, acc.providerAccountId),
    ));
  }

  revalidatePath("/settings/connections");
  revalidatePath("/profile");
  revalidatePath(`/u/${me.slug}`);
  return { ok: true };
}
