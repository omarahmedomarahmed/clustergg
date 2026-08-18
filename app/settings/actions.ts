"use server";

// The settings actions.
//
// One of them closes an account, and it is the only place on the platform that
// does — R3/V17's refusal lives in `deleteAccount`, not here. This file signs
// the person out afterwards and carries the refusal's own words back to the
// screen.

import { redirect } from "next/navigation";
import { getDb } from "../../lib/db/index.ts";
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
