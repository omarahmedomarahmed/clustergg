"use server";

// The registry's actions. `12-IDENTITY` §6 and `15-DELIVERY` L9.
//
// ===== THE PAGE WAS READ-ONLY, AND THE RULES WERE NOT =====
//
// `/admin/servers/[guildId]` rendered `guildRegistry` and offered no way to do
// anything. The 14-day transfer confirmation, the arbitration, the four-week
// reassignment and the age-band correction were all built, guarded and
// unreachable — `94-export-reach` found every one of them with no caller.
//
// Nothing here decides anything. `lib/admin/registry.ts` holds all four rules
// and this file reads the form, hands it over, and carries the refusal back.
// A second opinion in an action is how a console ends up kinder than the rule.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../../../../lib/db/index.ts";
import { currentStaff } from "../../../../lib/admin/session.ts";
import {
  arbitrateTransfer,
  confirmTransfer,
  reassignOwner,
  setAgeBandByAdmin,
} from "../../../../lib/admin/registry.ts";
import { setParentGuild } from "../../../../lib/identity/attribution.ts";
import { dmReassignmentWarning } from "../../../../lib/delivery/dm.ts";
import { isAgeBand } from "../../../../lib/identity/age.ts";

async function actor(): Promise<string> {
  const staff = await currentStaff();
  if (!staff) redirect("/signup");
  return staff.userId;
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : "That did not work.";
}

function back(guildId: string, params: Record<string, string> = {}): never {
  const qs = new URLSearchParams(params).toString();
  redirect(qs ? `/admin/servers/${guildId}?${qs}` : `/admin/servers/${guildId}`);
}

/**
 * L9 — warn the owner before anybody takes their earnings.
 *
 * Queued, not sent, and the button says so: the outcome lands when the cron
 * drains it, and `reassignOwner` refuses until Discord has actually accepted
 * it. A button that reported "warned" the moment it was pressed would be
 * reporting an intention, and the whole point of L10 is that a DM can fail
 * quietly.
 */
export async function warnBeforeReassignmentAction(form: FormData): Promise<void> {
  await actor();
  const guildId = String(form.get("guildId") ?? "");
  const db = await getDb();
  const queued = await dmReassignmentWarning(db, { guildId });
  revalidatePath(`/admin/servers/${guildId}`);
  back(guildId, {
    notice: queued
      ? "The warning is queued. It will show as delivered here once Discord accepts it, and reassignment stays refused until then."
      : "Nothing was queued — this server has no owner on file to warn.",
  });
}

/** T2 — only the outgoing owner can confirm, and this records that they did. */
export async function confirmTransferAction(form: FormData): Promise<void> {
  await actor();
  const guildId = String(form.get("guildId") ?? "");
  const byDiscordId = String(form.get("byDiscordId") ?? "").trim();
  const db = await getDb();
  try {
    await confirmTransfer(db, { guildId, byDiscordId });
  } catch (e) {
    back(guildId, { error: reason(e) });
  }
  revalidatePath(`/admin/servers/${guildId}`);
  back(guildId, { notice: "Transfer confirmed." });
}

/** T4 — a disputed transfer, decided by a human and logged with the reason. */
export async function arbitrateTransferAction(form: FormData): Promise<void> {
  const who = await actor();
  const guildId = String(form.get("guildId") ?? "");
  const newOwnerDiscordId = String(form.get("newOwnerDiscordId") ?? "").trim();
  const db = await getDb();
  try {
    await arbitrateTransfer(db, {
      guildId,
      actorId: who,
      newOwnerDiscordId,
      reason: String(form.get("reason") ?? "").trim() || "No reason given",
    });
  } catch (e) {
    back(guildId, { error: reason(e) });
  }
  revalidatePath(`/admin/servers/${guildId}`);
  back(guildId, { notice: "Transfer arbitrated, and logged with the reason." });
}

/**
 * 12 §6 — four weeks, **manually, never automatically**.
 *
 * `claimantHoldsAdministrator` is read from the form because it is a live
 * reading somebody has to make: `guild_admins` is what we have *seen*, and a
 * role held in March is not a role held today. The checkbox is the human
 * saying they looked.
 */
export async function reassignOwnerAction(form: FormData): Promise<void> {
  const who = await actor();
  const guildId = String(form.get("guildId") ?? "");
  const db = await getDb();
  try {
    await reassignOwner(db, {
      guildId,
      actorId: who,
      newOwnerDiscordId: String(form.get("newOwnerDiscordId") ?? "").trim(),
      claimantHoldsAdministrator: form.get("holdsAdmin") === "on",
      reason: String(form.get("reason") ?? "").trim() || "No reason given",
    });
  } catch (e) {
    back(guildId, { error: reason(e) });
  }
  revalidatePath(`/admin/servers/${guildId}`);
  back(guildId, { notice: "Owner reassigned, and logged with both sides." });
}

/** G9 — an age band is set once and only support can move it. */
export async function setAgeBandAction(form: FormData): Promise<void> {
  const who = await actor();
  const guildId = String(form.get("guildId") ?? "");
  const band = String(form.get("ageBand") ?? "");
  const db = await getDb();
  if (!isAgeBand(band)) back(guildId, { error: "That is not an age band." });
  try {
    await setAgeBandByAdmin(db, {
      userId: String(form.get("userId") ?? "").trim(),
      ageBand: band as "teen" | "adult",
      actorId: who,
      reason: String(form.get("reason") ?? "").trim() || "No reason given",
    });
  } catch (e) {
    back(guildId, { error: reason(e) });
  }
  revalidatePath(`/admin/servers/${guildId}`);
  back(guildId, { notice: "Age band set, and logged with both sides." });
}

/**
 * A8 — a gamer can **never** change their own parent. Cluster admin can, logged.
 *
 * The correction, which is what `setParentGuild` always was: parents are
 * stamped at the first bot click and this is the only thing that moves one.
 * A1b — it cannot move a closed week's money, whatever week it is run in.
 */
export async function setParentGuildAction(form: FormData): Promise<void> {
  const who = await actor();
  const guildId = String(form.get("guildId") ?? "");
  const db = await getDb();
  try {
    await setParentGuild(db, {
      userId: String(form.get("userId") ?? "").trim(),
      guildId: String(form.get("parentGuildId") ?? "").trim() || null,
      actorId: who,
      reason: String(form.get("reason") ?? "").trim() || "No reason given",
    });
  } catch (e) {
    back(guildId, { error: reason(e) });
  }
  revalidatePath(`/admin/servers/${guildId}`);
  back(guildId, { notice: "Parent server corrected, and logged." });
}
