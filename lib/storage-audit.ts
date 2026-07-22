import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { PgTable } from "drizzle-orm/pg-core";

export type ImageRef = { table: string; field: string; refId: string; label: string; url: string };
export type ImageCategory = "vercel-blob" | "higgsfield" | "inline-dataurl" | "external" | "empty";

export function classifyUrl(u: string | null | undefined): ImageCategory {
  if (!u) return "empty";
  if (u.startsWith("data:")) return "inline-dataurl";
  if (/\.public\.blob\.vercel-storage\.com/i.test(u)) return "vercel-blob";
  if (/cloudfront\.net|higgsfield/i.test(u)) return "higgsfield";
  if (/^https?:\/\//i.test(u)) return "external";
  return "empty";
}

// Collect every image URL stored across the database (scalar columns), tagged
// with where it came from so the admin storage audit can classify + size them.
export async function collectImageRefs(): Promise<ImageRef[]> {
  const db = await getDb();
  const refs: ImageRef[] = [];
  const push = (table: string, field: string, refId: string, label: string, url: string | null | undefined) => {
    if (url && url.trim()) refs.push({ table, field, refId, label, url });
  };

  const [games, quests, tiers, creatives, brands, challenges, partners, trophies, users] = await Promise.all([
    db.select({ id: schema.games.id, name: schema.games.name, logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl, planetImageUrl: schema.games.planetImageUrl, planetBgUrl: schema.games.planetBgUrl }).from(schema.games),
    db.select({ id: schema.quests.id, name: schema.quests.name, logoUrl: schema.quests.logoUrl, cardBgUrl: schema.quests.cardBgUrl, coverUrl: schema.quests.coverUrl, mapArtUrl: schema.quests.mapArtUrl }).from(schema.quests),
    db.select({ id: schema.questTiers.id, name: schema.questTiers.name, iconUrl: schema.questTiers.iconUrl }).from(schema.questTiers),
    db.select({ id: schema.adCreatives.id, name: schema.adCreatives.name, fileUrl: schema.adCreatives.fileUrl }).from(schema.adCreatives),
    db.select({ id: schema.brands.id, name: schema.brands.name, logoUrl: schema.brands.logoUrl, coverUrl: schema.brands.coverUrl }).from(schema.brands),
    db.select({ id: schema.challenges.id, title: schema.challenges.title, coverUrl: schema.challenges.coverUrl, heroUrl: schema.challenges.heroUrl }).from(schema.challenges),
    db.select({ id: schema.partners.id, name: schema.partners.name, logoUrl: schema.partners.logoUrl }).from(schema.partners),
    db.select({ id: schema.trophies.id, name: schema.trophies.name, imageUrl: schema.trophies.imageUrl }).from(schema.trophies),
    db.select({ id: schema.users.id, name: schema.users.displayName, avatarUrl: schema.users.avatarUrl, bannerUrl: schema.users.bannerUrl }).from(schema.users),
  ]);

  for (const g of games) {
    push("games", "logo", g.id, g.name, g.logoUrl);
    push("games", "cover", g.id, g.name, g.coverUrl);
    push("games", "planet", g.id, g.name, g.planetImageUrl);
    push("games", "planet-bg", g.id, g.name, g.planetBgUrl);
  }
  for (const q of quests) {
    push("quests", "logo", q.id, q.name, q.logoUrl);
    push("quests", "card-bg", q.id, q.name, q.cardBgUrl);
    push("quests", "cover", q.id, q.name, q.coverUrl);
    push("quests", "map-art", q.id, q.name, q.mapArtUrl);
  }
  for (const t of tiers) push("quest_tiers", "icon", t.id, t.name, t.iconUrl);
  for (const c of creatives) push("ad_creatives", "file", c.id, c.name, c.fileUrl);
  for (const b of brands) { push("brands", "logo", b.id, b.name, b.logoUrl); push("brands", "cover", b.id, b.name, b.coverUrl); }
  for (const c of challenges) { push("challenges", "cover", c.id, c.title, c.coverUrl); push("challenges", "hero", c.id, c.title, c.heroUrl); }
  for (const p of partners) push("partners", "logo", p.id, p.name, p.logoUrl);
  for (const t of trophies) push("trophies", "image", t.id, t.name, t.imageUrl);
  for (const u of users) { push("users", "avatar", u.id, u.name, u.avatarUrl); push("users", "banner", u.id, u.name, u.bannerUrl); }

  // Quest map video + 3D mesh (big files that also count toward transfer).
  const questAv = await db.select({ id: schema.quests.id, name: schema.quests.name, mapVideoUrl: schema.quests.mapVideoUrl, mapGlbUrl: schema.quests.mapGlbUrl }).from(schema.quests);
  for (const q of questAv) { push("quests", "map-video", q.id, q.name, q.mapVideoUrl); push("quests", "map-glb", q.id, q.name, q.mapGlbUrl); }

  // CMS content (platform_settings): brand art, page backgrounds, loading
  // screen, quest-panel art, etc. — often the biggest single images.
  try {
    const settings = await db.select().from(schema.platformSettings);
    for (const s of settings) {
      const v = typeof s.value === "string" ? s.value : "";
      if (v && classifyUrl(v) !== "empty" && classifyUrl(v) !== "external") push("platform_settings", "content", s.key, s.key, v);
      else if (v && /^https?:\/\//i.test(v) && /\.(png|jpe?g|webp|gif|svg|mp4)(\?|$)/i.test(v)) push("platform_settings", "content", s.key, s.key, v);
    }
  } catch { /* settings table missing */ }

  return refs;
}

// ===== Mutation: replace / delete an image URL everywhere it's referenced =====

// Every scalar image column, so a URL swap or wipe hits all of them.
type ColTuple = [PgTable, string, unknown];
function imageColumns(): ColTuple[] {
  const s = schema;
  return [
    [s.games, "logoUrl", s.games.logoUrl], [s.games, "coverUrl", s.games.coverUrl],
    [s.games, "planetImageUrl", s.games.planetImageUrl], [s.games, "planetBgUrl", s.games.planetBgUrl],
    [s.quests, "logoUrl", s.quests.logoUrl], [s.quests, "cardBgUrl", s.quests.cardBgUrl],
    [s.quests, "coverUrl", s.quests.coverUrl], [s.quests, "mapArtUrl", s.quests.mapArtUrl],
    [s.quests, "mapVideoUrl", s.quests.mapVideoUrl], [s.quests, "mapGlbUrl", s.quests.mapGlbUrl],
    [s.questTiers, "iconUrl", s.questTiers.iconUrl],
    [s.adCreatives, "fileUrl", s.adCreatives.fileUrl],
    [s.brands, "logoUrl", s.brands.logoUrl], [s.brands, "coverUrl", s.brands.coverUrl],
    [s.challenges, "coverUrl", s.challenges.coverUrl], [s.challenges, "heroUrl", s.challenges.heroUrl],
    [s.partners, "logoUrl", s.partners.logoUrl],
    [s.trophies, "imageUrl", s.trophies.imageUrl],
    [s.users, "avatarUrl", s.users.avatarUrl], [s.users, "bannerUrl", s.users.bannerUrl],
  ];
}

// Point every reference of `oldUrl` at `newUrl` (scalar columns + CMS content).
export async function replaceUrlEverywhere(oldUrl: string, newUrl: string): Promise<number> {
  const db = await getDb();
  let n = 0;
  for (const [tbl, field, col] of imageColumns()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await db.update(tbl as any).set({ [field]: newUrl }).where(eq(col as any, oldUrl));
    n += (r as { rowCount?: number }).rowCount ?? 0;
  }
  // CMS content is jsonb-stored strings; match in JS to avoid jsonb casting.
  try {
    const rows = await db.select().from(schema.platformSettings);
    for (const s of rows) {
      if (typeof s.value === "string" && s.value === oldUrl) {
        await db.update(schema.platformSettings).set({ value: newUrl, updatedAt: new Date() }).where(eq(schema.platformSettings.key, s.key));
        n++;
      }
    }
  } catch { /* ignore */ }
  return n;
}

// Null out every reference of `url` (scalar columns + CMS content).
export async function deleteUrlEverywhere(url: string): Promise<number> {
  const db = await getDb();
  let n = 0;
  for (const [tbl, field, col] of imageColumns()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await db.update(tbl as any).set({ [field]: null }).where(eq(col as any, url));
    n += (r as { rowCount?: number }).rowCount ?? 0;
  }
  try {
    const rows = await db.select().from(schema.platformSettings);
    for (const s of rows) {
      if (typeof s.value === "string" && s.value === url) {
        await db.update(schema.platformSettings).set({ value: "", updatedAt: new Date() }).where(eq(schema.platformSettings.key, s.key));
        n++;
      }
    }
  } catch { /* ignore */ }
  return n;
}

// Delete the underlying Vercel Blob object (only ours — never a CDN we don't own).
export async function delBlobObject(url: string): Promise<boolean> {
  if (classifyUrl(url) !== "vercel-blob") return false;
  try {
    const { del } = await import("@vercel/blob");
    const { resolveBlobToken } = await import("@/lib/blob");
    const token = resolveBlobToken();
    await del(url, token ? { token } : undefined);
    return true;
  } catch { return false; }
}

// HEAD each remote image to read Content-Length. Inline data URLs are sized from
// the string length. Runs server-side (Vercel), where the network is open.
export async function measureSizes(refs: ImageRef[]): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  const unique = [...new Set(refs.map((r) => r.url))];
  await Promise.all(unique.map(async (url) => {
    if (url.startsWith("data:")) { sizes.set(url, Math.round((url.length * 3) / 4)); return; }
    try {
      const ctrl = AbortSignal.timeout(6000);
      let res = await fetch(url, { method: "HEAD", signal: ctrl });
      let len = Number(res.headers.get("content-length"));
      if (!len) { // some CDNs don't answer HEAD with a length — fall back to a ranged GET
        res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(6000) });
        const cr = res.headers.get("content-range"); // bytes 0-0/12345
        if (cr && cr.includes("/")) len = Number(cr.split("/")[1]);
        if (!len) len = Number(res.headers.get("content-length"));
      }
      if (len) sizes.set(url, len);
    } catch { /* unreachable / timed out — leave unset */ }
  }));
  return sizes;
}
