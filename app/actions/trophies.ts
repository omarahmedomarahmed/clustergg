"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser, requireStaff } from "@/lib/auth";
import { payoutLast4 } from "@/lib/trophies";
import { uid } from "@/lib/utils";

const MAX_METHOD_CHANGES = 3;

function revalidateTrophyPages() {
  revalidatePath("/feed");
  revalidatePath("/profile");
  revalidatePath("/admin/redeems");
}

async function notify(db: Awaited<ReturnType<typeof getDb>>, userId: string, title: string, body: string, href: string) {
  await db.insert(schema.notifications).values({ id: uid(), userId, type: "trophy", title, body, href });
}

async function notifyAdmins(db: Awaited<ReturnType<typeof getDb>>, title: string, body: string) {
  const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "admin")).limit(10);
  for (const a of admins) await notify(db, a.id, title, body, "/admin/redeems");
}

// ===== Gamer: request a redeem =====
// Validates the payout method per currency, enforces the 3-change method lock
// (alerting admins when someone keeps changing it), locks the selected awards
// as "pending" and files the request for admin approval.
export async function requestRedeem(input: {
  awardIds: string[];
  currency: "USD" | "EGP";
  method: "ach" | "wallet" | "instapay";
  details: Record<string, string>;
}): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  const db = await getDb();

  // Validate the payout method.
  const d: Record<string, string> = {};
  if (input.currency === "USD") {
    if (input.method !== "ach") return { error: "USD payouts use ACH transfer." };
    d.routing = String(input.details.routing ?? "").replace(/\D/g, "");
    d.account = String(input.details.account ?? "").replace(/\D/g, "");
    d.accountType = input.details.accountType === "savings" ? "savings" : "checking";
    d.holderName = String(input.details.holderName ?? "").trim().slice(0, 120);
    if (d.routing.length !== 9) return { error: "Routing number must be 9 digits." };
    if (d.account.length < 4 || d.account.length > 17) return { error: "Enter a valid account number." };
    if (!d.holderName) return { error: "Enter the account holder name." };
  } else {
    if (input.method !== "wallet" && input.method !== "instapay") return { error: "EGP payouts use Mobile Wallet or InstaPay." };
    d.mobile = String(input.details.mobile ?? "").replace(/[^\d+]/g, "");
    if (d.mobile.replace(/\D/g, "").length < 10) return { error: "Enter a valid mobile number." };
  }

  // Saved-method handling + 3-change lock.
  const [me] = await db.select({ pm: schema.users.payoutMethod, changes: schema.users.payoutChanges })
    .from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  const incoming = { currency: input.currency, method: input.method, details: d };
  const same = me?.pm && JSON.stringify(me.pm) === JSON.stringify(incoming);
  if (!same) {
    const changes = Number(me?.changes ?? 0);
    if (me?.pm && changes >= MAX_METHOD_CHANGES) {
      return { error: "Payout method is locked after 3 changes — contact support to update it." };
    }
    await db.update(schema.users)
      .set({ payoutMethod: incoming, payoutChanges: me?.pm ? changes + 1 : changes })
      .where(eq(schema.users.id, user.id));
    if (me?.pm && changes + 1 >= MAX_METHOD_CHANGES) {
      await notifyAdmins(db, "Payout method locked", `${user.displayName} (@${user.slug}) changed their trophy payout method ${changes + 1} times — now locked. Review the account.`);
    }
  }

  // Lock the awards + compute the amount from the live trophy values.
  const ids = [...new Set(input.awardIds)].slice(0, 50);
  if (ids.length === 0) return { error: "Select at least one trophy." };
  const awards = await db.select({ id: schema.userTrophies.id, value: schema.trophies.value })
    .from(schema.userTrophies)
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .where(and(inArray(schema.userTrophies.id, ids), eq(schema.userTrophies.userId, user.id), eq(schema.userTrophies.status, "held")));
  if (awards.length !== ids.length) return { error: "Some trophies are no longer available to redeem." };
  const amount = awards.reduce((s, a) => s + Number(a.value ?? 0), 0);
  if (amount <= 0) return { error: "These trophies have no redeemable value yet." };

  const redeemId = uid();
  await db.insert(schema.trophyRedeems).values({
    id: redeemId, userId: user.id, awardIds: ids, amount,
    currency: input.currency, method: input.method, details: d, status: "pending",
  });
  await db.update(schema.userTrophies).set({ status: "pending" }).where(inArray(schema.userTrophies.id, ids));
  await notifyAdmins(db, "Trophy redeem request", `${user.displayName} (@${user.slug}) requested $${amount.toLocaleString()} ${input.currency} for ${ids.length} ${ids.length === 1 ? "trophy" : "trophies"}.`);
  revalidateTrophyPages();
  return { ok: true };
}

// Gamer cancels a still-pending request — trophies go back to the shelf.
export async function cancelRedeem(redeemId: string): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  const db = await getDb();
  const [r] = await db.select().from(schema.trophyRedeems)
    .where(and(eq(schema.trophyRedeems.id, redeemId), eq(schema.trophyRedeems.userId, user.id))).limit(1);
  if (!r || r.status !== "pending") return { error: "Only pending requests can be cancelled." };
  await db.update(schema.trophyRedeems).set({ status: "cancelled", decidedAt: new Date() }).where(eq(schema.trophyRedeems.id, r.id));
  if (r.awardIds?.length) await db.update(schema.userTrophies).set({ status: "held" }).where(inArray(schema.userTrophies.id, r.awardIds));
  revalidateTrophyPages();
  return { ok: true };
}

// Gamer confirms the payout details after admin approval (the "please confirm
// bank info" step — shown with last-4 only).
export async function confirmRedeem(redeemId: string): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  const db = await getDb();
  const [r] = await db.select().from(schema.trophyRedeems)
    .where(and(eq(schema.trophyRedeems.id, redeemId), eq(schema.trophyRedeems.userId, user.id))).limit(1);
  if (!r || r.status !== "approved") return { error: "Nothing to confirm." };
  await db.update(schema.trophyRedeems).set({ gamerConfirmedAt: new Date() }).where(eq(schema.trophyRedeems.id, r.id));
  await notifyAdmins(db, "Redeem payout confirmed", `${user.displayName} (@${user.slug}) confirmed the payout details for their $${Number(r.amount).toLocaleString()} ${r.currency} redeem — ready to pay.`);
  revalidateTrophyPages();
  return { ok: true };
}

// ===== Admin lifecycle =====
export async function approveRedeem(redeemId: string) {
  await requireStaff();
  const db = await getDb();
  const [r] = await db.select().from(schema.trophyRedeems).where(eq(schema.trophyRedeems.id, redeemId)).limit(1);
  if (!r || r.status !== "pending") return;
  await db.update(schema.trophyRedeems).set({ status: "approved", decidedAt: new Date() }).where(eq(schema.trophyRedeems.id, r.id));
  const methodLabel = r.method === "ach" ? "ACH transfer" : r.method === "wallet" ? "Mobile Wallet" : "InstaPay";
  await notify(db, r.userId,
    "Trophy redeem approved — confirm your payout",
    `Please confirm your ${methodLabel} details ending in ${payoutLast4(r.details)} to redeem $${Number(r.amount).toLocaleString()} ${r.currency}. Payout takes 5–7 business days after confirmation.`,
    "/profile");
  revalidateTrophyPages();
}

export async function rejectRedeem(redeemId: string) {
  await requireStaff();
  const db = await getDb();
  const [r] = await db.select().from(schema.trophyRedeems).where(eq(schema.trophyRedeems.id, redeemId)).limit(1);
  if (!r || (r.status !== "pending" && r.status !== "approved")) return;
  await db.update(schema.trophyRedeems).set({ status: "rejected", decidedAt: new Date() }).where(eq(schema.trophyRedeems.id, r.id));
  if (r.awardIds?.length) await db.update(schema.userTrophies).set({ status: "held" }).where(inArray(schema.userTrophies.id, r.awardIds));
  await notify(db, r.userId, "Trophy redeem declined", "Your redeem request was declined — your trophies are back on your shelf. Contact support for details.", "/profile");
  revalidateTrophyPages();
}

// Admin uploads the payment confirmation → request is PAID and the trophies
// leave the gamer's shelf (they stay visible in redeem history).
export async function markRedeemPaid(redeemId: string, formData: FormData) {
  await requireStaff();
  const db = await getDb();
  const proofUrl = String(formData.get("proofUrl") ?? "").trim();
  const [r] = await db.select().from(schema.trophyRedeems).where(eq(schema.trophyRedeems.id, redeemId)).limit(1);
  if (!r || r.status !== "approved") return;
  await db.update(schema.trophyRedeems)
    .set({ status: "paid", paidAt: new Date(), proofUrl: proofUrl || null })
    .where(eq(schema.trophyRedeems.id, r.id));
  if (r.awardIds?.length) await db.update(schema.userTrophies).set({ status: "redeemed" }).where(inArray(schema.userTrophies.id, r.awardIds));
  await notify(db, r.userId,
    "Trophy redeem paid 🎉",
    `Your $${Number(r.amount).toLocaleString()} ${r.currency} payout was sent${proofUrl ? " — the payment confirmation is attached to the request" : ""}. The redeemed trophies moved to your history.`,
    "/profile");
  revalidateTrophyPages();
}
