"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPortalSession } from "@/lib/portal-auth";
import { getPayoutAccount } from "@/lib/payouts";
import { ownerActor, requestWithdrawal } from "@/lib/server-wallet";
import { uid } from "@/lib/utils";

// The one money-shaped thing a server owner can do.
//
// app/actions/payouts.ts states the rule this file has to live inside: an owner
// holding their portal key "cannot create a payout, change an amount, or make
// money move". Asking is not moving. What this opens is a `requested` payout —
// the same state a staff member opens one in — and a human still reviews it and
// still releases it. Nothing here calls a provider.
//
// Three guards, and the amount is not one of them: the amount is re-read from
// the wallet inside `requestWithdrawal`, because a balance rendered on a page
// some minutes ago is not a balance.
//
//   1. the portal session, or an admin acting on their behalf
//   2. a payout preference — a withdrawal nobody knows how to send is a row
//      that sits there looking like we ignored them
//   3. one open request at a time, so a double-click is not two withdrawals

export type WalletState = { ok?: true; error?: string; message?: string } | undefined;

export async function requestWithdrawalAction(
  _prev: WalletState,
  formData: FormData,
): Promise<WalletState> {
  const guildId = String(formData.get("guildId") ?? "");
  if (!guildId) return { error: "Missing server." };

  const unlocked = await hasPortalSession("server", guildId);
  const user = await getCurrentUser();
  if (!unlocked && !(user && (user.role === "admin" || user.role === "superadmin"))) {
    return { error: "Open your portal with your key first." };
  }

  const account = await getPayoutAccount("server", guildId);
  if (!account?.methodPreference) {
    return { error: "Tell us how to pay you first — pick a method further down this page. We can't send money we have no route for." };
  }

  const db = await getDb();

  // One open request at a time. Two clicks a second apart both read the same
  // balance before either row lands, and the second one is not a second
  // withdrawal — it is the same withdrawal, twice.
  const open = await db.select({ id: schema.serverPayouts.id })
    .from(schema.serverPayouts)
    .where(and(
      eq(schema.serverPayouts.guildId, guildId),
      eq(schema.serverPayouts.requestedBy, ownerActor(guildId)),
      inArray(schema.serverPayouts.status, ["requested", "approved", "processing"]),
    )).limit(1);
  if (open.length) {
    return { error: "You already have a withdrawal in progress. It has to land before you can ask for another — it's on the statement below." };
  }

  const [guild] = await db.select({ name: schema.discordGuilds.name })
    .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, guildId)).limit(1);

  const amount = Number(formData.get("amount"));
  const res = await requestWithdrawal(db, {
    guildId, amount, guildName: guild?.name ?? null,
    currency: account.currency ?? "USD",
  });
  if (!res.ok) return { error: res.error };

  // Written down because "who asked for this money" is the first question
  // anybody asks about a payment that left, and an owner asking is an answer
  // the log did not previously have.
  try {
    await db.insert(schema.auditLog).values({
      id: uid(), adminId: `owner:${guildId}`, action: "payout.requested_by_owner",
      targetType: "payout", targetId: res.id, meta: { guildId, amount },
    });
  } catch { /* never let the log fail the request */ }

  revalidatePath("/admin/payouts");
  return {
    ok: true,
    message: "Asked for. It shows as committed straight away so it can't be spent twice, and someone here releases it — you'll see it move to paid on this page.",
  };
}
