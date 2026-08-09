// The trophies a brand's logo is on, and which one they want given out. B91.9.
//
// ===== WHY A BRAND NEEDS TO CHOOSE =====
//
// A brand can have several designs at the same value — three different $100
// trophies for a launch, a colourway, a partner tie-in. Which one goes out on
// a given week is a real decision somebody at that brand cares about, and until
// now it was made by whichever staff member built the challenge, and the brand
// found out when they saw the podium.
//
// ===== WHAT A CHOICE IS AND IS NOT =====
//
// It is a REQUEST attached to the campaign, not a guarantee. Staff still build
// the podium: a trophy may have been retired, a week may need a different
// value, and a brand asking for something we cannot give has to be told rather
// than silently given something else.
//
// ===== THE RULE THAT MATTERS =====
//
// A brand may only ask for ITS OWN trophies, or unbranded ones from the general
// catalogue. Another brand's trophy carries their logo, and the winner keeps it
// on their profile permanently — one brand putting another's logo on a podium
// is the kind of mistake that ends both relationships.

import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export type BrandTrophy = {
  id: string;
  name: string;
  tier: string;
  value: number;
  imageUrl: string | null;
  /** Null for the general catalogue — available to everybody. */
  brandId: string | null;
};

/**
 * Everything this brand may put on a podium: theirs, plus the general
 * catalogue.
 */
export async function trophiesForBrand(db: DB, brandId: string): Promise<BrandTrophy[]> {
  try {
    const rows = await db.select({
      id: schema.trophies.id,
      name: schema.trophies.name,
      tier: schema.trophies.tier,
      value: schema.trophies.value,
      imageUrl: schema.trophies.imageUrl,
      brandId: schema.trophies.brandId,
    }).from(schema.trophies)
      .where(or(eq(schema.trophies.brandId, brandId), isNull(schema.trophies.brandId)))
      .orderBy(asc(schema.trophies.value));
    return rows.map((r) => ({ ...r, value: Number(r.value ?? 0) }));
  } catch { return []; }
}

/** Only the ones carrying this brand's logo — what "your trophies" means. */
export async function ownTrophies(db: DB, brandId: string): Promise<BrandTrophy[]> {
  try {
    const rows = await db.select({
      id: schema.trophies.id,
      name: schema.trophies.name,
      tier: schema.trophies.tier,
      value: schema.trophies.value,
      imageUrl: schema.trophies.imageUrl,
      brandId: schema.trophies.brandId,
    }).from(schema.trophies)
      .where(and(eq(schema.trophies.brandId, brandId)))
      .orderBy(asc(schema.trophies.value));
    return rows.map((r) => ({ ...r, value: Number(r.value ?? 0) }));
  } catch { return []; }
}

/**
 * Group by value, because that is how a brand thinks about them.
 *
 * Not by tier: "gold" is our word and it is one of four, while a brand with
 * three $100 designs and two $50s is looking for the $100 row. The tier is
 * still carried on each trophy for anybody who wants it.
 */
export function byValue(trophies: BrandTrophy[]): { value: number; trophies: BrandTrophy[] }[] {
  const bag = new Map<number, BrandTrophy[]>();
  for (const t of trophies) {
    const v = Math.round(Number(t.value ?? 0) * 100) / 100;
    bag.set(v, [...(bag.get(v) ?? []), t]);
  }
  return [...bag.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([value, list]) => ({ value, trophies: list }));
}

/**
 * Keep only the ids this brand is allowed to ask for.
 *
 * Silently DROPS anything else rather than refusing the whole request: the only
 * way another brand's id gets here is a tampered form or a stale page, and
 * failing the campaign purchase over it would punish the wrong person. What
 * matters is that it never reaches a podium.
 */
export async function sanitisePrizeRequest(
  db: DB, brandId: string, places: unknown,
): Promise<string[][]> {
  if (!Array.isArray(places)) return [];
  const allowed = new Set((await trophiesForBrand(db, brandId)).map((t) => t.id));
  const out = places.slice(0, 10).map((p) =>
    (Array.isArray(p) ? p : [])
      .map(String)
      .filter((id) => allowed.has(id))
      .slice(0, 4));
  while (out.length && !out[out.length - 1].length) out.pop();
  return out;
}
