"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { requireSystemFor } from "@/lib/departments";
import { getDb, schema } from "@/lib/db";
import { sweepWelcomeChallenges, grantWelcomeChallenge, askForGames } from "@/lib/welcome-challenge";
import { FOUNDER_BRAND_CAP, offers } from "@/lib/offers";

export type OfferActionState = { ok?: string; error?: string } | undefined;

// Running the founding offers.
//
// Both are retroactive on purpose, and retroactive means somebody has to press
// something for the people who were already here. These are those presses.
// Every one of them is idempotent — a second press grants nothing twice —
// because an offer that double-pays on a double-click is a budget with a hole
// in it, and the person pressing has no way to know.

/**
 * Give every server that hasn't had one its funded welcome challenge.
 *
 * Includes every server that installed the bot before this offer existed. The
 * ones we cannot serve — because they never told us what they play — are
 * reported by name rather than guessed at, because running a Fortnite
 * competition in a chess community is worse than running none.
 */
export async function sweepServerWelcome(_prev: OfferActionState): Promise<OfferActionState> {
  await requireSystemFor("/admin/discord");
  const state = await offers();
  if (!state.campaign.server.enabled) {
    return { error: "The server welcome campaign is switched off. Turn it on in Admin → Founding offers first." };
  }
  const res = await sweepWelcomeChallenges(100);
  const bits: string[] = [];
  if (res.granted) bits.push(`${res.granted} welcome challenge${res.granted === 1 ? "" : "s"} created and announced`);
  if (res.already) bits.push(`${res.already} already had one`);
  if (res.needAsking.length) {
    bits.push(
      `${res.needAsking.length} can't be served yet — we don't know what they play: `
      + res.needAsking.slice(0, 6).map((g) => g.name).join(", ")
      + (res.needAsking.length > 6 ? `, and ${res.needAsking.length - 6} more` : ""),
    );
  }
  if (res.failed) bits.push(`${res.failed} failed`);
  revalidatePath("/admin/discord");
  return { ok: bits.length ? `${bits.join(". ")}.` : "Every server already has its welcome challenge." };
}

/** One server, by hand — for the ones the sweep reported. */
export async function grantOneWelcome(_prev: OfferActionState, fd: FormData): Promise<OfferActionState> {
  await requireSystemFor("/admin/discord");
  const state = await offers();
  if (!state.campaign.server.enabled) {
    return { error: "The server welcome campaign is switched off. Turn it on in Admin → Founding offers first." };
  }
  const guildId = String(fd.get("guildId") ?? "");
  if (!guildId) return { error: "No server named." };
  const res = await grantWelcomeChallenge(guildId);
  revalidatePath("/admin/discord");
  if (!res.ok) {
    return {
      error: res.reason === "no_game"
        ? "That server hasn't told us what it plays yet — ask them first, then run this."
        : res.reason === "no_guild" ? "No such server." : "Couldn't create it. Try again.",
    };
  }
  return { ok: res.already ? "That server already has one." : `Welcome challenge created on ${res.game} and announced.` };
}

/**
 * DM the owners of every server we can't serve, asking what they play.
 *
 * The message leads with the offer rather than the question: "tell us your
 * games" is a form, "tell us your games and we fund a competition for your
 * members this week" is a reason to reply.
 */
export async function askServersForGames(_prev: OfferActionState): Promise<OfferActionState> {
  await requireSystemFor("/admin/discord");
  const db = await getDb();
  const pending = await db.select({ guildId: schema.discordGuilds.guildId })
    .from(schema.discordGuilds)
    .where(and(eq(schema.discordGuilds.status, "active"), isNull(schema.discordGuilds.welcomeChallengeAt)))
    .limit(100);

  let sent = 0;
  let closed = 0;
  for (const g of pending) {
    // A DM to somebody with DMs closed is not a failure of ours, but the
    // difference matters to whoever is chasing them — so it is counted apart.
    if (await askForGames(g.guildId)) sent++;
    else closed++;
  }
  revalidatePath("/admin/discord");
  return {
    ok: `Asked ${sent} owner${sent === 1 ? "" : "s"} what their community plays.`
      + (closed ? ` ${closed} couldn't be reached — DMs closed or no owner on record.` : ""),
  };
}

/**
 * Grant the founding month of challenge credit to every brand that hasn't had
 * it — including every brand that signed BEFORE the offer existed.
 *
 * This is the part of the offer that is easy to skip and shouldn't be. An offer
 * only new signups can take teaches everybody already paying you that waiting
 * would have been the better move, and the brands who backed you first are
 * exactly the ones you cannot afford to teach that.
 */
export async function grantFounderCredit(_prev: OfferActionState): Promise<OfferActionState> {
  await requireSystemFor("/admin/offers");
  const db = await getDb();
  const state = await offers();
  // OFF means off (B44). The counters keep counting — switching a campaign off
  // does not un-give what was already given — but nothing new is granted while
  // it is off, and staff are told which of the two reasons applies.
  if (!state.campaign.brand.enabled) {
    return { error: "The founding brand campaign is switched off. Turn it on in Admin → Founding offers first." };
  }
  if (state.brands.claimed >= FOUNDER_BRAND_CAP) {
    return { error: `The founding offer is closed — all ${FOUNDER_BRAND_CAP} taken.` };
  }

  const pending = await db.select({ id: schema.brands.id, name: schema.brands.name })
    .from(schema.brands)
    .where(and(eq(schema.brands.status, "active"), isNull(schema.brands.founderCreditAt)))
    .limit(Math.max(0, FOUNDER_BRAND_CAP - state.brands.claimed));

  for (const b of pending) {
    await db.update(schema.brands)
      .set({ founderCreditAt: new Date(), founderCreditValue: state.founderCredit })
      .where(eq(schema.brands.id, b.id));
  }

  revalidatePath("/admin/offers");
  revalidatePath("/admin/brands");
  return {
    ok: pending.length
      ? `$${(state.founderCredit * pending.length).toLocaleString()} of challenge credit granted to ${pending.length} brand${pending.length === 1 ? "" : "s"} `
        + `— $${state.founderCredit.toLocaleString()} each, existing customers included.`
      : "Every brand already has its founding credit.",
  };
}

/** One brand, by hand. */
export async function grantOneFounderCredit(_prev: OfferActionState, fd: FormData): Promise<OfferActionState> {
  await requireSystemFor("/admin/offers");
  const brandId = String(fd.get("brandId") ?? "");
  if (!brandId) return { error: "No brand named." };
  const db = await getDb();
  const state = await offers();
  if (!state.campaign.brand.enabled) {
    return { error: "The founding brand campaign is switched off. Turn it on in Admin → Founding offers first." };
  }
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!brand) return { error: "No such brand." };
  if (brand.founderCreditAt) return { ok: `${brand.name} already has its founding credit.` };

  await db.update(schema.brands)
    .set({ founderCreditAt: new Date(), founderCreditValue: state.founderCredit })
    .where(eq(schema.brands.id, brandId));
  revalidatePath("/admin/brands");
  return { ok: `$${state.founderCredit.toLocaleString()} of challenge credit granted to ${brand.name}.` };
}

/**
 * The switch and the rate (B44).
 *
 * The only place either campaign turns on. Audit-logged with the before and the
 * after, because "when did we start giving this away and at what percentage" is
 * a question with a real answer and the answer is money.
 */
export async function saveCampaigns(_prev: OfferActionState, fd: FormData): Promise<OfferActionState> {
  const access = await requireSystemFor("/admin/offers");
  const { setContent } = await import("@/lib/cms");
  const { CAMPAIGN_KEYS, clampPct } = await import("@/lib/campaigns");
  const before = await offers();

  const pct = clampPct(Number(fd.get("brandPct") ?? 0));
  const brandOn = fd.get("brandEnabled") === "on";
  const serverOn = fd.get("serverEnabled") === "on";
  const serverValue = Math.max(0, Number(fd.get("serverValue") ?? 0) || 0);
  const brandCap = Math.max(0, Math.floor(Number(fd.get("brandCap") ?? 0) || 0));
  const serverCap = Math.max(0, Math.floor(Number(fd.get("serverCap") ?? 0) || 0));

  try {
    await setContent(CAMPAIGN_KEYS.brandEnabled, brandOn ? "1" : "0");
    await setContent(CAMPAIGN_KEYS.brandPct, String(pct));
    await setContent(CAMPAIGN_KEYS.brandCap, String(brandCap));
    await setContent(CAMPAIGN_KEYS.serverEnabled, serverOn ? "1" : "0");
    await setContent(CAMPAIGN_KEYS.serverValue, String(serverValue));
    await setContent(CAMPAIGN_KEYS.serverCap, String(serverCap));
  } catch {
    return { error: "Couldn't save. Nothing changed." };
  }

  try {
    const { uid } = await import("@/lib/utils");
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      id: uid(), adminId: access.user.id, action: "campaign.save",
      targetType: "campaign", targetId: "founding-offers",
      meta: {
        from: { brand: before.campaign.brand, server: before.campaign.server },
        to: { brand: { enabled: brandOn, pct, cap: brandCap },
              server: { enabled: serverOn, value: serverValue, cap: serverCap } },
      },
    });
  } catch { /* the setting saved; a missing log entry must not undo it */ }

  revalidatePath("/admin/offers");
  revalidatePath("/admin/billing");
  // Said as spend, because that is what it is.
  return {
    ok: brandOn
      ? `Saved. The brand campaign is ON, covering ${pct}% of sponsored challenges on every new invoice.`
      : "Saved. The brand campaign is OFF — new invoices bill at full price.",
  };
}

// ===== The admin side of the welcome challenge (B43) =====
//
// Every one of these is audit-logged with who and what, because they move
// money: completing one commits a prize pool already on Cluster's bill, and
// cancelling one voids a line on an invoice somebody will later reconcile.

async function logWelcome(adminId: string, action: string, challengeId: string, meta: Record<string, unknown>) {
  try {
    const db = await getDb();
    const { uid } = await import("@/lib/utils");
    await db.insert(schema.auditLog).values({
      id: uid(), adminId, action, targetType: "challenge", targetId: challengeId, meta,
    } as never);
  } catch { /* the action succeeded; a missing log entry must not undo it */ }
}

/** Admin picks the game a stuck draft runs on. Still a draft afterwards. */
export async function adminCompleteWelcome(_prev: OfferActionState, fd: FormData): Promise<OfferActionState> {
  const access = await requireSystemFor("/admin/offers");
  const challengeId = String(fd.get("challengeId") ?? "");
  const game = String(fd.get("game") ?? "").trim();
  if (!challengeId || !game) return { error: "Pick a game." };

  const { completeWelcome } = await import("@/lib/welcome-admin");
  const res = await completeWelcome(challengeId, game);
  if (!res.ok) {
    return { error: res.reason === "no_provider"
      ? `We cannot verify scores on ${game}, so a competition on it would not have a leaderboard.`
      : res.reason === "no_planet" ? `There is no planet for ${game} yet.`
      : res.reason === "not_a_draft" ? "That one is not a draft any more."
      : "Couldn't complete it." };
  }
  await logWelcome(access.user.id, "welcome.complete", challengeId, { game });
  revalidatePath("/admin/offers");
  revalidatePath("/admin/challenges");
  return { ok: `Set to ${game}. It is still a draft — publish it from Challenges when it reads right.` };
}

/** Cancel a draft nobody is going to finish. The invoice line is voided. */
export async function adminCancelWelcome(_prev: OfferActionState, fd: FormData): Promise<OfferActionState> {
  const access = await requireSystemFor("/admin/offers");
  const challengeId = String(fd.get("challengeId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim() || "no game we could run it on";
  if (!challengeId) return { error: "No challenge named." };

  const { cancelWelcome } = await import("@/lib/welcome-admin");
  const res = await cancelWelcome(challengeId, reason);
  if (!res.ok) {
    return { error: res.reason === "already_ran"
      ? "That one has already run — cancelling it would rewrite history."
      : "Couldn't cancel it." };
  }
  await logWelcome(access.user.id, "welcome.cancel", challengeId, { reason });
  revalidatePath("/admin/offers");
  return { ok: "Cancelled. Its invoice line is voided, not deleted, and the server can be offered one again." };
}

/** Create one for any server, at any time (B43.2). */
export async function adminCreateWelcome(_prev: OfferActionState, fd: FormData): Promise<OfferActionState> {
  const access = await requireSystemFor("/admin/offers");
  const guildId = String(fd.get("guildId") ?? "").trim();
  const game = String(fd.get("game") ?? "").trim();
  if (!guildId || !game) return { error: "Pick a server and a game." };

  const state = await offers();
  const value = Number(fd.get("value") ?? 0) || state.campaign.server.value;

  const { createWelcomeFor } = await import("@/lib/welcome-admin");
  const res = await createWelcomeFor(guildId, game, value);
  if (!res.ok) {
    return { error: res.reason === "already_has_one"
      ? "That server already has a welcome challenge. Cancel it first if it is stuck."
      : res.reason === "no_provider" ? `We cannot verify scores on ${game}.`
      : res.reason === "no_planet" ? `There is no planet for ${game} yet.`
      : res.reason === "no_guild" ? "No such server."
      : "Couldn't create it." };
  }
  await logWelcome(access.user.id, "welcome.create", res.challengeId, { guildId, game, value });
  revalidatePath("/admin/offers");
  return { ok: `Drafted a ${game} welcome challenge, billed to Cluster at $${value}.` };
}
