"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { uid } from "@/lib/utils";
import { MILESTONES_KEY, DEFAULT_MILESTONES } from "@/lib/mission-live";
import { parseMilestones } from "@/lib/missions";

// Streak milestones, editable. B122.
//
// ===== THE GAP THIS CLOSES =====
//
// `missions.milestones` was READ in two places — the nightly award job in
// `lib/jobs.ts` and the mission band in the nav — and written by nothing. There
// was no screen anywhere that could set it.
//
// The consequence was quiet rather than broken: `DEFAULT_MILESTONES` ships four
// rungs with `trophyId: null`, the band honestly prints "Trophies for these are
// being chosen", and `awardStreakMilestones` skips any rung with no trophy. So
// a gamer could run a 30-day streak, watch four milestones light up, and
// receive nothing — forever, because the only way to attach a prize was a hand
// -written INSERT against production.
//
// ===== WHY THE WHOLE LIST IS REPLACED, NOT PATCHED =====
//
// The setting is one JSON array. A per-row update would need a stable id per
// rung, and a rung has no identity beyond its day count — renaming 7 to 8 is
// indistinguishable from deleting one and adding another. Sending the whole
// list back is the shape the data already has.
//
// It also means `parseMilestones` does the validating, which is the same
// function the reader uses. A row this action would accept and the band would
// silently drop is the bug worth designing out.

export type MilestoneState = { ok?: string; error?: string };

export async function saveMilestones(
  _prev: MilestoneState, formData: FormData,
): Promise<MilestoneState> {
  const admin = await requireStaff();
  const db = await getDb();

  // `days:N` / `trophy:N` pairs, N being the row's position in the form only.
  const raw: { days: number; trophyId: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("days:")) continue;
    const i = key.slice(5);
    const days = Number(value);
    // A blank day is a row somebody cleared to delete it, not an error to
    // report — the form has no delete button per row for exactly this reason.
    if (!String(value).trim()) continue;
    const trophyId = String(formData.get(`trophy:${i}`) ?? "").trim();
    raw.push({ days, trophyId: trophyId || null });
  }

  // The READER's parser, deliberately. It drops a day outside 1–365, drops a
  // duplicate, nulls a malformed trophy id and sorts. Validating here with
  // anything else would let this action accept a rung the band then ignores.
  const cleaned = parseMilestones(raw);

  if (raw.length && !cleaned.length) {
    return { error: "Every row was rejected — a milestone is a whole number of days between 1 and 365." };
  }
  const dropped = raw.length - cleaned.length;

  // Attaching a trophy that does not exist would award nothing and log a
  // success. Checked against the table rather than trusted from the form,
  // because the form is a select an admin can have open while somebody else
  // deletes the trophy in it.
  const ids = [...new Set(cleaned.map((m) => m.trophyId).filter((x): x is string => !!x))];
  if (ids.length) {
    const rows = await db.select({ id: schema.trophies.id }).from(schema.trophies);
    const have = new Set(rows.map((r) => r.id));
    const missing = ids.filter((i) => !have.has(i));
    if (missing.length) {
      return { error: "One of those trophies no longer exists. Reload and pick again." };
    }
  }

  await db.insert(schema.platformSettings)
    .values({ key: MILESTONES_KEY, value: cleaned })
    .onConflictDoUpdate({
      target: schema.platformSettings.key,
      set: { value: cleaned, updatedAt: new Date() },
    });

  await db.insert(schema.auditLog).values({
    id: uid(), adminId: admin.id, action: "milestones.save",
    targetType: "setting", targetId: MILESTONES_KEY,
    meta: { milestones: cleaned },
  });

  revalidatePath("/admin/quests");
  revalidatePath("/", "layout"); // the band is in the nav, on every page

  const withTrophy = cleaned.filter((m) => m.trophyId).length;
  return {
    ok: `Saved ${cleaned.length} milestone${cleaned.length === 1 ? "" : "s"}, ${withTrophy} with a trophy attached`
      + `${dropped ? ` (${dropped} row${dropped === 1 ? "" : "s"} dropped as invalid or duplicate)` : ""}.`,
  };
}

/** The stored list, or the shipped default when nobody has set one. */
export async function currentMilestones() {
  const db = await getDb();
  try {
    const [row] = await db.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.key, MILESTONES_KEY)).limit(1);
    const stored = parseMilestones(row?.value);
    // An empty stored list is a real choice — "no milestones" — and must not
    // silently become the default again. Only the ABSENCE of a row falls back.
    return { milestones: row ? stored : DEFAULT_MILESTONES, isDefault: !row };
  } catch {
    return { milestones: DEFAULT_MILESTONES, isDefault: true };
  }
}
