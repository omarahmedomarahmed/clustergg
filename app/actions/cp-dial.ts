"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { audit, auditChange } from "@/lib/audit";
import { planCpDial, missionEligibleActions } from "@/lib/cp-dial";
import { dailyCpCeiling, ACTION_CATALOG } from "@/lib/quests";

// Turning the dial. C1.
//
// `lib/cp-dial.ts` computes a plan and writes nothing, deliberately — "a dial
// that turns itself is a dial nobody watches". This is the other half: the one
// place that can actually move the ceiling and the weights, and it does both in
// the same call because doing one without the other is what breaks the model.
//
// Raise the ceiling alone and nothing changes for a gamer, because a mission
// still totals what it totalled. Rescale the weights alone and the ceiling
// becomes a bound nobody is near, or one everybody hits by lunchtime. The plan
// is the pair, so the action applies the pair.

export type DialState = { ok?: true; message?: string; error?: string } | undefined;

/**
 * Apply a planned ceiling.
 *
 * ADMIN ONLY. Reading what CP costs belongs to whoever runs quests; deciding
 * how much of the vault a day may drain does not.
 *
 * Recomputed here from the target rather than trusting a plan posted by the
 * form. The preview an operator looked at and the change that lands must come
 * out of the same function on the same catalogue — a form that posts its own
 * weights is a form somebody can post different ones through.
 */
export async function applyCpDial(_prev: DialState, formData: FormData): Promise<DialState> {
  const access = await requireSystemFor("/admin/cp");
  if (!access.isAdmin) return { error: "Only a super admin can move the CP ceiling." };

  const target = Number(formData.get("ceiling"));
  const reason = String(formData.get("reason") ?? "").trim();
  // Only finite numbers default; 0 is a real target — it is how you stop the
  // economy without deleting it — and `Number(x) || fallback` would have
  // silently turned it into 500. Same defect C6 exists to fix.
  if (!Number.isFinite(target) || target < 0) return { error: "Give a ceiling of 0 or more." };
  if (target > 100_000) return { error: "That ceiling is higher than any mission could reach. Check the number." };
  if (!reason) {
    return { error: "Say why. A ceiling changed without a reason is one nobody can explain when the vault empties." };
  }

  const db = await getDb();
  const before = await dailyCpCeiling(db);

  // The live weights, not the catalogue defaults. `awardQuestAction` pays what
  // the QUESTS say, so a plan computed from defaults would be a plan for a
  // configuration nobody is running. Where two quests disagree on an action the
  // higher wins, matching the calculator — the worst case is the one to scale.
  const quests = await db.select().from(schema.quests);
  const live = new Map<string, { key: string; weight: number; cap: number }>();
  for (const a of ACTION_CATALOG) live.set(a.key, { key: a.key, weight: 0, cap: a.defaultCap });
  for (const q of quests) {
    const weights = (q.actionWeights ?? {}) as Record<string, number>;
    const caps = (q.dailyCaps ?? {}) as Record<string, number>;
    for (const [key, w] of Object.entries(weights)) {
      const row = live.get(key);
      if (!row || !(Number(w) > 0)) continue;
      row.weight = Math.max(row.weight, Number(w));
      const c = Number(caps[key] ?? 0);
      if (c > 0) row.cap = Math.max(row.cap, c);
    }
  }
  const current = [...live.values()].filter((a) => a.weight > 0);
  if (!current.length) {
    return { error: "No quest pays anything yet, so there is nothing to scale. Set up a quest first." };
  }

  const plan = planCpDial(target, current);

  // ===== Write the ceiling =====
  //
  // `{ cp }`, not a bare number. `dailyCpCeiling` reads `value.cp`, so writing
  // the number directly stored something the reader could not read: the setting
  // changed, the audit log recorded a change, and the ceiling silently stayed
  // at the default. A write whose reader disagrees with it is worse than no
  // write, because everything downstream reports success.
  await db.insert(schema.platformSettings)
    .values({ key: "quests.dailyCpCeiling", value: { cp: plan.ceiling }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.platformSettings.key,
      set: { value: { cp: plan.ceiling }, updatedAt: new Date() },
    });

  // ===== Write the weights =====
  //
  // Per quest, and only the actions the plan actually moved. A quest that does
  // not listen to a rescaled action is not touched at all, so this cannot
  // introduce a weight where a quest deliberately had none — which is what
  // writing the whole plan onto every quest would do.
  const eligible = new Set(missionEligibleActions());
  let questsChanged = 0;
  for (const q of quests) {
    const weights = { ...((q.actionWeights ?? {}) as Record<string, number>) };
    let touched = false;
    for (const [key, next] of Object.entries(plan.weights)) {
      if (!eligible.has(key)) continue;          // belt and braces; the plan already filters
      if (!(Number(weights[key] ?? 0) > 0)) continue;  // this quest does not pay it
      if (weights[key] === next) continue;
      weights[key] = next;
      touched = true;
    }
    if (!touched) continue;
    await db.update(schema.quests).set({ actionWeights: weights })
      .where(eq(schema.quests.id, q.id));
    questsChanged++;
  }

  await auditChange(access.user.id, "cp.ceiling", "quests.dailyCpCeiling", before, plan.ceiling, reason);
  if (questsChanged) {
    await audit(access.user.id, "cp.weights", "quests", {
      scale: plan.scale, actions: plan.weights, quests: questsChanged, reason,
    });
  }

  revalidatePath("/admin/cp");
  revalidatePath("/admin/cp-calculator");
  revalidatePath("/admin/quests");
  revalidatePath("/quests");

  return {
    ok: true,
    message: plan.ceiling === before && questsChanged === 0
      ? `Already at ${plan.ceiling} CP/day. Nothing moved.`
      : `${before} → ${plan.ceiling} CP/day. ${Object.keys(plan.weights).length} action`
        + `${Object.keys(plan.weights).length === 1 ? "" : "s"} rescaled ×${plan.scale.toFixed(2)} across `
        + `${questsChanged} quest${questsChanged === 1 ? "" : "s"}. `
        + "Nothing already credited changes — this is what tomorrow pays.",
  };
}
