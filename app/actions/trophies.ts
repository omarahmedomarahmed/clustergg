"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { lockGamer, withTx } from "@/lib/db/tx";
import { getCurrentUser, requireStaff } from "@/lib/auth";
import { payer } from "@/lib/payments";
import { METHOD_OPTIONS, savePayoutPreference } from "@/lib/payouts";
import { uid } from "@/lib/utils";
import { emailUser } from "@/lib/email";
import { awardQuestAction } from "@/lib/quests";

// Cashing out a trophy.
//
// This flow used to ask a gamer for a routing number, an account number and an
// account type, store all three, and mask them to a last-4 in the UI. It
// doesn't any more, and the old values have been erased — see the migration
// block in lib/db/index.ts.
//
// What replaced it. The gamer says HOW they'd like to be paid, as one word:
// bank, PayPal, mobile wallet, gift card. Staff approve. The payout provider is
// then handed an amount and a name and returns a link; the gamer opens that
// link and chooses for themselves, on the provider's page, in their own
// country, between two thousand options. We never learn which one they picked
// and we never hold the destination.
//
// That is not only safer, it is the only version that works globally. A form
// with "routing number (9 digits)" on it is a form that cannot pay anybody
// outside the United States, and most of a gaming audience is outside the
// United States.
//
// Award states along the way: held → pending (locked in a request) → redeemed
// (paid). A cancelled or rejected request puts them back.

const MAX_METHOD_CHANGES = 3;

function revalidateTrophyPages() {
  revalidatePath("/feed");
  revalidatePath("/profile");
  revalidatePath("/admin/redeems");
}

async function notify(db: Awaited<ReturnType<typeof getDb>>, userId: string, title: string, body: string, href: string) {
  await db.insert(schema.notifications).values({ id: uid(), userId, type: "trophy", title, body, href });
}

/**
 * Tell the people who can act on it.
 *
 * `role = "admin"` matched NOBODY. Every account in this codebase is
 * `superadmin`, `staff` or `user` — so every "payout preference locked" notice
 * this has ever raised went to zero people, silently, since it was written.
 * Found while building B45, which copied the same query.
 */
async function notifyAdmins(db: Awaited<ReturnType<typeof getDb>>, title: string, body: string) {
  const admins = await db.select({ id: schema.users.id }).from(schema.users)
    .where(inArray(schema.users.role, ["admin", "superadmin"])).limit(10);
  for (const a of admins) await notify(db, a.id, title, body, "/admin/redeems");
}

const methodLabel = (m: string) => METHOD_OPTIONS.find((o) => o.key === m)?.label ?? m;

// ===== Gamer: request a redeem =====
export async function requestRedeem(input: {
  awardIds: string[];
  currency: string;
  /** A preference, not a destination. See METHOD_OPTIONS. */
  method: string;
  /** ISO-3166 alpha-2, so the provider offers methods that exist where they live. */
  country?: string;
  /**
   * The age BAND, if they are answering it here. B72.4.
   *
   * Was `birthDate`, a yyyy-mm-dd asked for at the first redemption — which is
   * the worst possible moment, because by then we hold a child's identity,
   * their linked accounts and their activity, and the answer converts all of it
   * into COPPA "actual knowledge". The band is now asked on sign-in; this
   * remains only so a gamer who somehow reaches redemption without one can
   * answer without being sent away.
   */
  ageBand?: string;
}): Promise<{ ok?: true; error?: string; needs?: ("age" | "country")[] }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  const db = await getDb();

  // Locked trophies cannot be cashed out. B83.
  //
  // Before the age and country checks, because this one is the cheapest to
  // answer and the least ambiguous — and because a gamer told "we need your
  // country" and THEN told "actually you also have to finish onboarding" has
  // been asked twice for two different things.
  //
  // Trophies won before unlocking are held with everything else. They are not
  // taken: the message says the points are safe, because they are, and the
  // release is two taps away.
  {
    const { unlockState } = await import("@/lib/unlock");
    const state = await unlockState(db, user.id);
    if (!state.unlocked) {
      return {
        error: "Finish setting up your account before cashing out — link a game, confirm your email, and tell us your age and country. Everything you have won is held safely until you do.",
      };
    }
  }

  // B37: age and country, before anything else happens.
  //
  // FIRST, ahead of the payout-preference write and well ahead of any provider
  // call, because the point of refusing here is that the gamer's trophies are
  // never locked into a request that cannot complete. Being told "we cannot pay
  // your country" after the trophies have moved to `pending` is the failure this
  // exists to prevent.
  {
    const { eligibilityFor, eligibilityOf, ageForBand } = await import("@/lib/eligibility");
    // Anything supplied on this submission is saved first, so a gamer answering
    // the question is not refused for not having answered it.
    const patch: Record<string, unknown> = {};
    if (input.ageBand) {
      const { parseBand } = await import("@/lib/age");
      const band = parseBand(input.ageBand);
      if (!band) return { error: "Pick one of the two age ranges." };
      // ANSWERED ONCE. B95 — the band is set on the onboarding page and cannot
      // be rewritten from a cash-out form, which is precisely where somebody
      // has a reason to rewrite it. A band already on file wins, and the
      // eligibility check below then refuses on the real one.
      const [existing] = await db.select({ band: schema.users.ageBand })
        .from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
      if (!existing?.band) {
        patch.ageBand = band;
        patch.ageBandSetAt = new Date();
      }
    }
    if (input.country) patch.country = input.country.trim().toUpperCase().slice(0, 2);
    if (Object.keys(patch).length) {
      await db.update(schema.users).set(patch).where(eq(schema.users.id, user.id));
    }
    const elig = Object.keys(patch).length
      ? eligibilityOf(
          ageForBand((patch.ageBand as string) ?? null) ?? (await eligibilityFor(db, user.id)).age,
          (patch.country as string) ?? user.country ?? null,
        )
      : await eligibilityFor(db, user.id);
    if (!elig.ok) return { error: elig.message, needs: elig.missing };
  }

  if (!METHOD_OPTIONS.some((m) => m.key === input.method)) {
    return { error: "Pick how you'd like to be paid." };
  }
  const currency = (input.currency || "USD").slice(0, 3).toUpperCase();

  // The 3-change lock survives, because a payout preference that keeps moving
  // is still the signal it always was — it just guards a word now instead of a
  // bank account, so being locked out costs the gamer nothing but a message.
  const [me] = await db.select({ pm: schema.users.payoutMethod, changes: schema.users.payoutChanges })
    .from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  const incoming = { currency, method: input.method };
  const same = me?.pm && me.pm.currency === currency && me.pm.method === input.method;
  if (!same) {
    const changes = Number(me?.changes ?? 0);
    if (me?.pm && changes >= MAX_METHOD_CHANGES) {
      return { error: "Your payout preference is locked after 3 changes — message support to update it." };
    }
    await db.update(schema.users)
      .set({ payoutMethod: incoming, payoutChanges: me?.pm ? changes + 1 : changes })
      .where(eq(schema.users.id, user.id));
    if (me?.pm && changes + 1 >= MAX_METHOD_CHANGES) {
      await notifyAdmins(db, "Payout preference locked", `${user.displayName} (@${user.slug}) changed their trophy payout preference ${changes + 1} times — now locked. Review the account.`);
    }
  }
  await savePayoutPreference("gamer", user.id, {
    method: input.method,
    country: input.country ?? user.country ?? null,
    currency,
  });

  // Lock the awards + compute the amount from the live trophy values.
  const ids = [...new Set(input.awardIds)].slice(0, 50);
  if (ids.length === 0) return { error: "Select at least one trophy." };
  const redeemId = uid();

  // B74 — the "are these still held?" check and the claim on them, in ONE
  // transaction behind a lock on this gamer.
  //
  // This is the worst of the three races because it is the one denominated in
  // DOLLARS. Two submissions of the same trophies — a double-click, a retried
  // request, two tabs — both read status "held", both passed the check, and both
  // created a redemption. Staff would then see two pending payouts for one
  // trophy, and the honest ones get paid twice.
  //
  // The status update is also narrowed to rows still `held`, so even without the
  // lock the second writer would claim nothing. Belt and braces on purpose: the
  // lock is the correctness argument, the narrowed WHERE is what makes the
  // failure visible instead of silent if somebody later moves this off the
  // pooled driver.
  const claim = await withTx(db, async (tx) => {
    await lockGamer(tx, user.id);

    const awards = await tx.select({ id: schema.userTrophies.id, value: schema.trophies.value })
      .from(schema.userTrophies)
      .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
      .where(and(inArray(schema.userTrophies.id, ids), eq(schema.userTrophies.userId, user.id), eq(schema.userTrophies.status, "held")));
    if (awards.length !== ids.length) return { error: "Some trophies are no longer available to redeem." as const };
    const amount = awards.reduce((s, a) => s + Number(a.value ?? 0), 0);
    if (amount <= 0) return { error: "These trophies have no redeemable value yet." as const };

    await tx.insert(schema.trophyRedeems).values({
      id: redeemId, userId: user.id, awardIds: ids, amount,
      currency, method: input.method, status: "pending",
    });
    await tx.update(schema.userTrophies).set({ status: "pending" })
      .where(and(inArray(schema.userTrophies.id, ids), eq(schema.userTrophies.status, "held")));
    return { amount };
  });
  if ("error" in claim) return { error: claim.error };
  const { amount } = claim;

  // Cashing out earns on the ascension quest (B15).
  //
  // Awarded at REQUEST, not at payment. The alternative — award when staff mark
  // it paid — makes a gamer's points depend on how quickly a human got to a
  // queue, which is not something they did. The dedup key is the redemption, so
  // the same request cannot pay twice however often this runs, and the daily cap
  // in the catalogue stops somebody redeeming one trophy at a time for points.
  await awardQuestAction(db, user.id, "redeem_trophy", { refType: "redeem", refId: redeemId });
  await notifyAdmins(db, "Trophy redeem request", `${user.displayName} (@${user.slug}) requested $${amount.toLocaleString()} ${currency} for ${ids.length} ${ids.length === 1 ? "trophy" : "trophies"} — prefers ${methodLabel(input.method).toLowerCase()}.`);
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

/**
 * "I've collected it."
 *
 * The gamer opens the provider's link, chooses their payout and comes back to
 * say so. That closes the request and turns the trophies into history.
 *
 * Their word is enough here on purpose: the money has already left, the
 * provider has its own record of the redemption, and making somebody chase
 * staff to mark their own payout received would be a support queue built out of
 * nothing. Staff can still mark it paid themselves, and the provider's
 * dashboard is the authority if the two ever disagree.
 */
export async function confirmRedeem(redeemId: string): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  const db = await getDb();
  const [r] = await db.select().from(schema.trophyRedeems)
    .where(and(eq(schema.trophyRedeems.id, redeemId), eq(schema.trophyRedeems.userId, user.id))).limit(1);
  if (!r) return { error: "Nothing to confirm." };
  if (r.status !== "sent") return { error: "This payout hasn't been sent yet." };

  await db.update(schema.trophyRedeems)
    .set({ status: "paid", gamerConfirmedAt: new Date(), paidAt: new Date() })
    .where(eq(schema.trophyRedeems.id, r.id));
  if (r.awardIds?.length) {
    await db.update(schema.userTrophies).set({ status: "redeemed" }).where(inArray(schema.userTrophies.id, r.awardIds));
  }
  await notifyAdmins(db, "Trophy payout collected", `${user.displayName} (@${user.slug}) collected their $${Number(r.amount).toLocaleString()} ${r.currency} payout.`);
  revalidateTrophyPages();
  return { ok: true };
}

// ===== Staff lifecycle =====

export async function approveRedeem(redeemId: string) {
  await requireStaff();
  const db = await getDb();
  const [r] = await db.select().from(schema.trophyRedeems).where(eq(schema.trophyRedeems.id, redeemId)).limit(1);
  if (!r || r.status !== "pending") return;
  await db.update(schema.trophyRedeems).set({ status: "approved", decidedAt: new Date() }).where(eq(schema.trophyRedeems.id, r.id));
  await notify(db, r.userId,
    "Trophy redeem approved",
    `Your $${Number(r.amount).toLocaleString()} ${r.currency} payout is approved. We'll send it shortly — you'll get a link to choose exactly how you want the money.`,
    "/profile");
  // And by email, because an in-app notification only reaches somebody who
  // comes back. This is money; it should find them.
  //
  // AWAITED, not fired and forgotten: a floating promise in a server action is
  // frozen the moment the request returns, and an un-awaited send is a receipt
  // nobody gets. `sendEmail` never throws, so awaiting it costs a round trip and
  // risks nothing.
  await emailUser(db, r.userId, "redeem.approved", (name: string) => ({ name, amount: { amount: Number(r.amount), currency: r.currency } }), { type: "redeem", id: r.id });
  revalidateTrophyPages();
}

/**
 * Send it.
 *
 * The only place in the gamer-facing product that talks to a payment provider.
 * With Tremendous connected this mints a redemption link and the gamer picks
 * their own method; with nothing connected it moves to "sent" with no link and
 * staff transfer it by hand, which is a complete and honest workflow rather
 * than a broken one.
 */
export async function sendRedeem(redeemId: string): Promise<{ ok?: true; error?: string; link?: string | null }> {
  await requireStaff();
  const db = await getDb();
  const [r] = await db.select().from(schema.trophyRedeems).where(eq(schema.trophyRedeems.id, redeemId)).limit(1);
  if (!r) return { error: "That request no longer exists." };
  if (r.status !== "approved") return { error: "Approve it first." };

  const [gamer] = await db.select({
    id: schema.users.id, name: schema.users.displayName,
    email: schema.users.email, country: schema.users.country,
  }).from(schema.users).where(eq(schema.users.id, r.userId)).limit(1);
  if (!gamer) return { error: "That gamer no longer exists." };

  const { adapter } = await payer("rewards");
  const res = await adapter.send({
    payoutRef: r.id,
    to: { ref: gamer.id, name: gamer.name, email: gamer.email, country: gamer.country },
    amount: { amount: Number(r.amount), currency: r.currency },
    memo: `Cluster trophy payout — ${(r.awardIds ?? []).length} ${((r.awardIds ?? []).length === 1 ? "trophy" : "trophies")}`,
  });
  // A failed send stays APPROVED and records WHY (B39).
  //
  // It used to return the provider's error to whoever pressed the button and
  // write nothing. The state was right — approved, not lost — but the reason
  // lived in a toast that closed, so the next person saw an approved payout that
  // had simply never gone out and no way to know it had been tried.
  if (!res.ok) {
    await db.update(schema.trophyRedeems)
      .set({ failedReason: res.error ?? "The payout provider refused it and gave no reason." })
      .where(eq(schema.trophyRedeems.id, r.id));
    return { error: res.error };
  }

  await db.update(schema.trophyRedeems).set({
    status: "sent",
    // Cleared: this one went.
    failedReason: null,
    sentAt: new Date(),
    providerKey: adapter.key,
    providerRef: res.ref || null,
    collectUrl: res.link || null,
  }).where(eq(schema.trophyRedeems.id, r.id));

  await notify(db, r.userId,
    res.link ? "Your trophy payout is ready to collect" : "Your trophy payout is on its way",
    res.link
      ? `Open your trophy case to collect $${Number(r.amount).toLocaleString()} ${r.currency} — you choose how you want it: bank transfer, PayPal, a prepaid card or a gift card in your own currency.`
      : `$${Number(r.amount).toLocaleString()} ${r.currency} is being sent by ${methodLabel(r.method).toLowerCase()}. We'll confirm when it lands.`,
    "/profile");

  // The email that matters most in the product: money is waiting and it needs a
  // click. Only sent when there IS a link — a "collect it" mail with nothing to
  // collect is worse than silence, and the no-link path is the manual-transfer
  // workflow where staff move the money themselves.
  if (res.link) {
    await emailUser(db, r.userId, "redeem.ready",
      (name: string) => ({ name, amount: { amount: Number(r.amount), currency: r.currency }, collectUrl: res.link! }),
      { type: "redeem", id: r.id });
  }
  revalidateTrophyPages();
  return { ok: true, link: res.link ?? null };
}

export async function rejectRedeem(redeemId: string) {
  await requireStaff();
  const db = await getDb();
  const [r] = await db.select().from(schema.trophyRedeems).where(eq(schema.trophyRedeems.id, redeemId)).limit(1);
  if (!r || (r.status !== "pending" && r.status !== "approved")) return;
  await db.update(schema.trophyRedeems).set({ status: "rejected", decidedAt: new Date() }).where(eq(schema.trophyRedeems.id, r.id));
  if (r.awardIds?.length) await db.update(schema.userTrophies).set({ status: "held" }).where(inArray(schema.userTrophies.id, r.awardIds));
  await notify(db, r.userId, "Trophy redeem declined", "Your redeem request was declined — your trophies are back on your shelf. Message support for details.", "/profile");
  revalidateTrophyPages();
}

/**
 * Staff record that it landed.
 *
 * Used for a manual transfer, and as the override when a gamer has collected
 * but never came back to say so. `proofUrl` is a receipt staff uploaded — an
 * image of a bank confirmation, not an instrument.
 */
export async function markRedeemPaid(redeemId: string, formData: FormData) {
  await requireStaff();
  const db = await getDb();
  const proofUrl = String(formData.get("proofUrl") ?? "").trim();
  const [r] = await db.select().from(schema.trophyRedeems).where(eq(schema.trophyRedeems.id, redeemId)).limit(1);
  if (!r || (r.status !== "approved" && r.status !== "sent")) return;
  await db.update(schema.trophyRedeems)
    .set({ status: "paid", paidAt: new Date(), proofUrl: proofUrl || null })
    .where(eq(schema.trophyRedeems.id, r.id));
  if (r.awardIds?.length) await db.update(schema.userTrophies).set({ status: "redeemed" }).where(inArray(schema.userTrophies.id, r.awardIds));
  await notify(db, r.userId,
    "Trophy redeem paid",
    `Your $${Number(r.amount).toLocaleString()} ${r.currency} payout was sent${proofUrl ? " — the confirmation is attached to the request" : ""}. The redeemed trophies moved to your history.`,
    "/profile");
  revalidateTrophyPages();
}
