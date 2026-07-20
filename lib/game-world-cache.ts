// Blob-backed snapshot of a game's world catalogue (champions / agents+weapons /
// heroes / legends / maps + their lore + art). Once an admin syncs a game, its
// list + every detail is written as a single JSON blob and we serve from that —
// so we stop re-calling Data Dragon / valorant-api / OpenDota / fortnite-api on
// every planet visit. Re-sync only when a new champion / skin drops.
//
// The snapshot URL lives in platform_settings (tiny) so reads don't touch the
// heavy JSON via Neon; the JSON itself comes from our Blob CDN.

import {
  getEntityList, getEntityDetail, gameHasDirectory,
  type EntityLite, type EntityDetail,
} from "@/lib/game-entities";
import { getContent, setContent } from "@/lib/cms";
import { putJsonToBlob, uploadUrlToBlob, blobConfigured } from "@/lib/blob";
import { slugify } from "@/lib/utils";

export type GameWorldSnapshot = {
  game: string;
  syncedAt: string;
  art: boolean;               // whether images were re-hosted to our Blob
  count: number;
  list: EntityLite[];
  details: Record<string, EntityDetail>;   // keyed by `${kind}:${id}`
};

const snapSettingKey = (game: string) => `gameworld.snap.${slugify(game)}`;
const detailKey = (kind: string, id: string) => `${kind}:${id}`;

// In-process cache so a warm server reads the blob JSON at most once per window.
const mem = new Map<string, { snap: GameWorldSnapshot | null; exp: number }>();
const MEM_TTL = 10 * 60_000;

async function loadSnapshot(game: string): Promise<GameWorldSnapshot | null> {
  const key = snapSettingKey(game);
  const cached = mem.get(key);
  if (cached && cached.exp > Date.now()) return cached.snap;
  let snap: GameWorldSnapshot | null = null;
  try {
    const url = (await getContent([key]))[key];
    if (url) {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) snap = (await r.json()) as GameWorldSnapshot;
    }
  } catch { snap = null; }
  mem.set(key, { snap, exp: Date.now() + MEM_TTL });
  return snap;
}

// Read the catalogue list: snapshot first, else live (which is itself
// in-process cached inside game-entities).
export async function getCachedEntityList(game: string): Promise<EntityLite[]> {
  const snap = await loadSnapshot(game);
  if (snap?.list?.length) return snap.list;
  return getEntityList(game);
}

// Read one entity's detail: snapshot first, else live.
export async function getCachedEntityDetail(game: string, kind: string, id: string): Promise<EntityDetail | null> {
  const snap = await loadSnapshot(game);
  const hit = snap?.details?.[detailKey(kind, id)];
  if (hit) return hit;
  return getEntityDetail(game, kind, id);
}

export type SyncResult = { ok: boolean; game: string; count: number; artHosted: number; reason?: string };

// Materialise a game's catalogue to Blob. `art` also re-hosts images (deduped,
// with a time + count budget so it always fits a serverless request; anything
// past the budget keeps its original CDN URL and a later re-sync finishes it).
export async function syncGameWorld(
  game: string,
  opts: { art?: boolean; budgetMs?: number; maxArt?: number } = {},
): Promise<SyncResult> {
  if (!gameHasDirectory(game)) return { ok: false, game, count: 0, artHosted: 0, reason: "no game world for this game" };
  if (!blobConfigured()) return { ok: false, game, count: 0, artHosted: 0, reason: "Vercel Blob isn't configured" };

  const list = await getEntityList(game);
  if (!list.length) return { ok: false, game, count: 0, artHosted: 0, reason: "live fetch returned nothing" };

  const details: Record<string, EntityDetail> = {};
  for (const e of list) {
    const d = await getEntityDetail(game, e.kind, e.id);
    if (d) details[detailKey(e.kind, e.id)] = d;
  }

  let artHosted = 0;
  if (opts.art) {
    const deadline = Date.now() + (opts.budgetMs ?? 45_000);
    const cap = opts.maxArt ?? 800;
    const map = new Map<string, string>();
    const host = async (url: string | null | undefined): Promise<string | null | undefined> => {
      if (!url || !/^https:\/\//i.test(url)) return url;
      const seen = map.get(url); if (seen) return seen;
      if (artHosted >= cap || Date.now() > deadline) return url; // budget spent — keep CDN url
      const hosted = await uploadUrlToBlob(url, "gameworld");
      map.set(url, hosted);
      if (hosted !== url) artHosted++;
      return hosted;
    };
    for (const e of list) e.image = (await host(e.image)) ?? e.image;
    for (const d of Object.values(details)) {
      d.image = (await host(d.image)) ?? d.image;
      d.splash = (await host(d.splash)) ?? d.splash ?? null;
      for (const s of d.skins) s.image = (await host(s.image)) ?? s.image;
      for (const a of d.abilities) if (a.icon) a.icon = (await host(a.icon)) ?? a.icon;
    }
  }

  const snap: GameWorldSnapshot = { game, syncedAt: new Date().toISOString(), art: !!opts.art, count: list.length, list, details };
  const url = await putJsonToBlob(snap, "gameworld");
  if (!url) return { ok: false, game, count: list.length, artHosted, reason: "Blob write failed" };
  await setContent(snapSettingKey(game), url);
  mem.delete(snapSettingKey(game));
  return { ok: true, game, count: list.length, artHosted };
}

// When a game's snapshot was last written (for the admin panel). null = never.
export async function getSnapshotMeta(game: string): Promise<{ syncedAt: string; art: boolean; count: number } | null> {
  const snap = await loadSnapshot(game);
  if (!snap) return null;
  return { syncedAt: snap.syncedAt, art: snap.art, count: snap.count };
}
