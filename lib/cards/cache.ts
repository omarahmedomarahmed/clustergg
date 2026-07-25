import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { putBuffer, blobConfigured } from "@/lib/blob";
import { delBlobObject } from "@/lib/storage-audit";
import { uid } from "@/lib/utils";
import { renderCardBuffer } from "@/lib/cards/render";
import type { CardData } from "@/lib/cards/types";

// Blob-backed cache for rendered PNG cards.
//
// Discord needs a *URL* it can attach, and re-rendering a 1200x630 PNG on every
// command would be both slow (Discord gives us 3 seconds) and expensive (Blob
// data transfer is already the tightest resource we have). So: hash the exact
// card payload, and only re-render when that hash changes. Everything else is
// a single indexed row read.
//
// Nothing here is allowed to break a card. When Blob isn't configured, or the
// DB write fails, callers fall back to the always-available live route
// (`/api/card/<kind>?…`), which renders on demand.

// Bump when the RENDERER changes in a way that should invalidate stored art.
// The hash is of the card's data, so without this a layout or image-pipeline
// fix would never reach cards that were already rendered.
const RENDER_VERSION = 3;

export function cardHash(data: unknown): string {
  return createHash("sha1").update(`v${RENDER_VERSION}:${JSON.stringify(data)}`).digest("hex").slice(0, 20);
}

export type CachedCard = { url: string; cached: boolean };

// Return a hosted PNG URL for a card payload, rendering + storing it only when
// the payload has actually changed since the last render.
export async function getOrRenderCard(kind: string, cacheKey: string, data: CardData): Promise<CachedCard | null> {
  const hash = cardHash(data);
  if (!blobConfigured()) return null;

  let existing: typeof schema.cardRenders.$inferSelect | undefined;
  try {
    const db = await getDb();
    [existing] = await db.select().from(schema.cardRenders)
      .where(and(eq(schema.cardRenders.kind, kind), eq(schema.cardRenders.cacheKey, cacheKey)))
      .limit(1);
    if (existing && existing.dataHash === hash && existing.url) {
      // Fire-and-forget hit counter — never let analytics block a response.
      db.update(schema.cardRenders)
        .set({ hits: existing.hits + 1 })
        .where(eq(schema.cardRenders.id, existing.id))
        .catch(() => {});
      return { url: existing.url, cached: true };
    }
  } catch { /* fall through to a fresh render */ }

  let url: string | null = null;
  let bytes = 0;
  try {
    const buffer = await renderCardBuffer(data);
    bytes = buffer.byteLength;
    url = await putBuffer(buffer, "image/png", "png", `cards/${kind}`);
  } catch { return null; }
  if (!url) return null;

  const stale = existing?.url && existing.url !== url ? existing.url : null;
  try {
    const db = await getDb();
    if (existing) {
      await db.update(schema.cardRenders)
        .set({ dataHash: hash, url, bytes, hits: 0, updatedAt: new Date() })
        .where(eq(schema.cardRenders.id, existing.id));
    } else {
      await db.insert(schema.cardRenders).values({ id: uid(), kind, cacheKey, dataHash: hash, url, bytes });
    }
  } catch { /* the URL is still valid — we just re-render next time */ }

  // Only delete the old object AFTER the new one is recorded, so a failure
  // never leaves a row pointing at a deleted image.
  if (stale) { try { await delBlobObject(stale); } catch { /* orphan is harmless */ } }

  return { url, cached: false };
}

// Drop a cached card so the next request re-renders it. Used when staff edit a
// guide, a card background, or any art the cards are built from.
export async function invalidateCards(kind: string, cacheKey?: string): Promise<number> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.cardRenders).where(
      cacheKey
        ? and(eq(schema.cardRenders.kind, kind), eq(schema.cardRenders.cacheKey, cacheKey))
        : eq(schema.cardRenders.kind, kind),
    );
    for (const r of rows) {
      await db.delete(schema.cardRenders).where(eq(schema.cardRenders.id, r.id));
      try { await delBlobObject(r.url); } catch { /* orphan is harmless */ }
    }
    return rows.length;
  } catch { return 0; }
}

// Every card the bot has ever rendered — powers the admin storage view.
export async function listCardRenders(): Promise<{ kind: string; cacheKey: string; url: string; bytes: number; hits: number; updatedAt: Date }[]> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.cardRenders);
    return rows
      .map((r) => ({ kind: r.kind, cacheKey: r.cacheKey, url: r.url, bytes: r.bytes, hits: r.hits, updatedAt: r.updatedAt }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } catch { return []; }
}
