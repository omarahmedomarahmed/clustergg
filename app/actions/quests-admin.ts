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
    mapVideoUrl: String(formData.get("mapVideoUrl") ?? "").trim() || null,
    mapGlbUrl: String(formData.get("mapGlbUrl") ?? "").trim() || null,
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

// Save the curved trail the astronaut rides across the quest map. Accepts a JSON
// array of { x, y } waypoints (0-100). Empty clears it (falls back to a straight
// line through the milestone pins). `variant` picks which trail: "desktop"
// (16:9 map) or "mobile" (4:5 phone map — the curve bends differently there).
export async function saveQuestPath(questId: string, _prev: TierPinState, formData: FormData): Promise<TierPinState> {
  const admin = await requireStaff();
  const db = await getDb();
  const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? Math.round(v * 10) / 10 : 50));
  let pts: { x: number; y: number }[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("points") ?? "[]"));
    if (Array.isArray(parsed)) pts = parsed.filter((p) => p && typeof p.x === "number" && typeof p.y === "number").map((p) => ({ x: clamp(p.x), y: clamp(p.y) }));
  } catch { pts = []; }
  const mobile = String(formData.get("variant") ?? "desktop") === "mobile";
  await db.update(schema.quests)
    .set(mobile ? { pathPointsMobile: pts.length >= 2 ? pts : null } : { pathPoints: pts.length >= 2 ? pts : null })
    .where(eq(schema.quests.id, questId));
  await audit(admin.id, "quest.path", questId);
  revalidatePath(`/admin/quests/${questId}`);
  revalidatePath("/quests");
  const which = mobile ? "Mobile trail" : "Desktop trail";
  return { ok: true, message: pts.length >= 2 ? `${which} saved (${pts.length} points).` : `${which} cleared.` };
}

// ===== Quest game screens (missions + panel overrides) =====
// Admin-edited starter-mission roster for a quest: kind decides how completion
// is measured (connect / planet / challenge / ads with a threshold), labels and
// links are free-form. Empty list restores the built-in defaults.
export async function saveQuestMissions(
  questId: string,
  missions: { kind: string; label: string; href: string; icon: string; threshold?: number; enabled?: boolean }[],
) {
  const admin = await requireStaff();
  const db = await getDb();
  const kinds = new Set(["connect", "planet", "challenge", "ads"]);
  const clean = (Array.isArray(missions) ? missions : [])
    .filter((m) => m && kinds.has(String(m.kind)) && String(m.label || "").trim() && String(m.href || "").trim())
    .slice(0, 8)
    .map((m) => ({
      kind: String(m.kind), label: String(m.label).slice(0, 140), href: String(m.href).slice(0, 200),
      icon: String(m.icon || "spark").slice(0, 30),
      ...(m.kind === "ads" ? { threshold: Math.max(1, Math.min(1000, Math.round(Number(m.threshold) || 5))) } : {}),
      enabled: m.enabled !== false,
    }));
  await db.update(schema.quests).set({ missionsConfig: clean.length ? clean : null }).where(eq(schema.quests.id, questId));
  await audit(admin.id, "quest.missions", questId);
  revalidatePath(`/admin/quests/${questId}`); revalidatePath("/quests"); revalidatePath("/feed"); revalidatePath("/");
  return { ok: true };
}

// Per-panel overrides for the in-game screens: title text (translatable via the
// Language editor), background image with dark-overlay strength, button color.
export async function saveQuestGameUi(
  questId: string,
  ui: Record<string, { title?: string; bg?: string; dim?: number; btn?: string }>,
) {
  const admin = await requireStaff();
  const db = await getDb();
  const keys = ["rules", "log", "guide", "missions", "milestone"] as const;
  const clean: Record<string, { title?: string; bg?: string; dim?: number; btn?: string }> = {};
  for (const k of keys) {
    const c = ui?.[k];
    if (!c) continue;
    const e: { title?: string; bg?: string; dim?: number; btn?: string } = {};
    if (c.title?.trim()) e.title = String(c.title).slice(0, 140);
    if (c.bg?.trim()) e.bg = String(c.bg).slice(0, 2000);
    if (Number.isFinite(Number(c.dim))) e.dim = Math.max(0, Math.min(100, Math.round(Number(c.dim))));
    if (c.btn?.trim()) e.btn = String(c.btn).slice(0, 60);
    if (Object.keys(e).length) clean[k] = e;
  }
  await db.update(schema.quests).set({ gameUi: Object.keys(clean).length ? clean : null }).where(eq(schema.quests.id, questId));
  await audit(admin.id, "quest.game_ui", questId);
  revalidatePath(`/admin/quests/${questId}`); revalidatePath("/quests"); revalidatePath("/feed"); revalidatePath("/");
  return { ok: true };
}

// Persist the 3D terrain texture-mapping tuning for a quest (Admin → Quests →
// quest → 3D terrain). Empty/defaults clear it.
export async function saveQuestMapGlbCfg(questId: string, cfg: Record<string, unknown>) {
  const admin = await requireStaff();
  const db = await getDb();
  const num = (v: unknown, min: number, max: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
  };
  const clean = {
    projection: cfg.projection === "uv" ? "uv" : "planar",
    offsetX: num(cfg.offsetX, -1, 1, 0), offsetY: num(cfg.offsetY, -1, 1, 0),
    scaleX: num(cfg.scaleX, 0.1, 8, 1), scaleY: num(cfg.scaleY, 0.1, 8, 1),
    rotation: num(cfg.rotation, -360, 360, 0),
    flipX: !!cfg.flipX, flipY: !!cfg.flipY,
    yaw: num(cfg.yaw, -360, 360, 0),
    brightness: num(cfg.brightness, 0.3, 3, 1),
    autoRotate: cfg.autoRotate !== false,
  };
  await db.update(schema.quests).set({ mapGlbCfg: clean }).where(eq(schema.quests.id, questId));
  await audit(admin.id, "quest.map_glb_cfg", questId);
  revalidatePath(`/admin/quests/${questId}`); revalidatePath("/quests"); revalidatePath("/feed"); revalidatePath("/");
  return { ok: true };
}
