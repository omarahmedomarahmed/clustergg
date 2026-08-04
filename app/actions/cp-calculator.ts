"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { ACTION_CATALOG, DEFAULT_DAILY_CP_CEILING } from "@/lib/quests";
import { DEFAULT_CP_PER_DOLLAR } from "@/lib/marketplace";
import { uid } from "@/lib/utils";

export type SaveState = { ok?: boolean; error?: string; message?: string; changes?: string[] } | undefined;

/**
 * Write the modelled numbers back to the quests that actually pay them (B16.2).
 *
 * Three properties, and none of them is a nicety:
 *
 *   1. **It writes to the quests, not to a settings blob.** `awardQuestAction`
 *      reads each quest's own `actionWeights` and `dailyCaps`. A calculator that
 *      saved somewhere else would be a screen that models a number the engine
 *      never sees — the most dangerous possible kind of admin page, because it
 *      looks like it worked.
 *
 *   2. **Every change is audited, from what to what.** This is the money screen.
 *      "Who lowered the ceiling" is a question that gets asked exactly once, at
 *      the worst possible moment, and it has to have an answer. §"Money settings
 *      are the one place where 'who changed this' is not optional."
 *
 *   3. **A quest only gets an action it already listens to.** Saving here retunes
 *      the economy; it does not silently attach every action to every quest,
 *      which would change what quests MEAN as a side effect of moving a slider.
 */
export async function saveCpConfig(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const access = await requireSystemFor("/admin/cp-calculator");
  // Admin-only in practice as well as by department: this is the one screen
  // where a wrong number is money rather than a mistake.
  if (!access.isAdmin) return { error: "Only an admin can change what a Cluster Point is worth." };

  const db = await getDb();
  const changes: string[] = [];

  // ---- The two platform-wide numbers ----
  const rate = Math.round(Number(formData.get("cpPerDollar")));
  const ceiling = Math.round(Number(formData.get("ceiling")));
  if (!Number.isFinite(rate) || rate <= 0) return { error: "The rate has to be a positive number of CP to the dollar." };
  if (!Number.isFinite(ceiling) || ceiling < 0) return { error: "The ceiling cannot be negative. Zero means no ceiling — say so deliberately." };

  // `fallback` is what the code uses when there is no stored row, so a save
  // that re-states the default is a no-op rather than a logged "change".
  // Reporting "CP to the dollar: default → 10,000" when nothing moved buries
  // the one line that did move in noise, on the screen where every line matters.
  const setting = async (key: string, value: Record<string, number>, label: string, now: number, fallback: number) => {
    const [row] = await db.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings).where(eq(schema.platformSettings.key, key)).limit(1);
    const stored = Number(Object.values((row?.value as Record<string, number>) ?? {})[0]);
    const was = Number.isFinite(stored) ? stored : fallback;
    if (was === now) return;
    await db.insert(schema.platformSettings).values({ key, value })
      .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value, updatedAt: new Date() } });
    changes.push(`${label}: ${was.toLocaleString()}${Number.isFinite(stored) ? "" : " (default)"} → ${now.toLocaleString()}`);
  };
  await setting("marketplace.cpPerDollar", { rate }, "CP to the dollar", rate, DEFAULT_CP_PER_DOLLAR);
  await setting("quests.dailyCpCeiling", { cp: ceiling }, "Daily ceiling", ceiling, DEFAULT_DAILY_CP_CEILING);

  // ---- Per-action weights and caps, onto the quests that pay them ----
  const quests = await db.select().from(schema.quests);
  for (const q of quests) {
    const weights = { ...(q.actionWeights ?? {}) as Record<string, number> };
    const caps = { ...(q.dailyCaps ?? {}) as Record<string, number> };
    let touched = false;
    for (const a of ACTION_CATALOG) {
      if (weights[a.key] === undefined) continue;   // this quest does not listen; leave it alone
      const w = Math.round(Number(formData.get(`weight:${a.key}`)));
      const c = Math.round(Number(formData.get(`cap:${a.key}`)));
      if (Number.isFinite(w) && w >= 0 && w !== weights[a.key]) {
        changes.push(`${q.name} · ${a.label} weight: ${weights[a.key]} → ${w}`);
        weights[a.key] = w; touched = true;
      }
      if (Number.isFinite(c) && c >= 0 && c !== (caps[a.key] ?? 0)) {
        changes.push(`${q.name} · ${a.label} cap: ${caps[a.key] ?? "none"} → ${c}`);
        caps[a.key] = c; touched = true;
      }
    }
    if (touched) {
      await db.update(schema.quests).set({ actionWeights: weights, dailyCaps: caps })
        .where(eq(schema.quests.id, q.id));
    }
  }

  if (changes.length === 0) return { ok: true, message: "Nothing changed — the numbers already say that." };

  await db.insert(schema.auditLog).values({
    id: uid(), adminId: access.user.id, action: "cp.config.save",
    targetType: "economy", targetId: "cp",
    // The whole before→after list, not a count. An audit row that says "changed
    // 7 things" is an audit row that answers nothing.
    meta: { changes },
  });

  revalidatePath("/admin/cp-calculator");
  revalidatePath("/admin/quests");
  return { ok: true, message: `Saved. ${changes.length} change${changes.length === 1 ? "" : "s"} recorded in the audit log.`, changes };
}
