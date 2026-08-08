"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { audit, auditChange } from "@/lib/audit";
import {
  SPLIT_PRESETS, VAULTS, splitProblems, transfer, currentSplit, type Vault,
} from "@/lib/vaults";

// The two things an admin may do to the vaults, and nothing else.
//
// Notably NOT here: setting a balance. There is no such action and there should
// never be one — a balance is the sum of its rows, and an action that could
// write one would be the single thing capable of making the ledger unable to
// explain itself.

export type SplitState = { ok?: true; split?: Record<Vault, number>; error?: string } | undefined;

/**
 * Change what future sales divide into.
 *
 * ADMIN ONLY, even though the vault PAGE is a department system. Reading where
 * the money is belongs to whoever runs billing; deciding how it is cut does
 * not.
 *
 * Nothing already in a vault moves. That is worth stating in the success
 * message as well as here, because "change the split" reads like it might
 * rebalance what is there, and an operator who believes that will use it to try.
 */
export async function saveSplit(_prev: SplitState, formData: FormData): Promise<SplitState> {
  const access = await requireSystemFor("/admin/vaults");
  if (!access.isAdmin) return { error: "Only a super admin can change the split." };

  const preset = String(formData.get("preset") ?? "").trim();
  let next: Record<string, number>;
  let reason: string;

  if (preset) {
    const p = SPLIT_PRESETS[preset];
    if (!p) return { error: "That preset does not exist." };
    next = { ...p };
    reason = `Preset: ${preset}`;
  } else {
    next = Object.fromEntries(VAULTS.map((v) => [v, Number(formData.get(v))]));
    reason = String(formData.get("reason") ?? "").trim();
    // A hand edit with no reason is a movement nobody can audit later. The
    // preset path does not need one because the preset IS the reason.
    if (!reason) return { error: "Say why. A split changed without a reason is one nobody can explain in a month." };
  }

  // The same check the form runs, run again here. The form's copy exists to
  // stop somebody wasting a click; THIS is what makes it true — a client check
  // is a courtesy and a server check is a rule.
  const problems = splitProblems(next);
  if (problems.length) return { error: problems.join(" ") };

  const db = await getDb();
  const before = await currentSplit(db);
  await db.insert(schema.platformSettings)
    .values({ key: "vaults.split", value: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.platformSettings.key,
      set: { value: next, updatedAt: new Date() },
    });

  // Before AND after. A log that records only the new value cannot answer the
  // one question anybody asks afterwards, which is what it used to be.
  await auditChange(access.user.id, "vaults.split", "vaults.split", before, next, reason);

  revalidatePath("/admin/vaults");
  return { ok: true, split: next as Record<Vault, number> };
}

export type TransferState = { ok?: true; message?: string; error?: string } | undefined;

/** Move money that has already arrived from one vault to another. */
export async function moveBetweenVaults(_prev: TransferState, formData: FormData): Promise<TransferState> {
  const access = await requireSystemFor("/admin/vaults");
  if (!access.isAdmin) return { error: "Only a super admin can move money between vaults." };

  const from = String(formData.get("from") ?? "") as Vault;
  const to = String(formData.get("to") ?? "") as Vault;
  const amount = Number(formData.get("amount"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!VAULTS.includes(from) || !VAULTS.includes(to)) return { error: "Pick two vaults." };

  const db = await getDb();
  const res = await transfer(db, { from, to, amount, reason, actorId: access.user.id });
  if (!res.ok) return { error: res.error };

  await audit(access.user.id, "vaults.transfer", res.transferId, { from, to, amount, reason });
  revalidatePath("/admin/vaults");
  return {
    ok: true,
    message: `Moved ${amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} from ${from} to ${to}. Two rows written, both carrying the same id.`,
  };
}

export type WeekCloseState = { summary?: string; error?: string } | undefined;

/**
 * Run the weekly close by hand.
 *
 * The same function the Monday cron calls, and safe for the same reason: it is
 * idempotent against the payout rows. Exposed because a job that only ever runs
 * on a schedule is a job nobody can re-run after fixing whatever broke it — and
 * the day check in `runAllJobs` is a schedule, not a permission.
 */
export async function runWeekClose(_prev: WeekCloseState, _formData: FormData): Promise<WeekCloseState> {
  const access = await requireSystemFor("/admin/week");
  if (!access.isAdmin) return { error: "Only a super admin can close a week." };

  const { closeWeek } = await import("@/lib/week-close");
  const r = await closeWeek();
  await audit(access.user.id, "week.close", r.week, {
    pool: r.pool, servers: r.servers.length, payouts: r.payouts.length, skipped: r.skipped,
  });
  revalidatePath("/admin/week");
  revalidatePath("/admin/payouts");
  return { summary: r.summary };
}
