"use server";

// The settings actions.
//
// One of them closes an account, and it is the only place on the platform that
// does — R3/V17's refusal lives in `deleteAccount`, not here. This file signs
// the person out afterwards and carries the refusal's own words back to the
// screen.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "../../lib/db/index.ts";
import { currentGamer, signOut } from "../../lib/auth/current.ts";
import { deleteAccount, DeletionRefused } from "../../lib/identity/gamers.ts";

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/");
}

/**
 * Close the account.
 *
 * The confirmation is a typed word rather than a second button, because the
 * action is not reversible from the gamer's side and a misclick should not be
 * able to reach it. The **rule** it enforces is not here: `deleteAccount`
 * refuses while a payout is in flight, and it does so inside the transaction
 * that takes the row lock, which is the only place that check is safe.
 */
export async function deleteAccountAction(form: FormData): Promise<void> {
  const gamer = await currentGamer();
  if (!gamer) redirect("/login");

  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    redirect("/settings/privacy?error=" + encodeURIComponent('Type "delete" to confirm.'));
  }

  try {
    await deleteAccount(await getDb(), gamer.id);
  } catch (e) {
    if (e instanceof DeletionRefused) {
      redirect(`/settings/privacy?error=${encodeURIComponent(e.message)}&code=${e.code}`);
    }
    throw e;
  }

  await signOut();
  redirect("/goodbye?closed=1");
}

/**
 * Unlink a game account. B6, and the action that rule was waiting for.
 *
 * ===== THE RULE EXISTED AND THE ACTION DID NOT =====
 *
 * `freezeOnUnlink` implements B6 — *freeze a participant's score when they
 * unlink the account they entered with; they stay in the standings, because
 * dropping them rewrites a leaderboard other people have been watching.*
 * `94-export-reach` found it with no caller, and the reason turned out to be
 * that **there was no way to unlink an account anywhere on the platform.** A
 * rule with no trigger is not a safe rule; it is an unfinished feature whose
 * absence nobody noticed because the thing it responds to could not happen.
 *
 * The freeze comes **before** the delete and is not fenced. The whole point of
 * B6 is that the inputs disappear: once the link row is gone the score cannot
 * be derived from anything, and a freeze that failed silently would leave
 * somebody reading as zero in a standing they earned. If the freeze cannot be
 * written, the unlink does not happen.
 */
export async function unlinkAccountAction(form: FormData): Promise<void> {
  const gamer = await currentGamer();
  if (!gamer) redirect("/login?next=/settings/connections");

  const accountId = String(form.get("accountId") ?? "");
  const db = await getDb();

  const { eq, and } = await import("drizzle-orm");
  const [account] = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(
      and(
        eq(schema.linkedGameAccounts.id, accountId),
        eq(schema.linkedGameAccounts.userId, gamer.id),
      ),
    );
  if (!account) {
    redirect("/settings/connections?note=That+account+is+not+linked+to+you.");
  }

  const { freezeOnUnlink } = await import("../../lib/challenges/jobs.ts");
  const frozen = await freezeOnUnlink(db, accountId);

  await db.delete(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.id, accountId));

  revalidatePath("/settings/connections");
  redirect(
    `/settings/connections?note=${encodeURIComponent(
      frozen === 0
        ? "Unlinked. You had no live entries on that account."
        : `Unlinked. Your score in ${frozen} challenge${frozen === 1 ? "" : "s"} is frozen where it was — you stay in the standings.`,
    )}`,
  );
}
