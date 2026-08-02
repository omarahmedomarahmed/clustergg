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
  await requireSystemFor("/admin/ads");
  const db = await getDb();
  const state = await offers();
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

  revalidatePath("/admin/ads");
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
  await requireSystemFor("/admin/ads");
  const brandId = String(fd.get("brandId") ?? "");
  if (!brandId) return { error: "No brand named." };
  const db = await getDb();
  const state = await offers();
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!brand) return { error: "No such brand." };
  if (brand.founderCreditAt) return { ok: `${brand.name} already has its founding credit.` };

  await db.update(schema.brands)
    .set({ founderCreditAt: new Date(), founderCreditValue: state.founderCredit })
    .where(eq(schema.brands.id, brandId));
  revalidatePath("/admin/brands");
  return { ok: `$${state.founderCredit.toLocaleString()} of challenge credit granted to ${brand.name}.` };
}
