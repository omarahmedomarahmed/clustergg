import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { EntityLite, EntityDetail, EntityKind } from "@/lib/game-entities";

// Admin overrides layered on top of a game's base world catalogue: edit a
// champion/legend/weapon's name/role/art/lore/abilities/skins, hide it, reorder
// it, or add a brand-new custom entity (e.g. a PUBG hero). Cached in-process for
// a minute so edits appear quickly without a query on every planet visit.

export type OverrideRow = typeof schema.gameEntityOverrides.$inferSelect;

const cache = new Map<string, { map: Map<string, OverrideRow>; exp: number }>();
const TTL = 60_000;

export function invalidateOverrides(game?: string) {
  if (game) cache.delete(game); else cache.clear();
}

export async function loadOverrideMap(game: string): Promise<Map<string, OverrideRow>> {
  const hit = cache.get(game);
  if (hit && hit.exp > Date.now()) return hit.map;
  const map = new Map<string, OverrideRow>();
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.gameEntityOverrides).where(eq(schema.gameEntityOverrides.game, game));
    for (const r of rows) map.set(`${r.kind}:${r.entityId}`, r);
  } catch { /* table missing / no overrides */ }
  cache.set(game, { map, exp: Date.now() + TTL });
  return map;
}

// Merge overrides onto the base list: hidden removed, fields overridden, custom
// entities appended, and admin sort order applied (unset stays in base order).
export function mergeList(base: EntityLite[], ov: Map<string, OverrideRow>): EntityLite[] {
  const idx = new Map<string, number>();
  base.forEach((e, i) => idx.set(`${e.kind}:${e.id}`, i));
  const items: EntityLite[] = [];
  for (const e of base) {
    const o = ov.get(`${e.kind}:${e.id}`);
    if (o?.hidden) continue;
    items.push(o ? { ...e, name: o.name || e.name, role: o.role ?? e.role, image: o.image || e.image } : e);
  }
  for (const o of ov.values()) {
    const key = `${o.kind}:${o.entityId}`;
    if (o.custom && !o.hidden && !idx.has(key)) {
      items.push({ id: o.entityId, kind: o.kind as EntityKind, name: o.name || "Unnamed", image: o.image || "", role: o.role ?? null, tags: o.role ? [o.role] : [] });
    }
  }
  const rank = (e: EntityLite) => {
    const o = ov.get(`${e.kind}:${e.id}`);
    const so = o && o.sortOrder > 0 ? o.sortOrder : 0;
    return so > 0 ? so : 100000 + (idx.get(`${e.kind}:${e.id}`) ?? 99999);
  };
  return items.sort((a, b) => rank(a) - rank(b));
}

// Merge one override onto a base detail (or synthesise a custom entity's detail).
export function mergeDetail(base: EntityDetail | null, o: OverrideRow | undefined, kind: string, id: string): EntityDetail | null {
  if (!o) return base;
  if (o.hidden) return null;
  return {
    id, kind: (o.kind || kind) as EntityKind,
    name: o.name || base?.name || id,
    image: o.image || base?.image || "",
    splash: o.splash || base?.splash || null,
    role: o.role ?? base?.role ?? null,
    tags: base?.tags ?? (o.role ? [o.role] : []),
    lore: o.lore ?? base?.lore ?? null,
    abilities: o.abilities && o.abilities.length ? o.abilities : base?.abilities ?? [],
    skins: o.skins && o.skins.length ? o.skins : base?.skins ?? [],
    meta: o.meta && o.meta.length ? o.meta : base?.meta ?? [],
  };
}
