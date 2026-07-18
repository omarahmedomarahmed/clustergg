"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { uid, slugify } from "@/lib/utils";
import { ACTION_CATALOG } from "@/lib/quests";

async function audit(adminId: string, action: string, targetId?: string) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({ id: uid(), adminId, action, targetType: "quest", targetId, meta: {} });
}

// Build the action-weight / daily-cap maps from the flat form fields.
function readWeightsAndCaps(formData: FormData) {
  const weights: Record<string, number> = {};
  const caps: Record<string, number> = {};
  for (const a of ACTION_CATALOG) {
    const w = Number(formData.get(`weight:${a.key}`));
    if (Number.isFinite(w) && w > 0) weights[a.key] = Math.round(w);
    const c = Number(formData.get(`cap:${a.key}`));
    if (Number.isFinite(c) && c > 0) caps[a.key] = Math.round(c);
  }
  return { weights, caps };
}

export async function createQuest(formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const key = slugify(String(formData.get("key") ?? name)) || `quest-${uid().slice(0, 5).toLowerCase()}`;
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(schema.quests);
  const id = uid();
  await db.insert(schema.quests).values({
    id, key, name, tagline: String(formData.get("tagline") ?? "").trim(),
    lore: String(formData.get("lore") ?? "").trim(),
    color: String(formData.get("color") ?? "#8b5cf6"), accent2: String(formData.get("accent2") ?? "#22d3ee"),
    icon: String(formData.get("icon") ?? "trophy"), sortOrder: Number(c) || 0,
  }).onConflictDoNothing();
  await audit(admin.id, "quest.create", id);
  revalidatePath("/admin/quests");
  redirect(`/admin/quests/${id}`);
}

export async function saveQuest(questId: string, formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const { weights, caps } = readWeightsAndCaps(formData);
  await db.update(schema.quests).set({
    name: String(formData.get("name") ?? "").trim(),
    tagline: String(formData.get("tagline") ?? "").trim(),
    lore: String(formData.get("lore") ?? "").trim(),
    color: String(formData.get("color") ?? "#8b5cf6"),
    accent2: String(formData.get("accent2") ?? "#22d3ee"),
    icon: String(formData.get("icon") ?? "trophy"),
    logoUrl: String(formData.get("logoUrl") ?? "").trim() || null,
    cardBgUrl: String(formData.get("cardBgUrl") ?? "").trim() || null,
    coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
    mapArtUrl: String(formData.get("mapArtUrl") ?? "").trim() || null,
    actionWeights: weights,
    dailyCaps: caps,
    sortOrder: Number(formData.get("sortOrder")) || 0,
    isActive: formData.get("isActive") === "on",
  }).where(eq(schema.quests.id, questId));
  await audit(admin.id, "quest.update", questId);
  revalidatePath("/admin/quests");
  revalidatePath(`/admin/quests/${questId}`);
  revalidatePath("/quests");
}

export async function deleteQuest(questId: string) {
  const admin = await requireStaff();
  const db = await getDb();
  await db.delete(schema.quests).where(eq(schema.quests.id, questId));
  await audit(admin.id, "quest.delete", questId);
  revalidatePath("/admin/quests");
  redirect("/admin/quests");
}

export async function saveTier(questId: string, formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const tierId = String(formData.get("tierId") ?? "");
  const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 50));
  const values = {
    name: String(formData.get("name") ?? "").trim() || "Tier",
    description: String(formData.get("description") ?? "").trim(),
    thresholdQp: Math.max(0, Number(formData.get("thresholdQp")) || 0),
    iconUrl: String(formData.get("iconUrl") ?? "").trim() || null,
    color: String(formData.get("color") ?? "").trim() || null,
    tierIndex: Number(formData.get("tierIndex")) || 0,
    mapX: clamp(Number(formData.get("mapX"))),
    mapY: clamp(Number(formData.get("mapY"))),
  };
  if (tierId) {
    await db.update(schema.questTiers).set(values).where(eq(schema.questTiers.id, tierId));
  } else {
    await db.insert(schema.questTiers).values({ id: uid(), questId, ...values });
  }
  await audit(admin.id, "quest.tier_save", questId);
  revalidatePath(`/admin/quests/${questId}`);
  revalidatePath("/quests");
}

export type TierPinState = { ok?: boolean; error?: string; message?: string } | undefined;

// Bulk-save milestone pin positions after dragging them across the quest map.
// Accepts a JSON map of { tierId: { x, y } }.
export async function saveTierPins(questId: string, _prev: TierPinState, formData: FormData): Promise<TierPinState> {
  const admin = await requireStaff();
  const db = await getDb();
  const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? Math.round(v) : 50));
  let pins: Record<string, { x: number; y: number }> = {};
  try {
    const parsed = JSON.parse(String(formData.get("pins") ?? "{}"));
    if (parsed && typeof parsed === "object") pins = parsed;
  } catch { pins = {}; }
  const entries = Object.entries(pins);
  if (entries.length === 0) return { error: "Nothing to save." };
  for (const [tierId, v] of entries) {
    await db.update(schema.questTiers)
      .set({ mapX: clamp(Number(v?.x)), mapY: clamp(Number(v?.y)) })
      .where(eq(schema.questTiers.id, tierId));
  }
  await audit(admin.id, "quest.tier_pins", questId);
  revalidatePath(`/admin/quests/${questId}`);
  revalidatePath("/quests");
  return { ok: true, message: "Milestone positions saved." };
}

export async function deleteTier(questId: string, tierId: string) {
  const admin = await requireStaff();
  const db = await getDb();
  await db.delete(schema.questTiers).where(eq(schema.questTiers.id, tierId));
  await audit(admin.id, "quest.tier_delete", questId);
  revalidatePath(`/admin/quests/${questId}`);
}
