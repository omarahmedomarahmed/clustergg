"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { getCurrentUser } from "@/lib/auth";
import { hasPortalSession } from "@/lib/portal-auth";
import { serverEarnings } from "@/lib/server-portal";
import { guildStats } from "@/lib/discord/guilds";
import {
  createPayout, getPayout, markPayoutPaid, payoutTotals,
  savePayoutPreference, sendPayout, setPayoutStatus,
} from "@/lib/payouts";
import { payer } from "@/lib/payments";
import { uid } from "@/lib/utils";

// Paying a server owner.
//
// Two audiences, two very different sets of powers, and the split is the whole
// security model of this file:
//
//   THE OWNER, holding their portal key, can state a preference and open the
//   provider's onboarding page. They cannot create a payout, change an amount,
//   or make money move. Everything they touch is about where money goes, never
//   whether it goes.
//
//   STAFF create the payout, review the lines and release it. Every one of
//   those actions is attributed and written to the audit log, because "who
//   authorised this payment" is the first question anybody asks about money
//   that left, and "the software did" is never an acceptable answer.

type Res = { ok?: true; error?: string; id?: string; message?: string; url?: string | null };

async function staffGuard() {
  const access = await requireSystemFor("/admin/payouts");
  return access.user;
}

async function audit(adminId: string, action: string, targetId?: string, meta?: Record<string, unknown>) {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      id: uid(), adminId, action, targetType: "payout", targetId, meta: meta ?? {},
    });
  } catch { /* never let the log fail the payment */ }
}

function refresh(slug?: string | null) {
  revalidatePath("/admin/payouts");
  if (slug) revalidatePath(`/servers/${slug}`);
}

async function notify(userId: string, title: string, body: string, href: string) {
  try {
    const db = await getDb();
    await db.insert(schema.notifications).values({ id: uid(), userId, type: "payout", title, body, href });
  } catch { /* non-fatal */ }
}

/**
 * Who to address a payout to.
 *
 * A guild row holds a Discord snowflake for its owner, not a Cluster account —
 * so the name and email come from the account that signed in with that
 * snowflake, if there is one. When there isn't, the server's own name is what
 * the provider gets, which is correct: the counterparty is the community.
 */
async function guildOwner(guildId: string): Promise<{
  guild: typeof schema.discordGuilds.$inferSelect | null;
  userId: string | null;
  name: string;
  email: string | null;
  country: string | null;
}> {
  const db = await getDb();
  const [guild] = await db.select().from(schema.discordGuilds)
    .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
  const fallback = { guild: guild ?? null, userId: null, name: guild?.name || guildId, email: null, country: null };
  if (!guild?.ownerDiscordId) return fallback;
  try {
    const [row] = await db.select({
      id: schema.users.id, name: schema.users.displayName,
      email: schema.users.email, country: schema.users.country,
    }).from(schema.oauthIdentities)
      .innerJoin(schema.users, eq(schema.oauthIdentities.userId, schema.users.id))
      .where(and(
        eq(schema.oauthIdentities.provider, "discord"),
        eq(schema.oauthIdentities.providerUserId, guild.ownerDiscordId),
      )).limit(1);
    if (!row) return fallback;
    return { guild, userId: row.id, name: row.name, email: row.email, country: row.country };
  } catch { return fallback; }
}

// ===== Staff =====

/**
 * Open a payout for everything a server has earned and not been paid.
 *
 * The amount is not typed by anybody: it is the sponsored-challenge share from
 * the earnings ledger, minus what has already gone out. Members' winnings are
 * NOT in it and never will be — that money belongs to the members who won it,
 * and putting it in an owner's payout would be taking a gamer's prize.
 */
export async function openServerPayout(guildId: string): Promise<Res> {
  const admin = await staffGuard();
  const db = await getDb();
  const [guild] = await db.select().from(schema.discordGuilds)
    .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
  if (!guild) return { error: "That server isn't on the platform." };

  const stats = await guildStats(guildId);
  const earnings = await serverEarnings(guildId, stats?.linked ?? 0);
  const already = await payoutTotals(guildId);

  const lines = earnings.rows
    .filter((r) => r.ended && r.owner > 0)
    .map((r) => ({
      kind: "sponsored_share",
      label: `${r.title}${r.brandName ? ` · ${r.brandName}` : ""} — ${r.ownerPct}% of $${r.price.toLocaleString()} × ${Math.round(r.serverShare * 100)}% of entrants`,
      challengeId: r.challengeId,
      amount: r.owner,
    }));

  if (!lines.length) return { error: "Nothing has finished earning for this server yet." };

  const gross = lines.reduce((a, l) => a + l.amount, 0);
  const outstanding = Math.round((gross - already.paid - already.open) * 100) / 100;
  if (outstanding <= 0) {
    return { error: `Everything earned here is already paid or in flight ($${already.paid.toLocaleString()} paid, $${already.open.toLocaleString()} open).` };
  }

  // Already-settled challenges get netted off as one line rather than dropped,
  // so the owner can see the whole ledger and the arithmetic that got to the
  // figure — an unexplained smaller number is the fastest way to a dispute.
  const settled = Math.round((already.paid + already.open) * 100) / 100;
  if (settled > 0) {
    lines.push({
      kind: "adjustment",
      label: "Already paid or in flight from earlier payouts",
      challengeId: "",
      amount: -settled,
    });
  }

  const res = await createPayout({
    guildId,
    guildName: guild.name,
    periodEnd: new Date(),
    requestedBy: admin.id,
    lines,
  });
  if (!res.ok) return { error: res.error };

  await audit(admin.id, "payout.open", res.id, { guildId, amount: outstanding });
  refresh(guild.slug);
  return { ok: true, id: res.id, message: `Payout opened for ${guild.name} — $${outstanding.toLocaleString()}.` };
}

/** A payout staff build by hand: a bonus, a correction, a one-off. */
export async function openManualPayout(formData: FormData): Promise<Res> {
  const admin = await staffGuard();
  const guildId = String(formData.get("guildId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const kind = String(formData.get("kind") ?? "bonus");
  if (!guildId) return { error: "Pick a server." };
  if (!label) return { error: "Say what this payment is for — the owner sees this line." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount above zero." };

  const db = await getDb();
  const [guild] = await db.select().from(schema.discordGuilds)
    .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);

  const res = await createPayout({
    guildId,
    guildName: guild?.name ?? null,
    requestedBy: admin.id,
    note: label,
    lines: [{ kind, label, amount }],
  });
  if (!res.ok) return { error: res.error };
  await audit(admin.id, "payout.open_manual", res.id, { guildId, amount });
  refresh(guild?.slug);
  return { ok: true, id: res.id, message: `Payout opened — $${amount.toLocaleString()}.` };
}

/** Release it to the provider. Separate from opening it, deliberately. */
export async function releasePayout(payoutId: string): Promise<Res> {
  const admin = await staffGuard();
  const payout = await getPayout(payoutId);
  if (!payout) return { error: "That payout no longer exists." };

  const owner = await guildOwner(payout.guildId);
  const res = await sendPayout(payoutId, {
    name: owner.name || payout.guildName || payout.guildId,
    email: owner.email,
    country: owner.country,
  });
  if (!res.ok) {
    await audit(admin.id, "payout.release_failed", payoutId, { error: res.error });
    return { error: res.error };
  }
  await audit(admin.id, "payout.release", payoutId, { total: payout.total, manual: res.manual });
  refresh(owner.guild?.slug);
  return {
    ok: true,
    url: res.link,
    message: res.manual
      ? `Approved. Send $${payout.total.toLocaleString()} by hand, then mark it paid with the reference.`
      : `Submitted to the payout provider — $${payout.total.toLocaleString()}.`,
  };
}

export async function confirmPayoutPaid(payoutId: string, formData: FormData): Promise<Res> {
  const admin = await staffGuard();
  const ref = String(formData.get("ref") ?? "").trim();
  const payout = await getPayout(payoutId);
  if (!payout) return { error: "That payout no longer exists." };
  await markPayoutPaid(payoutId, ref);
  await audit(admin.id, "payout.paid", payoutId, { ref, total: payout.total });

  const owner = await guildOwner(payout.guildId);
  if (owner.userId) {
    await notify(owner.userId,
      "Your Cluster payout was sent",
      `$${payout.total.toLocaleString()} ${payout.currency} is on its way${ref ? ` (ref ${ref})` : ""}. The breakdown is on your Earnings tab.`,
      owner.guild?.slug ? `/servers/${owner.guild.slug}` : "/servers");
  }
  refresh(owner.guild?.slug);
  return { ok: true, message: "Marked paid." };
}

export async function cancelPayout(payoutId: string): Promise<Res> {
  const admin = await staffGuard();
  await setPayoutStatus(payoutId, "cancelled");
  await audit(admin.id, "payout.cancel", payoutId);
  refresh();
  return { ok: true };
}

// ===== The owner's side =====

/**
 * The owner states how they'd like to be paid.
 *
 * Guarded by their portal session, and the entire payload is a word, a country
 * code and a currency. There is nowhere in this action for an account number to
 * arrive, which is the property that makes it safe to expose at all.
 */
export async function saveServerPayoutPreference(guildId: string, formData: FormData): Promise<Res> {
  const unlocked = await hasPortalSession("server", guildId);
  const user = await getCurrentUser();
  if (!unlocked && !(user && (user.role === "admin" || user.role === "superadmin"))) {
    return { error: "Open your portal with your key first." };
  }
  const method = String(formData.get("method") ?? "");
  const country = String(formData.get("country") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "USD").trim();

  await savePayoutPreference("server", guildId, { method, country, currency });

  const db = await getDb();
  const [guild] = await db.select({ slug: schema.discordGuilds.slug })
    .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
  refresh(guild?.slug);
  return { ok: true, message: "Saved. We'll use this next time we pay you." };
}

/**
 * Open the provider's own onboarding page.
 *
 * Returns a URL, never a form. With Trolley connected this is a signed widget
 * URL the portal embeds in an iframe — the owner types their bank details into
 * Trolley's page, inside our layout, and nothing they type reaches this origin.
 * With nothing connected it returns null and the portal says, honestly, that
 * we'll arrange it over the message thread.
 */
export async function startPayoutOnboarding(guildId: string): Promise<Res> {
  const unlocked = await hasPortalSession("server", guildId);
  const user = await getCurrentUser();
  if (!unlocked && !(user && (user.role === "admin" || user.role === "superadmin"))) {
    return { error: "Open your portal with your key first." };
  }

  const owner = await guildOwner(guildId);
  if (!owner.guild) return { error: "That server isn't on the platform." };

  const { adapter } = await payer("payout");
  const res = await adapter.onboardingUrl({
    ref: guildId,
    name: owner.name,
    email: owner.email,
    country: owner.country,
  });
  if (!res.ok) return { error: res.error };

  if (res.recipientRef) {
    await savePayoutPreference("server", guildId, {
      providerKey: adapter.key,
      providerRecipientId: res.recipientRef,
      status: "pending",
    });
  }
  refresh(owner.guild.slug);
  return { ok: true, url: res.url };
}
