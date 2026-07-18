import { randomBytes } from "crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";

// A short, human-typable brand access key (portal gate). Not a secret token in
// the cryptographic sense — it just gates a read-mostly analytics dashboard.
export function newAccessKey(): string {
  const raw = randomBytes(9).toString("base64url").replace(/[-_]/g, "").toUpperCase().slice(0, 12);
  return `CLSTR-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export type PlacementSlot = {
  placementId: string; key: string; pageScope: string; width: number; height: number;
  creativeId: string | null; creativeType: string | null; fileUrl: string | null; clickUrl: string | null;
};

// For a campaign: every placement paired with the creative assigned to it (or
// null). `ready` = a creative exists for every placement — the launch gate.
export async function getCampaignReadiness(db: DB, campaignId: string): Promise<{ slots: PlacementSlot[]; ready: boolean; filled: number; total: number }> {
  const placements = await db.select().from(schema.adPlacements).orderBy(schema.adPlacements.key);
  const assigned = await db.select({
    placementId: schema.adCampaignCreatives.placementId,
    creativeId: schema.adCreatives.id, type: schema.adCreatives.type,
    fileUrl: schema.adCreatives.fileUrl, clickUrl: schema.adCreatives.clickUrl,
  }).from(schema.adCampaignCreatives)
    .innerJoin(schema.adCreatives, eq(schema.adCampaignCreatives.creativeId, schema.adCreatives.id))
    .where(eq(schema.adCampaignCreatives.campaignId, campaignId));
  const byPlacement = new Map(assigned.map((a) => [a.placementId, a]));
  const slots: PlacementSlot[] = placements.map((p) => {
    const a = byPlacement.get(p.id);
    return {
      placementId: p.id, key: p.key, pageScope: p.pageScope, width: p.width, height: p.height,
      creativeId: a?.creativeId ?? null, creativeType: a?.type ?? null, fileUrl: a?.fileUrl ?? null, clickUrl: a?.clickUrl ?? null,
    };
  });
  const filled = slots.filter((s) => s.creativeId).length;
  return { slots, ready: filled === slots.length && slots.length > 0, filled, total: slots.length };
}

export type CampaignAnalytics = {
  impressions: number; clicks: number; ctr: number;
  byPlacement: { key: string; pageScope: string; impressions: number; clicks: number }[];
  byPage: { path: string; impressions: number }[];
  byDay: { day: string; impressions: number; clicks: number }[];
  byCountry: { country: string; impressions: number }[];
};

// Impression/click rollups for one campaign, sliced by placement, page, day and
// country. Backed by adImpressions/adClicks joined through campaignCreatives.
export async function getCampaignAnalytics(db: DB, campaignId: string, days = 30): Promise<CampaignAnalytics> {
  const ccRows = await db.select({ id: schema.adCampaignCreatives.id, placementId: schema.adCampaignCreatives.placementId })
    .from(schema.adCampaignCreatives).where(eq(schema.adCampaignCreatives.campaignId, campaignId));
  const ccIds = ccRows.map((r) => r.id);
  const empty: CampaignAnalytics = { impressions: 0, clicks: 0, ctr: 0, byPlacement: [], byPage: [], byDay: [], byCountry: [] };
  if (ccIds.length === 0) return empty;

  const since = new Date(Date.now() - days * 86400000);
  const placements = await db.select().from(schema.adPlacements);
  const placementById = new Map(placements.map((p) => [p.id, p]));
  const ccToPlacement = new Map(ccRows.map((r) => [r.id, r.placementId]));

  const [imps, clicks] = await Promise.all([
    db.select({ ccId: schema.adImpressions.campaignCreativeId, path: schema.adImpressions.pagePath, country: schema.adImpressions.geoCountry, at: schema.adImpressions.createdAt })
      .from(schema.adImpressions).where(and(inArray(schema.adImpressions.campaignCreativeId, ccIds), gte(schema.adImpressions.createdAt, since))),
    db.select({ ccId: schema.adClicks.campaignCreativeId, at: schema.adClicks.createdAt })
      .from(schema.adClicks).where(and(inArray(schema.adClicks.campaignCreativeId, ccIds), gte(schema.adClicks.createdAt, since))),
  ]);

  const byPlacement = new Map<string, { impressions: number; clicks: number }>();
  const byPage = new Map<string, number>();
  const byDay = new Map<string, { impressions: number; clicks: number }>();
  const byCountry = new Map<string, number>();
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  for (const im of imps) {
    const pid = ccToPlacement.get(im.ccId);
    if (pid) { const e = byPlacement.get(pid) ?? { impressions: 0, clicks: 0 }; e.impressions++; byPlacement.set(pid, e); }
    if (im.path) byPage.set(im.path, (byPage.get(im.path) ?? 0) + 1);
    const dk = dayKey(im.at); const de = byDay.get(dk) ?? { impressions: 0, clicks: 0 }; de.impressions++; byDay.set(dk, de);
    const c = im.country || "—"; byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  }
  for (const cl of clicks) {
    const pid = ccToPlacement.get(cl.ccId);
    if (pid) { const e = byPlacement.get(pid) ?? { impressions: 0, clicks: 0 }; e.clicks++; byPlacement.set(pid, e); }
    const dk = dayKey(cl.at); const de = byDay.get(dk) ?? { impressions: 0, clicks: 0 }; de.clicks++; byDay.set(dk, de);
  }

  return {
    impressions: imps.length, clicks: clicks.length, ctr: imps.length ? clicks.length / imps.length : 0,
    byPlacement: [...byPlacement.entries()].map(([pid, v]) => ({ key: placementById.get(pid)?.key ?? pid, pageScope: placementById.get(pid)?.pageScope ?? "", ...v })).sort((a, b) => b.impressions - a.impressions),
    byPage: [...byPage.entries()].map(([path, impressions]) => ({ path, impressions })).sort((a, b) => b.impressions - a.impressions).slice(0, 30),
    byDay: [...byDay.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    byCountry: [...byCountry.entries()].map(([country, impressions]) => ({ country, impressions })).sort((a, b) => b.impressions - a.impressions).slice(0, 12),
  };
}

// Platform-wide totals for the master ads dashboard.
export async function getAdsMasterTotals(db: DB, days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  const [[imp], [clk], [brandCount], [liveCampaigns]] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(schema.adImpressions).where(gte(schema.adImpressions.createdAt, since)),
    db.select({ c: sql<number>`count(*)` }).from(schema.adClicks).where(gte(schema.adClicks.createdAt, since)),
    db.select({ c: sql<number>`count(*)` }).from(schema.brands),
    db.select({ c: sql<number>`count(*)` }).from(schema.adCampaigns).where(eq(schema.adCampaigns.status, "active")),
  ]);
  const impressions = Number(imp?.c ?? 0), clicks = Number(clk?.c ?? 0);
  return { impressions, clicks, ctr: impressions ? clicks / impressions : 0, brands: Number(brandCount?.c ?? 0), liveCampaigns: Number(liveCampaigns?.c ?? 0) };
}

export async function getBrandBySlugOrId(db: DB, slugOrId: string) {
  const [byId] = await db.select().from(schema.brands).where(eq(schema.brands.id, slugOrId)).limit(1);
  if (byId) return byId;
  const [bySlug] = await db.select().from(schema.brands).where(eq(schema.brands.slug, slugOrId)).limit(1);
  return bySlug ?? null;
}

export async function getBrandInbox(db: DB, brandId: string) {
  return db.select().from(schema.brandMessages).where(eq(schema.brandMessages.brandId, brandId))
    .orderBy(desc(schema.brandMessages.createdAt)).limit(100);
}
