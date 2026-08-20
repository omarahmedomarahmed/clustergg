// Per-page background art. `14-EDITABLE` §4.
//
// New: there is no concept of per-page art anywhere in v3. What a human can do
// is set a background image, an overlay strength and a focal point for any
// public page, and clear it back to none.
//
// ===== E13 — ALWAYS OPTIONAL, AND THAT IS A DESIGN CONSTRAINT =====
//
// *"Every page must look finished with none."* So art is additive only: no
// layout depends on it, no spacing assumes it, and the page a deploy ships is
// the page somebody sees when the store is empty or unreachable.
//
// ===== E14 — THE OVERLAY IS PART OF THE SETTING, NOT A GUESS =====
//
// Art without a readability overlay is how text becomes unreadable on somebody
// else's screen — a photograph that is dark on the monitor it was chosen on and
// bright on a phone in daylight. So the overlay travels with the image and has
// a floor: an operator can turn it down, and not off, because the failure it
// prevents is one they cannot see from where they are standing.
//
// ===== E15 — FENCED =====
//
// House rule 11. A background that fails to load leaves the page intact, which
// is why this is a separate fixed layer behind the content (D18) rather than a
// `background-image` on anything the page needs.

import { desc, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";

/**
 * The pages art can be set on.
 *
 * A closed list rather than "any string": a key nobody renders is a setting an
 * operator changes and cannot see the effect of, and they will conclude the
 * feature is broken rather than that they typed a page name wrong.
 */
export const PAGE_KEYS = [
  "home",
  "challenges",
  "games",
  "trophies",
  "pool",
  "community",
  "servers",
  "brands",
] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export function isPageKey(v: unknown): v is PageKey {
  return typeof v === "string" && (PAGE_KEYS as readonly string[]).includes(v);
}

export type PageArt = {
  imageUrl: string | null;
  /** 0–90. How much dark is laid over the art so the words stay readable. */
  overlay: number;
  /** Which part of the image survives a crop. `object-position`, in words. */
  focal: "top" | "center" | "bottom";
};

/**
 * The floor, and why there is one.
 *
 * Zero overlay on a photograph is white text on whatever happens to be behind
 * it. An operator picking art on a calibrated monitor cannot see the phone in
 * daylight that makes it unreadable, so the setting they are given starts below
 * their judgement rather than at nothing.
 */
export const MIN_OVERLAY = 20;
export const MAX_OVERLAY = 90;

export const NO_ART: PageArt = { imageUrl: null, overlay: 45, focal: "center" };

/** Read a stored blob forgivingly. D20's rule — never discard on a mismatch. */
export function readArt(raw: unknown): PageArt {
  const blob = (raw ?? {}) as Record<string, unknown>;
  const overlay = Number(blob.overlay);
  return {
    imageUrl: typeof blob.imageUrl === "string" && blob.imageUrl ? blob.imageUrl : null,
    overlay: Number.isFinite(overlay)
      ? Math.min(MAX_OVERLAY, Math.max(MIN_OVERLAY, Math.round(overlay)))
      : NO_ART.overlay,
    focal:
      blob.focal === "top" || blob.focal === "bottom" || blob.focal === "center"
        ? blob.focal
        : NO_ART.focal,
  };
}

/**
 * One page's art.
 *
 * Fenced onto "none", which is the whole of E13 in one `catch`: a store that
 * cannot be read produces the page the deploy ships, and every page is designed
 * to look finished that way.
 */
export async function pageArtFor(db: DB, key: PageKey): Promise<PageArt> {
  return (await allPageArt(db)).get(key) ?? { ...NO_ART };
}

/** Every page's art, newest row per key. */
export async function allPageArt(db: DB): Promise<Map<string, PageArt>> {
  const out = new Map<string, PageArt>();
  try {
    const rows = await db
      .select()
      .from(schema.contentOverrides)
      .where(eq(schema.contentOverrides.scope, "page_art"))
      .orderBy(desc(schema.contentOverrides.editedAt));
    for (const row of rows) {
      if (out.has(row.key)) continue;
      out.set(row.key, readArt(row.settings));
    }
  } catch (e) {
    console.error("[page-art] unreachable; every page renders with none", e);
  }
  return out;
}
