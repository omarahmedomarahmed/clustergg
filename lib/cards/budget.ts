// Spend limits on rendering and storage (B46).
//
// Vercel Pro raises the ceiling; it does not remove it. Two failure modes this
// exists to stop, and they are different problems:
//
//   **The overnight bill.** B14's home card is cached per gamer, per state — a
//   key that invalidates whenever they link an account or their challenges
//   move. A bug that busts that key does not fail; it renders, and renders, and
//   bills. A daily ceiling turns that from an invoice into a graph.
//
//   **The slow fill.** Every render stores a PNG. Nothing has ever removed one
//   except a payload change, so the store only grows. A cap with least-recently-
//   used eviction turns "grows forever" into "holds the cards people look at".
//
// The rule when the ceiling trips: **serve the last good card, never fail.** A
// stale card is a card. A missing card is a broken Discord message, and the
// person looking at it did nothing wrong.

import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Renders per UTC day before we stop drawing and start serving stale.
 *
 * ===== B77: THIS NUMBER WAS NEVER CHECKED AGAINST THE MODEL =====
 *
 * 4,000/day is roughly 200 active gamers at ordinary card usage. B46 set it as
 * a bill guard without comparing it to the growth `docs/COMMERCIAL_MODEL_V2.md`
 * assumes — two of our own documents contradicted each other, and the one that
 * would have failed first was this one, silently, by serving stale cards to a
 * network that had outgrown it.
 *
 * It is now a DEFAULT, not a constant: `renderCeiling()` reads
 * `cards.dailyRenderCeiling` from settings, so raising it is an admin action
 * rather than a deploy. That is the whole of B77 that belongs in code — the
 * modelling of what a render actually costs is an owner decision, and a number
 * nobody can change without a deploy is a number that goes stale between them.
 *
 * The default stays at 4,000 deliberately. Raising it here would remove the
 * guard for everybody at once; raising it in settings is a decision somebody
 * makes with the graph in front of them.
 */
export const DAILY_RENDER_CEILING = 4000;

/**
 * A separate line for editor previews. B83.5.
 *
 * Every preview in the profile editor is a real Satori render. One gamer
 * fiddling with colours for ten minutes could otherwise eat the whole
 * network's daily allowance, so previews draw on their own budget and running
 * that one dry costs a preview rather than every card in every server.
 *
 * Zero disables previews entirely, which is the right emergency lever: an
 * editor that says "previews are paused" is survivable, a Discord that cannot
 * draw a card is not.
 */
export const DAILY_PREVIEW_CEILING = 500;

/** Settings keys, so the admin form and the reader cannot disagree. */
export const BUDGET_KEYS = {
  render: "cards.dailyRenderCeiling",
  preview: "cards.dailyPreviewCeiling",
  store: "cards.storeCap",
} as const;

/**
 * The configured ceiling, or the default.
 *
 * Reads through the caller's handle when given one — this is reachable from
 * card rendering, which is reachable from a seed, and a helper that opens its
 * own connection there deadlocks. That has happened twice in this codebase.
 */
export async function renderCeiling(
  db?: Awaited<ReturnType<typeof getDb>>,
  which: keyof typeof BUDGET_KEYS = "render",
): Promise<number> {
  const fallback = which === "preview" ? DAILY_PREVIEW_CEILING
    : which === "store" ? CARD_STORE_CAP : DAILY_RENDER_CEILING;
  try {
    const handle = db ?? await getDb();
    const [row] = await handle.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.key, BUDGET_KEYS[which])).limit(1);
    const n = Number((row?.value as { n?: number } | null)?.n);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  } catch { return fallback; }
}
/** How many stored cards we keep. Beyond this, least-recently-used goes first. */
export const CARD_STORE_CAP = 3000;
/** A card nobody has looked at in this long is a candidate whatever the cap says. */
export const CARD_TTL_DAYS = 30;

const startOfUtcDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export type RenderBudget = {
  used: number;
  ceiling: number;
  remaining: number;
  /** True when we are serving stale rather than rendering. */
  exhausted: boolean;
  resetsAt: string;
};

/**
 * How much of today's render budget is gone.
 *
 * Counted from `updatedAt` on the render rows themselves rather than from a
 * counter we keep separately: a counter can drift from reality, and the thing
 * that matters is how many PNGs were actually drawn.
 */
export async function renderBudget(): Promise<RenderBudget> {
  const reset = startOfUtcDay();
  reset.setUTCDate(reset.getUTCDate() + 1);
  const empty: RenderBudget = {
    used: 0, ceiling: DAILY_RENDER_CEILING, remaining: DAILY_RENDER_CEILING,
    exhausted: false, resetsAt: reset.toISOString(),
  };
  try {
    const db = await getDb();
    // B77: configured, not compiled in.
    const ceiling = await renderCeiling(db);
    const [row] = await db.select({ n: sql<number>`count(*)` })
      .from(schema.cardRenders)
      .where(gte(schema.cardRenders.updatedAt, startOfUtcDay()));
    const used = Number(row?.n ?? 0);
    return {
      used, ceiling,
      remaining: Math.max(0, ceiling - used),
      // A ceiling of 0 means "stop drawing", not "unlimited". `used >= 0` is
      // always true, which is the correct reading of a deliberate zero.
      exhausted: used >= ceiling,
      resetsAt: reset.toISOString(),
    };
  } catch {
    // A budget we cannot read must NOT stop rendering. Failing closed here
    // would take every card on the platform down because one query timed out —
    // and the thing being protected is a bill, not a person.
    return empty;
  }
}

export type Eviction = { evicted: number; freedBytes: number; kept: number };

/**
 * Evict the least recently used cards, oldest first.
 *
 * "Least recently used" is `updatedAt`, which every cache hit does NOT touch —
 * so a card served a thousand times today can still be evicted if its payload
 * has not changed in a month. That is the right behaviour: eviction only costs
 * a re-render, and the alternative — touching a row on every hit — is a write
 * per Discord message.
 *
 * Nothing in use is removed: a card whose payload still matches is re-rendered
 * on its next request, which is a cost, not a break.
 */
export async function evictCards(opts: { cap?: number; ttlDays?: number; dryRun?: boolean } = {}): Promise<Eviction> {
  const cap = opts.cap ?? CARD_STORE_CAP;
  const ttlDays = opts.ttlDays ?? CARD_TTL_DAYS;
  try {
    const db = await getDb();
    const all = await db.select({
      id: schema.cardRenders.id, url: schema.cardRenders.url,
      bytes: schema.cardRenders.bytes, updatedAt: schema.cardRenders.updatedAt,
    }).from(schema.cardRenders).orderBy(desc(schema.cardRenders.updatedAt));

    const cutoff = new Date(Date.now() - ttlDays * 86400_000);
    // Two reasons to go, in one pass: past the TTL, or past the cap. The cap
    // list is taken from the END of a newest-first ordering, which is what
    // makes it least-recently-used rather than arbitrary.
    const overCap = all.slice(cap);
    const expired = all.filter((r) => r.updatedAt && r.updatedAt < cutoff);
    const doomed = new Map([...overCap, ...expired].map((r) => [r.id, r]));

    if (opts.dryRun) {
      return {
        evicted: doomed.size,
        freedBytes: [...doomed.values()].reduce((s, r) => s + Number(r.bytes ?? 0), 0),
        kept: all.length - doomed.size,
      };
    }

    let freed = 0;
    const { delBlobObject } = await import("@/lib/storage-audit");
    for (const r of doomed.values()) {
      // The blob first, the row second. The other order can leave a row
      // pointing at an object that is gone, which is a broken card; this order
      // can leave an orphaned object, which is a few kilobytes.
      if (r.url) { try { await delBlobObject(r.url); } catch { /* orphan is harmless */ } }
      await db.delete(schema.cardRenders).where(eq(schema.cardRenders.id, r.id));
      freed += Number(r.bytes ?? 0);
    }
    return { evicted: doomed.size, freedBytes: freed, kept: all.length - doomed.size };
  } catch { return { evicted: 0, freedBytes: 0, kept: 0 }; }
}

export type StoreReport = {
  byKind: { kind: string; count: number; bytes: number; hits: number }[];
  totalCount: number;
  totalBytes: number;
  cap: number;
  overCap: number;
  budget: RenderBudget;
};

/** What is held, by kind — and whether it is over the line. */
export async function storeReport(): Promise<StoreReport> {
  const budget = await renderBudget();
  const empty: StoreReport = {
    byKind: [], totalCount: 0, totalBytes: 0, cap: CARD_STORE_CAP, overCap: 0, budget,
  };
  try {
    const db = await getDb();
    const rows = await db.select({
      kind: schema.cardRenders.kind,
      count: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(${schema.cardRenders.bytes}), 0)`,
      hits: sql<number>`coalesce(sum(${schema.cardRenders.hits}), 0)`,
    }).from(schema.cardRenders).groupBy(schema.cardRenders.kind);

    const byKind = rows.map((r) => ({
      kind: r.kind, count: Number(r.count), bytes: Number(r.bytes), hits: Number(r.hits),
    })).sort((a, b) => b.bytes - a.bytes);

    const totalCount = byKind.reduce((s, k) => s + k.count, 0);
    return {
      byKind,
      totalCount,
      // The totals RECONCILE against the per-kind rows by construction — they
      // are summed from them rather than counted separately, so the dashboard
      // cannot show a total that disagrees with the table under it.
      totalBytes: byKind.reduce((s, k) => s + k.bytes, 0),
      cap: CARD_STORE_CAP,
      overCap: Math.max(0, totalCount - CARD_STORE_CAP),
      budget,
    };
  } catch { return empty; }
}

/** The last good card for a key, whatever its payload now says. */
export async function lastGoodCard(kind: string, cacheKey: string): Promise<string | null> {
  try {
    const db = await getDb();
    const [row] = await db.select({ url: schema.cardRenders.url })
      .from(schema.cardRenders)
      .where(and(eq(schema.cardRenders.kind, kind), eq(schema.cardRenders.cacheKey, cacheKey)))
      .limit(1);
    return row?.url ?? null;
  } catch { return null; }
}

/** Oldest first — what eviction would take next. For the dashboard. */
export async function evictionCandidates(limit = 10) {
  try {
    const db = await getDb();
    return await db.select({
      kind: schema.cardRenders.kind, cacheKey: schema.cardRenders.cacheKey,
      bytes: schema.cardRenders.bytes, hits: schema.cardRenders.hits,
      updatedAt: schema.cardRenders.updatedAt,
    }).from(schema.cardRenders)
      .orderBy(asc(schema.cardRenders.updatedAt))
      .limit(limit);
  } catch { return []; }
}
