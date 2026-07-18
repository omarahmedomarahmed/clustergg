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

export type BrandCampaignSummary = {
  id: string; name: string; status: string; startDate: Date; endDate: Date;
  budget: number | null; coverUrl: string | null; logoUrl: string | null;
  impressions: number; clicks: number; ctr: number;
  filled: number; total: number; ready: boolean;
};

export type BrandPortalData = {
  campaigns: BrandCampaignSummary[];
  totals: { impressions: number; clicks: number; ctr: number; active: number; total: number };
  intel: {
    topPlacement: { key: string; impressions: number } | null;
    topCountry: { country: string; impressions: number } | null;
    topPage: { path: string; impressions: number } | null;
    bestDay: { day: string; impressions: number } | null;
    byDay: { day: string; impressions: number; clicks: number }[];
  };
};

// Everything the glorified brand portal needs in one call: every campaign with
// its own rolled-up numbers + readiness, brand-wide totals, and the marketing
// intelligence (best placement / country / page / day) across all campaigns.
export async function getBrandPortalData(db: DB, brandId: string, days = 30): Promise<BrandPortalData> {
  const campaigns = await db.select().from(schema.adCampaigns)
    .where(eq(schema.adCampaigns.brandId, brandId))
    .orderBy(desc(schema.adCampaigns.createdAt));

  const perCampaign = await Promise.all(campaigns.map(async (c) => {
    const [analytics, readiness] = await Promise.all([
      getCampaignAnalytics(db, c.id, days),
      getCampaignReadiness(db, c.id),
    ]);
    return { c, analytics, readiness };
  }));

  const summaries: BrandCampaignSummary[] = perCampaign.map(({ c, analytics, readiness }) => ({
    id: c.id, name: c.name, status: c.status, startDate: c.startDate, endDate: c.endDate,
    budget: c.budget, coverUrl: c.coverUrl, logoUrl: c.logoUrl,
    impressions: analytics.impressions, clicks: analytics.clicks, ctr: analytics.ctr,
    filled: readiness.filled, total: readiness.total, ready: readiness.ready,
  }));

  const totImp = summaries.reduce((s, c) => s + c.impressions, 0);
  const totClk = summaries.reduce((s, c) => s + c.clicks, 0);

  // Merge the per-campaign slices for brand-wide intelligence.
  const plc = new Map<string, number>(), ctry = new Map<string, number>(), page = new Map<string, number>(), day = new Map<string, { impressions: number; clicks: number }>();
  for (const { analytics } of perCampaign) {
    for (const p of analytics.byPlacement) plc.set(p.key, (plc.get(p.key) ?? 0) + p.impressions);
    for (const c of analytics.byCountry) ctry.set(c.country, (ctry.get(c.country) ?? 0) + c.impressions);
    for (const p of analytics.byPage) page.set(p.path, (page.get(p.path) ?? 0) + p.impressions);
    for (const d of analytics.byDay) { const e = day.get(d.day) ?? { impressions: 0, clicks: 0 }; e.impressions += d.impressions; e.clicks += d.clicks; day.set(d.day, e); }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const tp = top(plc), tc = top(ctry), tg = top(page);
  const byDay = [...day.entries()].map(([d, v]) => ({ day: d, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  const bestDay = [...byDay].sort((a, b) => b.impressions - a.impressions)[0] ?? null;

  return {
    campaigns: summaries,
    totals: { impressions: totImp, clicks: totClk, ctr: totImp ? totClk / totImp : 0, active: summaries.filter((c) => c.status === "active").length, total: summaries.length },
    intel: {
      topPlacement: tp ? { key: tp[0], impressions: tp[1] } : null,
      topCountry: tc ? { country: tc[0], impressions: tc[1] } : null,
      topPage: tg ? { path: tg[0], impressions: tg[1] } : null,
      bestDay: bestDay ? { day: bestDay.day, impressions: bestDay.impressions } : null,
      byDay,
    },
  };
}

export type BrandAnalytics = {
  impressions: number; clicks: number; ctr: number;
  byDay: { day: string; impressions: number; clicks: number }[];
  byPlacement: { key: string; pageScope: string; impressions: number; clicks: number }[];
};

// Analytics for the brand portal: one campaign (campaignId) or the whole brand
// (all its campaigns merged). Powers the interactive chart + placement table and
// the in-place ajax refresh endpoint.
export async function getBrandAnalytics(db: DB, brandId: string, opts: { campaignId?: string; days?: number } = {}): Promise<BrandAnalytics> {
  const days = opts.days ?? 90;
  let campaignIds: string[];
  if (opts.campaignId) {
    const [c] = await db.select({ id: schema.adCampaigns.id }).from(schema.adCampaigns)
      .where(and(eq(schema.adCampaigns.id, opts.campaignId), eq(schema.adCampaigns.brandId, brandId))).limit(1);
    campaignIds = c ? [c.id] : [];
  } else {
    const rows = await db.select({ id: schema.adCampaigns.id }).from(schema.adCampaigns).where(eq(schema.adCampaigns.brandId, brandId));
    campaignIds = rows.map((r) => r.id);
  }
  const empty: BrandAnalytics = { impressions: 0, clicks: 0, ctr: 0, byDay: [], byPlacement: [] };
  if (campaignIds.length === 0) return empty;

  const parts = await Promise.all(campaignIds.map((id) => getCampaignAnalytics(db, id, days)));
  const day = new Map<string, { impressions: number; clicks: number }>();
  const plc = new Map<string, { key: string; pageScope: string; impressions: number; clicks: number }>();
  let imp = 0, clk = 0;
  for (const a of parts) {
    imp += a.impressions; clk += a.clicks;
    for (const d of a.byDay) { const e = day.get(d.day) ?? { impressions: 0, clicks: 0 }; e.impressions += d.impressions; e.clicks += d.clicks; day.set(d.day, e); }
    for (const p of a.byPlacement) { const e = plc.get(p.key) ?? { key: p.key, pageScope: p.pageScope, impressions: 0, clicks: 0 }; e.impressions += p.impressions; e.clicks += p.clicks; plc.set(p.key, e); }
  }
  return {
    impressions: imp, clicks: clk, ctr: imp ? clk / imp : 0,
    byDay: [...day.entries()].map(([d, v]) => ({ day: d, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    byPlacement: [...plc.values()].sort((a, b) => b.impressions - a.impressions),
  };
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
