// Reading and writing the `feature_shots` rows.
//
// Kept apart from `lib/shots.ts` so the registry stays importable from a client
// component (it is plain data) while anything touching the database stays on the
// server.

import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { SHOT_REGISTRY, type ShotDef } from "@/lib/shots";

export type Shot = {
  key: string;
  imageUrl: string | null;
  altText: string;
  caption: string;
  claim: string;
  capturedFrom: string | null;
  capturedAt: Date | null;
  width: number | null;
  height: number | null;
  /** The registry entry, when this key is still a known one. */
  def?: ShotDef;
};

/**
 * Every shot the registry knows about, whether or not it has been captured.
 *
 * Registry-first rather than table-first on purpose: a key that has no row yet
 * still has to appear, both in the admin console (so somebody can upload one)
 * and on the page (as a labelled placeholder). A system that only lists what
 * already exists can never tell you what is missing.
 */
export async function allShots(): Promise<Shot[]> {
  const rows = await readRows(SHOT_REGISTRY.map((d) => d.key));
  return SHOT_REGISTRY.map((def) => ({ ...blank(def.key), ...rows.get(def.key), claim: rows.get(def.key)?.claim || def.claim, def }));
}

/** One shot by key. Never throws — a page must not 500 because a picture is missing. */
export async function getShot(key: string): Promise<Shot> {
  const def = SHOT_REGISTRY.find((d) => d.key === key);
  try {
    const rows = await readRows([key]);
    const row = rows.get(key);
    return { ...blank(key), ...row, claim: row?.claim || def?.claim || "", def };
  } catch {
    return { ...blank(key), claim: def?.claim ?? "", def };
  }
}

/** Several at once, for a page that claims more than one component. */
export async function getShots(keys: string[]): Promise<Map<string, Shot>> {
  const out = new Map<string, Shot>();
  let rows = new Map<string, Partial<Shot>>();
  try { rows = await readRows(keys); } catch { /* placeholders below */ }
  for (const key of keys) {
    const def = SHOT_REGISTRY.find((d) => d.key === key);
    const row = rows.get(key);
    out.set(key, { ...blank(key), ...row, claim: row?.claim || def?.claim || "", def });
  }
  return out;
}

async function readRows(keys: string[]): Promise<Map<string, Partial<Shot>>> {
  if (!keys.length) return new Map();
  const db = await getDb();
  const rows = await db.select().from(schema.featureShots).where(inArray(schema.featureShots.key, keys));
  return new Map(rows.map((r) => [r.key, {
    key: r.key, imageUrl: r.imageUrl, altText: r.altText, caption: r.caption, claim: r.claim,
    capturedFrom: r.capturedFrom, capturedAt: r.capturedAt, width: r.width, height: r.height,
  }]));
}

const blank = (key: string): Shot => ({
  key, imageUrl: null, altText: "", caption: "", claim: "",
  capturedFrom: null, capturedAt: null, width: null, height: null,
});

/**
 * Write one shot. Every field is optional, so a capture run can set the image
 * without touching an admin's caption, and an admin can fix the caption without
 * being asked to re-upload the image.
 */
export async function saveShot(key: string, patch: {
  imageUrl?: string | null;
  altText?: string;
  caption?: string;
  claim?: string;
  capturedFrom?: string | null;
  width?: number | null;
  height?: number | null;
  updatedBy?: string | null;
  /** Set only by a capture run — an admin editing a caption did not re-shoot it. */
  markCaptured?: boolean;
}): Promise<void> {
  const db = await getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of ["imageUrl", "altText", "caption", "claim", "capturedFrom", "width", "height", "updatedBy"] as const) {
    if (patch[f] !== undefined) set[f] = patch[f];
  }
  if (patch.markCaptured) set.capturedAt = new Date();
  await db.insert(schema.featureShots)
    .values({ key, ...set })
    .onConflictDoUpdate({ target: schema.featureShots.key, set });
}
