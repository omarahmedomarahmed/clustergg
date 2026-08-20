"use server";

// Admin actions. Every one of them calls a tested module and decides nothing.
//
// The rule that shapes this file: **an action that moves a challenge forward
// or moves money takes an actor**, and gets it from the session rather than
// from the form. A form field naming who did something is a form field
// somebody can change.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../lib/db/index.ts";
import { currentStaff } from "../../lib/admin/session.ts";
import { announce } from "../../lib/challenges/lifecycle.ts";
import { createTrophy, checkPrizePool } from "../../lib/trophies/trophies.ts";
import { allocateToPool } from "../../lib/money/pool.ts";
import { releasePayout, markPayoutPaid } from "../../lib/money/payouts.ts";
import {
  approveRedemption,
  markSent,
  markRedemptionPaid,
  rejectRedemption,
} from "../../lib/trophies/redemption.ts";
import { sweep } from "../../lib/trophies/settle.ts";
import { isQueue } from "../../lib/providers/registry.ts";

async function actor(): Promise<string> {
  const staff = await currentStaff();
  if (!staff) redirect("/signup");
  return staff.userId;
}

function back(path: string, error?: string): never {
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : "That did not work.";
}

/** Editor steps 1–5: game, metrics, queue, rank gate, places. */
export async function saveSetupAction(form: FormData): Promise<void> {
  await actor();
  const id = String(form.get("challengeId"));
  const db = await getDb();

  const weights: Record<string, number> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("metric:")) continue;
    const weight = Number(value);
    if (Number.isFinite(weight) && weight > 0) weights[key.slice(7)] = weight;
  }

  const queue = String(form.get("queue") ?? "solo");
  const rankMin = form.get("rankMin") ? Number(form.get("rankMin")) : null;
  const rankMax = form.get("rankMax") ? Number(form.get("rankMax")) : null;
  const places = Number(form.get("places") ?? 1);

  if (!isQueue(queue)) back(`/admin/challenges/${id}`, "That is not a queue.");
  if (rankMin !== null && rankMax !== null && rankMin > rankMax) {
    back(`/admin/challenges/${id}`, "A rank gate is a range: the floor cannot be above the ceiling.");
  }

  await db
    .update(schema.challenges)
    .set({
      metrics: Object.keys(weights).length > 0 ? weights : null,
      queue,
      rankMin,
      rankMax,
      places: Number.isFinite(places) && places > 0 ? Math.floor(places) : 1,
    })
    .where(eq(schema.challenges.id, id));

  revalidatePath(`/admin/challenges/${id}`);
  back(`/admin/challenges/${id}`);
}

/** Editor step 6: assign a podium trophy. The pool guard reports after. */
export async function addTrophyAction(form: FormData): Promise<void> {
  await actor();
  const id = String(form.get("challengeId"));
  const db = await getDb();

  const dollars = Number(form.get("valueDollars") ?? 0);
  if (!Number.isFinite(dollars) || dollars < 0) {
    back(`/admin/challenges/${id}`, "A trophy value is a number of dollars.");
  }

  try {
    await createTrophy(db, {
      type: "podium",
      name: String(form.get("name") || "Champion"),
      valueCents: Math.round(dollars * 100),
      challengeId: id,
      place: Number(form.get("place") ?? 1),
    });
  } catch (e) {
    back(`/admin/challenges/${id}`, reason(e));
  }
  revalidatePath(`/admin/challenges/${id}`);
  back(`/admin/challenges/${id}`);
}

export async function removeTrophyAction(form: FormData): Promise<void> {
  await actor();
  const id = String(form.get("challengeId"));
  const trophyId = String(form.get("trophyId"));
  const db = await getDb();

  // T9/V7 — trophies lock at `ended`, and a trophy somebody holds is not
  // scaffolding to be tidied away.
  const holders = await db
    .select({ id: schema.userTrophies.id })
    .from(schema.userTrophies)
    .where(eq(schema.userTrophies.trophyId, trophyId));
  if (holders.length > 0) {
    back(`/admin/challenges/${id}`, "Somebody holds that trophy. It cannot be removed.");
  }

  await db.delete(schema.trophies).where(eq(schema.trophies.id, trophyId));
  revalidatePath(`/admin/challenges/${id}`);
  back(`/admin/challenges/${id}`);
}

/** Editor step 7. Refuses unless 1–6 are complete and the bill is paid. */
export async function announceAction(form: FormData): Promise<void> {
  const who = await actor();
  const id = String(form.get("challengeId"));
  const db = await getDb();

  const guildIds = (await db.select().from(schema.guilds))
    .filter((g) => !g.removedAt)
    .map((g) => g.guildId);

  try {
    await announce(db, id, who, guildIds);
    // ===== THE CARD THAT MAKES ANY OF THIS HAPPEN =====
    //
    // `announce` records which servers were announced to and flips the state.
    // It posted **nothing** — so the first step of the gamer's nine, *"a card
    // appears in their server"*, did not exist, and the entire top of the
    // funnel was a state change nobody could see.
    //
    // A3 — it enqueues and returns. Nothing fans out per-guild inline from a
    // request; the cron drains it every five minutes. C1/L1 — this is inside
    // the admin action, and there is no other caller, because nothing
    // announces itself.
    const { announceChallenge } = await import("../../lib/discord/announce.ts");
    await announceChallenge(db, id, guildIds);
  } catch (e) {
    back(`/admin/challenges/${id}`, reason(e));
  }
  revalidatePath("/admin");
  back(`/admin/challenges/${id}`);
}

export async function allocatePoolAction(form: FormData): Promise<void> {
  const who = await actor();
  const db = await getDb();
  const dollars = Number(form.get("amountDollars") ?? 0);
  const weekStart = new Date(String(form.get("weekStart")));

  try {
    await allocateToPool(db, {
      weekStart,
      amountCents: Math.round(dollars * 100),
      actorId: who,
    });
  } catch (e) {
    back("/admin/vaults/server", reason(e));
  }
  revalidatePath("/admin/vaults/server");
  back("/admin/vaults/server");
}

export async function releasePayoutAction(form: FormData): Promise<void> {
  const who = await actor();
  const db = await getDb();
  try {
    await releasePayout(db, String(form.get("payoutId")), who);
  } catch (e) {
    back("/admin/payouts", reason(e));
  }
  revalidatePath("/admin/payouts");
  back("/admin/payouts");
}

export async function markPayoutPaidAction(form: FormData): Promise<void> {
  const who = await actor();
  const db = await getDb();
  try {
    await markPayoutPaid(db, String(form.get("payoutId")), who);
  } catch (e) {
    back("/admin/payouts", reason(e));
  }
  revalidatePath("/admin/payouts");
  back("/admin/payouts");
}

export async function redemptionAction(form: FormData): Promise<void> {
  const who = await actor();
  const db = await getDb();
  const id = String(form.get("redemptionId"));
  const step = String(form.get("step"));

  try {
    if (step === "approve") await approveRedemption(db, id, who);
    else if (step === "send") await markSent(db, id, who);
    else if (step === "paid") await markRedemptionPaid(db, id, who);
    else if (step === "reject") {
      await rejectRedemption(db, id, who, String(form.get("reason") || "No reason given"));
    }
  } catch (e) {
    back("/admin/redeems", reason(e));
  }
  revalidatePath("/admin/redeems");
  back("/admin/redeems");
}

export async function sweepAction(form: FormData): Promise<void> {
  const who = await actor();
  const db = await getDb();
  const kind = String(form.get("reason"));
  if (kind !== "orphaned" && kind !== "expired") {
    back("/admin/vaults/prize", "A sweep is orphaned or expired.");
  }
  try {
    await sweep(db, { actorId: who, reason: kind });
  } catch (e) {
    back("/admin/vaults/prize", reason(e));
  }
  revalidatePath("/admin/vaults/prize");
  back("/admin/vaults/prize");
}

export { checkPrizePool };

// ===== SPRINT 13 — THE BUILDER, TEMPLATES, AND THE REST OF THE CONSOLE =====

/**
 * Build a challenge or a series. 05 §2's builder.
 *
 * **Admin enters the prize; the system computes the bill.** Never the reverse.
 * That is `planSeries`, and this action does not do the arithmetic — it reads
 * the form, hands it over, and carries the refusal back. A builder that
 * computed its own preview would be the second implementation the rule exists
 * to prevent.
 */
export async function createSeriesAction(form: FormData): Promise<void> {
  const who = await actor();
  const db = await getDb();

  const { planSeries, createSeries, SeriesRefused } = await import(
    "../../lib/challenges/series.ts"
  );
  const { weekStartPlus, dayStartFor } = await import("../../lib/challenges/week.ts");

  const cadence = String(form.get("cadence") ?? "weekly") === "daily" ? "daily" : "weekly";
  const instances = Number(form.get("instances") ?? 1);
  const prizeDollars = Number(form.get("prizeDollars") ?? 0);
  const weeksAhead = Number(form.get("weeksAhead") ?? 1);
  const now = new Date();

  try {
    const plan = planSeries({
      cadence,
      instances,
      prizePerInstanceCents: Math.round(prizeDollars * 100),
      // C5/L6 — there is no date picker. The form offers "which week" or
      // "which day", and the boundary is computed rather than typed.
      startAt:
        cadence === "weekly"
          ? weekStartPlus(now, Math.max(1, weeksAhead))
          : dayStartFor(new Date(now.getTime() + Math.max(1, weeksAhead) * 24 * 60 * 60 * 1000)),
    });

    const brandId = String(form.get("sponsorBrandId") ?? "").trim();
    const { seriesId } = await createSeries(db, {
      title: String(form.get("title") ?? "").trim() || "Untitled challenge",
      game: String(form.get("game") ?? "").trim(),
      provider: String(form.get("provider") ?? "").trim(),
      plan,
      sponsorBrandId: brandId || null,
      places: Math.max(1, Number(form.get("places") ?? 1)),
      actorId: who,
    });

    revalidatePath("/admin/challenges");
    back(`/admin/challenges/series/${seriesId}`);
  } catch (e) {
    if (e instanceof SeriesRefused) back("/admin/challenges/new", e.message);
    throw e;
  }
}

/**
 * Instantiate trophy templates across a series.
 *
 * 03 §7 step 8: three templates become twenty-one trophies, and step 9 is the
 * guard passing on the total. Without this a seven-day series needs twenty-one
 * hand-made trophies, and hand-making twenty-one of anything is how one ends
 * up with the wrong value and the pool guard fails on a Sunday night.
 */
export async function instantiateTemplatesAction(form: FormData): Promise<void> {
  await actor();
  const db = await getDb();
  const seriesId = String(form.get("seriesId") ?? "");

  const { seriesInstances, checkTemplates } = await import("../../lib/challenges/series.ts");
  const { instantiateTemplates } = await import("../../lib/trophies/trophies.ts");

  const instances = await seriesInstances(db, seriesId);
  if (instances.length === 0) back(`/admin/challenges/series/${seriesId}`, "No such series.");

  const places = form.getAll("place").map(Number);
  const names = form.getAll("templateName").map(String);
  const values = form.getAll("templateValue").map((v) => Math.round(Number(v) * 100));

  const templates = places.map((place, i) => ({
    place,
    name: names[i] ?? `Place ${place}`,
    valueCents: values[i] ?? 0,
  }));

  // The same check the assignment guard will apply, shown before anything is
  // written. Two implementations of "does this balance" is how a builder tells
  // you it does and the guard then refuses it.
  const check = checkTemplates(templates, instances[0].prizePoolCents);
  if (!check.ok) back(`/admin/challenges/series/${seriesId}`, check.reason ?? "The trophies do not balance.");

  try {
    await instantiateTemplates(
      db,
      instances.map((c) => c.id),
      templates,
    );
  } catch (e) {
    back(`/admin/challenges/series/${seriesId}`, reason(e));
  }

  revalidatePath(`/admin/challenges/series/${seriesId}`);
  back(`/admin/challenges/series/${seriesId}`);
}

/** Create one trophy from `/admin/trophies/new`. 05 §4. */
export async function createTrophyStandaloneAction(form: FormData): Promise<void> {
  await actor();
  const db = await getDb();

  const type = String(form.get("type") ?? "podium");
  const dollars = Number(form.get("valueDollars") ?? 0);

  try {
    await createTrophy(db, {
      type: type as "podium" | "participation" | "milestone",
      name: String(form.get("name") ?? "").trim() || "Untitled trophy",
      // 05 §4 rule 1 — **milestone trophies are always $0.** Enforced in
      // `createTrophy`, not here; this only reads the form.
      valueCents: Math.round(dollars * 100),
      brandId: String(form.get("brandId") ?? "").trim() || null,
      challengeId: String(form.get("challengeId") ?? "").trim() || null,
      place: form.get("place") ? Number(form.get("place")) : null,
      milestoneKind: String(form.get("milestoneKind") ?? "").trim() || null,
      milestoneGame: String(form.get("milestoneGame") ?? "").trim() || null,
    });
  } catch (e) {
    back("/admin/trophies/new", reason(e));
  }

  revalidatePath("/admin/trophies");
  back("/admin/trophies");
}

/**
 * Register the slash commands with Discord.
 *
 * ===== A DEPLOY STEP, NOT A TERMINAL COMMAND (10-SETUP) =====
 *
 * `registerGlobalCommands` was written, correct, and called by nothing, so
 * `/cluster` did not exist and the only way into the bot was a button on an
 * announced challenge. The obvious home for the fix is a script; `10-SETUP`'s
 * whole premise is that the owner needs no terminal, so it is a button, on the
 * page whose job is telling them what is not wired yet. `docs/DEPLOYMENT.md`
 * names it as a step.
 *
 * `PUT` replaces the whole set, which is why this sends `COMMANDS` entire
 * rather than the difference: a partial send is how a command that was removed
 * from the array stays live in Discord forever.
 */
export async function registerCommandsAction(): Promise<void> {
  await actor();
  const { registerGlobalCommands } = await import("../../lib/discord/rest.ts");
  const { COMMANDS } = await import("../../lib/discord/commands.ts");

  const res = await registerGlobalCommands(COMMANDS as unknown as Record<string, unknown>[]);
  if (!res.ok) {
    back("/admin/preflight", `Discord refused the registration: ${res.status} ${res.error}`);
  }
  revalidatePath("/admin/preflight");
  redirect("/admin/preflight?registered=1");
}
