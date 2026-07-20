"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { uid } from "@/lib/utils";
import { invalidateOverrides } from "@/lib/game-overrides";

export type EntityFields = {
  name?: string; role?: string; image?: string; splash?: string; lore?: string;
  hidden?: boolean; sortOrder?: number; custom?: boolean;
  meta?: { label: string; value: string }[];
  abilities?: { name: string; icon: string | null; desc: string }[];
  skins?: { name: string; image: string }[];
};

// Upsert an admin override for one game-world entity (edit fields, hide, reorder,
// or create a custom entity). Merged on top of the base catalogue on read.
export async function saveEntityOverride(game: string, kind: string, entityId: string, fields: EntityFields) {
  await requireStaff();
  if (!game || !kind || !entityId) return { error: "Missing game / kind / id." };
  const db = await getDb();
  const g = schema.gameEntityOverrides;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.name !== undefined) set.name = fields.name.trim() || null;
  if (fields.role !== undefined) set.role = fields.role.trim() || null;
  if (fields.image !== undefined) set.image = fields.image.trim() || null;
  if (fields.splash !== undefined) set.splash = fields.splash.trim() || null;
  if (fields.lore !== undefined) set.lore = fields.lore.trim() || null;
  if (fields.hidden !== undefined) set.hidden = !!fields.hidden;
  if (fields.custom !== undefined) set.custom = !!fields.custom;
  if (typeof fields.sortOrder === "number") set.sortOrder = Math.max(0, Math.min(99999, Math.round(fields.sortOrder)));
  if (fields.meta !== undefined) set.meta = fields.meta;
  if (fields.abilities !== undefined) set.abilities = fields.abilities;
  if (fields.skins !== undefined) set.skins = fields.skins;

  await db.insert(g).values({
    id: uid(), game, kind, entityId,
    custom: !!fields.custom, hidden: !!fields.hidden, sortOrder: fields.sortOrder ?? 0,
    name: set.name as string ?? null, role: set.role as string ?? null,
    image: set.image as string ?? null, splash: set.splash as string ?? null, lore: set.lore as string ?? null,
    meta: fields.meta ?? [], abilities: fields.abilities ?? [], skins: fields.skins ?? [],
  }).onConflictDoUpdate({ target: [g.game, g.kind, g.entityId], set });

  invalidateOverrides(game);
  revalidatePath("/admin/game-worlds");
  return { ok: true };
}

// Remove an override (revert to the base entity, or delete a custom one).
export async function deleteEntityOverride(game: string, kind: string, entityId: string) {
  await requireStaff();
  const db = await getDb();
  const g = schema.gameEntityOverrides;
  await db.delete(g).where(and(eq(g.game, game), eq(g.kind, kind), eq(g.entityId, entityId)));
  invalidateOverrides(game);
  revalidatePath("/admin/game-worlds");
  return { ok: true };
}
