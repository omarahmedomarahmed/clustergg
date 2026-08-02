import { and, asc, count, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { networkStats, publicServers, type NetworkStats, type PublicServer } from "@/lib/network";
import { loadMetrics, METRICS, type Metrics } from "@/lib/admin-metrics";
import { TIERS } from "@/lib/server-portal";
import { buildPricing, quote, type PricingConfig, type Quote, PRICING_NUMBER_KEYS } from "@/lib/pricing";
import { buildFinance, FINANCE_CMS_KEYS, type FinanceConfig } from "@/lib/finance";
import { getContent } from "@/lib/cms";
import { SEED_DOCS, SEED_PEOPLE } from "@/lib/dataroom/defaults";
import { CARD_AD_PLACEMENT } from "@/lib/cards/ads";
import type { Doc, Person, Section, SectionData, SectionKind } from "@/lib/dataroom/types";
import type { MilestoneLadder } from "@/lib/dataroom/types-client";

export * from "@/lib/dataroom/types";
export type { MilestoneLadder } from "@/lib/dataroom/types-client";

// The data room: documents built out of ordered sections, with the numbers
// read live at request time rather than typed into a slide.
//
// The whole reason this exists as data rather than a page is that a deck goes
// stale the day it's written. An investor opening this next month sees this
// month's servers; a partner sees the audience we can reach right now, not the
// one we could when someone last exported a PDF.

// ===== Seeding =====

// Written once, on first read. Never re-applied — a deploy silently reverting
// an admin's copy is the fastest way to make a CMS untrusted, so anything that
// already exists is left exactly as it is.
export async function ensureSeeded(): Promise<void> {
  try {
    const db = await getDb();
    const [existing] = await db.select({ c: count() }).from(schema.dataroomDocs);
    if (Number(existing?.c ?? 0) > 0) return;

    for (const [i, d] of SEED_DOCS.entries()) {
      const docId = uid();
      await db.insert(schema.dataroomDocs).values({
        id: docId, slug: d.slug, kind: d.kind, title: d.title, subtitle: d.subtitle,
        summary: d.summary, accent: d.accent, accent2: d.accent2,
        contactEmail: d.contactEmail, contactNote: d.contactNote, sortOrder: i,
      }).onConflictDoNothing();

      for (const [j, s] of d.sections.entries()) {
        await db.insert(schema.dataroomSections).values({
          id: uid(), docId, kind: s.kind, anchor: s.anchor, navLabel: s.navLabel,
          title: s.title ?? null, subtitle: s.subtitle ?? null, body: s.body ?? null,
          data: (s.data ?? {}) as Record<string, unknown>, sortOrder: j,
          isVisible: !s.hidden,
        }).onConflictDoNothing();
      }
    }

    // People are shared across every document by default (docId null), because
    // the same founders appear in both and maintaining two copies guarantees
    // they drift.
    for (const [i, p] of SEED_PEOPLE.entries()) {
      await db.insert(schema.dataroomPeople).values({
        id: uid(), docId: null, name: p.name, role: p.role, bio: p.bio,
        email: p.email, logos: p.logos, sortOrder: i,
      }).onConflictDoNothing();
    }
  } catch { /* a data room that can't seed still renders its empty state */ }
}

// Replace one document's sections with the shipped set.
//
// Seeding is deliberately once-only, which is right for protecting an admin's
// copy and wrong when the shipped deck is genuinely better than what's stored —
// a redesign that only new installs can see helps nobody. So this exists as an
// explicit, per-document, admin-pressed action: it says what it will destroy
// before it does it, and it never runs on its own.
//
// The document's ROUTING and STYLE are left alone — slug, accent, access key,
// published state, contact address. Its title, subtitle and summary are not:
// those are copy, they appear above the first slide and on the index, and a
// repositioning that reframes every section but leaves the old one-liner on
// the cover has repositioned nothing. So a reseed replaces the words and keeps
// the identity.
export async function reseedDoc(slug: string): Promise<{ ok: boolean; sections: number }> {
  const seed = SEED_DOCS.find((d) => d.slug === slug);
  if (!seed) return { ok: false, sections: 0 };
  try {
    const db = await getDb();
    const [doc] = await db.select({ id: schema.dataroomDocs.id })
      .from(schema.dataroomDocs).where(eq(schema.dataroomDocs.slug, slug)).limit(1);
    if (!doc) return { ok: false, sections: 0 };

    await db.update(schema.dataroomDocs)
      .set({ title: seed.title, subtitle: seed.subtitle, summary: seed.summary })
      .where(eq(schema.dataroomDocs.id, doc.id));

    await db.delete(schema.dataroomSections).where(eq(schema.dataroomSections.docId, doc.id));
    for (const [j, sec] of seed.sections.entries()) {
      await db.insert(schema.dataroomSections).values({
        id: uid(), docId: doc.id, kind: sec.kind, anchor: sec.anchor, navLabel: sec.navLabel,
        title: sec.title ?? null, subtitle: sec.subtitle ?? null, body: sec.body ?? null,
        data: (sec.data ?? {}) as Record<string, unknown>, sortOrder: j,
        isVisible: !sec.hidden,
      });
    }
    return { ok: true, sections: seed.sections.length };
  } catch { return { ok: false, sections: 0 }; }
}

// ===== Reading =====

export async function listDocs(includeUnpublished = false): Promise<Doc[]> {
  await ensureSeeded();
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.dataroomDocs)
      .orderBy(asc(schema.dataroomDocs.sortOrder), asc(schema.dataroomDocs.title));
    return rows.filter((r) => includeUnpublished || r.isPublished) as Doc[];
  } catch { return []; }
}

export async function getDoc(slug: string): Promise<Doc | null> {
  await ensureSeeded();
  try {
    const db = await getDb();
    const [row] = await db.select().from(schema.dataroomDocs)
      .where(eq(schema.dataroomDocs.slug, slug)).limit(1);
    return (row as Doc) ?? null;
  } catch { return null; }
}

export async function getSections(docId: string, includeHidden = false): Promise<Section[]> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.dataroomSections)
      .where(eq(schema.dataroomSections.docId, docId))
      .orderBy(asc(schema.dataroomSections.sortOrder));
    return rows
      .filter((r) => includeHidden || r.isVisible)
      .map((r) => ({ ...r, kind: r.kind as SectionKind, data: (r.data ?? {}) as SectionData })) as Section[];
  } catch { return []; }
}

export async function getPeople(docId: string): Promise<Person[]> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.dataroomPeople)
      .where(or(isNull(schema.dataroomPeople.docId), eq(schema.dataroomPeople.docId, docId)))
      .orderBy(asc(schema.dataroomPeople.sortOrder));
    return rows.filter((r) => r.isVisible) as Person[];
  } catch { return []; }
}

// ===== The live numbers =====

/**
 * Revenue as the database knows it.
 *
 * An investor's first question is "what is your MRR", and a deck that answers
 * it with a typed-in number is a deck that is wrong within a month — or worse,
 * one whose number nobody can trace. These come from the campaigns actually
 * running: `budget` is the monthly contract value on a campaign, so MRR is the
 * sum over active campaigns inside their date window, and everything else is
 * arithmetic on that.
 *
 * Zero is a legitimate answer and is shown as one. Pre-revenue is a stage, not
 * something to be hidden behind an adjective.
 */
export type CommercialStats = {
  brands: number;
  payingBrands: number;
  activeCampaigns: number;
  mrr: number;
  arr: number;
  /** Average revenue per paying brand, per month. */
  arpa: number;
  impressions30d: number;
  clicks30d: number;
  cardCampaigns: number;
  /** Sellable inventory, split by where it lives. */
  placements: { total: number; web: number; discord: number };
};

export type LiveData = {
  network: NetworkStats;
  servers: PublicServer[];
  metrics: Metrics;
  metricDefs: typeof METRICS;
  tiers: typeof TIERS;
  /** The live rate card, so a deck can never quote a price we stopped charging. */
  pricing: PricingConfig;
  /** The plan for the money, from the same editable assumptions the admin sets. */
  finance: FinanceConfig;
  quotes: { reach: Quote; entry: Quote; full: Quote };
  commercial: CommercialStats;
  takenAt: string;
};

// Our own brand row, used for house promos. Never counted as a customer.
const HOUSE_BRAND_ID = "house-cluster-brand";

const NO_COMMERCIAL: CommercialStats = {
  brands: 0, payingBrands: 0, activeCampaigns: 0, mrr: 0, arr: 0, arpa: 0,
  impressions30d: 0, clicks30d: 0, cardCampaigns: 0,
  placements: { total: 0, web: 0, discord: 0 },
};

async function commercialStats(): Promise<CommercialStats> {
  try {
    const db = await getDb();
    const now = new Date();
    const since = new Date(Date.now() - 30 * 86400_000);

    const [brandRows, campaigns, imps, clicks, placements] = await Promise.all([
      db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.status, "active")),
      db.select({ brandId: schema.adCampaigns.brandId, budget: schema.adCampaigns.budget, id: schema.adCampaigns.id })
        .from(schema.adCampaigns)
        .where(and(
          eq(schema.adCampaigns.status, "active"),
          sql`${schema.adCampaigns.startDate} <= ${now}`,
          sql`${schema.adCampaigns.endDate} >= ${now}`,
        )),
      db.select({ n: count() }).from(schema.adImpressions).where(gte(schema.adImpressions.createdAt, since)),
      db.select({ n: count() }).from(schema.adClicks).where(gte(schema.adClicks.createdAt, since)),
      db.select({ id: schema.adPlacements.id, key: schema.adPlacements.key }).from(schema.adPlacements),
    ]);
    const cardPlacement = placements.filter((p) => p.key === CARD_AD_PLACEMENT);

    // The house brand advertises Cluster to its own users. Counting it as a
    // customer would be counting our own marketing as revenue.
    const paying = new Set(campaigns.filter((c) => c.brandId !== HOUSE_BRAND_ID && (c.budget ?? 0) > 0).map((c) => c.brandId));
    const mrr = Math.round(campaigns
      .filter((c) => c.brandId !== HOUSE_BRAND_ID)
      .reduce((sum, c) => sum + (c.budget ?? 0), 0));

    // Our own house promo runs on the card placement too, and counting it here
    // would report an advertiser that is us.
    const cardCampaigns = cardPlacement[0]
      ? (await db.selectDistinct({ campaignId: schema.adCampaignCreatives.campaignId })
          .from(schema.adCampaignCreatives)
          .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
          .where(and(
            eq(schema.adCampaignCreatives.placementId, cardPlacement[0].id),
            sql`${schema.adCampaigns.brandId} <> ${HOUSE_BRAND_ID}`,
          ))).length
      : 0;

    return {
      brands: brandRows.filter((b) => b.id !== HOUSE_BRAND_ID).length,
      payingBrands: paying.size,
      activeCampaigns: campaigns.filter((c) => c.brandId !== HOUSE_BRAND_ID).length,
      mrr,
      arr: mrr * 12,
      arpa: paying.size ? Math.round(mrr / paying.size) : 0,
      impressions30d: Number(imps[0]?.n ?? 0),
      clicks30d: Number(clicks[0]?.n ?? 0),
      cardCampaigns,
      placements: {
        total: placements.length,
        web: placements.filter((p) => !p.key.startsWith("discord_")).length,
        discord: placements.filter((p) => p.key.startsWith("discord_")).length,
      },
    };
  } catch {
    return NO_COMMERCIAL;
  }
}

// One pass for a whole document, handed to every section that needs it, so a
// page with four live sections makes one set of queries rather than four.
export async function liveData(): Promise<LiveData> {
  const [network, servers, metrics, priceContent, financeContent, commercial] = await Promise.all([
    networkStats().catch((): NetworkStats => ({ servers: 0, reach: 0, gamers: 0, linked: 0, challenges: 0, games: 0 })),
    publicServers(12).catch(() => []),
    loadMetrics().catch(() => ({} as Metrics)),
    getContent(PRICING_NUMBER_KEYS).catch(() => ({} as Record<string, string>)),
    getContent(FINANCE_CMS_KEYS).catch(() => ({} as Record<string, string>)),
    commercialStats(),
  ]);
  const pricing = buildPricing(priceContent);
  return {
    network, servers, metrics, metricDefs: METRICS, tiers: TIERS, pricing,
    finance: buildFinance(financeContent), commercial,
    quotes: {
      reach: quote(pricing, { games: 0 }),
      entry: quote(pricing, { games: 1 }),
      full: quote(pricing, { games: pricing.games }),
    },
    takenAt: new Date().toISOString(),
  };
}

// Which milestone we're on, and how far into it.
//
// Deliberately shows the ladder ABOVE the current rung as well: a target you've
// passed is history, and the interesting question for a reader is what the next
// two look like.
export function ladder(current: number, targets: number[]): MilestoneLadder {
  const sorted = [...new Set(targets)].filter((t) => t > 0).sort((a, b) => a - b);
  const next = sorted.find((t) => current < t) ?? null;
  const prev = [...sorted].reverse().find((t) => current >= t) ?? 0;
  return {
    current,
    next,
    toNext: next ? Math.max(0, next - current) : 0,
    // Progress through the CURRENT rung, not through the whole ladder — the
    // latter is always a rounding error early on and reads as no progress.
    pctToNext: next ? Math.max(1, Math.min(100, Math.round(((current - prev) / (next - prev)) * 100))) : 100,
    targets: sorted.map((t) => ({
      value: t,
      reached: current >= t,
      isNext: t === next,
      pct: Math.max(0, Math.min(100, Math.round((current / t) * 100))),
    })),
  };
}

export function metricValueFor(kind: SectionData["metric"], live: LiveData): number {
  switch (kind) {
    case "linked": return live.network.linked;
    case "gamers": return live.network.gamers;
    case "servers": return live.network.servers;
    case "reach":
    default: return live.network.reach;
  }
}

// ===== Tracking =====

// Who opened what. A data room whose owner can't say which investor read the
// traction section is a PDF with extra steps.
//
// `visitorId` is a first-party random id from a cookie — enough to tell one
// reader from ten, and deliberately not an identity.
export async function recordDocView(input: {
  docId: string;
  sectionAnchor?: string | null;
  visitorId?: string | null;
  referrer?: string | null;
  device?: string | null;
  seconds?: number;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.dataroomViews).values({
      id: uid(),
      docId: input.docId,
      sectionAnchor: input.sectionAnchor ?? null,
      visitorId: input.visitorId ?? null,
      referrer: (input.referrer ?? "").slice(0, 300) || null,
      device: input.device ?? null,
      seconds: Math.max(0, Math.min(3600, Math.round(input.seconds ?? 0))),
    });
  } catch { /* analytics must never break a page render */ }
}

export type DocAnalytics = {
  views: number;
  visitors: number;
  sections: { anchor: string; views: number; seconds: number }[];
  referrers: { referrer: string; views: number }[];
  byDay: { day: string; views: number }[];
  devices: { device: string; views: number }[];
};

export async function docAnalytics(docId: string, days = 30): Promise<DocAnalytics> {
  const empty: DocAnalytics = { views: 0, visitors: 0, sections: [], referrers: [], byDay: [], devices: [] };
  try {
    const db = await getDb();
    const since = new Date(Date.now() - days * 86400000);
    const where = and(eq(schema.dataroomViews.docId, docId), gte(schema.dataroomViews.createdAt, since));

    const [totals] = await db.select({
      views: count(),
      visitors: sql<number>`count(distinct ${schema.dataroomViews.visitorId})`,
    }).from(schema.dataroomViews).where(where);

    const sections = await db.select({
      anchor: schema.dataroomViews.sectionAnchor,
      views: count(),
      seconds: sql<number>`coalesce(sum(${schema.dataroomViews.seconds}), 0)`,
    }).from(schema.dataroomViews)
      .where(and(where, sql`${schema.dataroomViews.sectionAnchor} IS NOT NULL`))
      .groupBy(schema.dataroomViews.sectionAnchor)
      .orderBy(desc(count()));

    const referrers = await db.select({ referrer: schema.dataroomViews.referrer, views: count() })
      .from(schema.dataroomViews)
      .where(and(where, sql`${schema.dataroomViews.referrer} IS NOT NULL`))
      .groupBy(schema.dataroomViews.referrer).orderBy(desc(count())).limit(12);

    const devices = await db.select({ device: schema.dataroomViews.device, views: count() })
      .from(schema.dataroomViews)
      .where(and(where, sql`${schema.dataroomViews.device} IS NOT NULL`))
      .groupBy(schema.dataroomViews.device).orderBy(desc(count()));

    const byDay = await db.select({
      day: sql<string>`to_char(${schema.dataroomViews.createdAt}, 'YYYY-MM-DD')`,
      views: count(),
    }).from(schema.dataroomViews).where(where)
      .groupBy(sql`to_char(${schema.dataroomViews.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${schema.dataroomViews.createdAt}, 'YYYY-MM-DD')`);

    return {
      views: Number(totals?.views ?? 0),
      visitors: Number(totals?.visitors ?? 0),
      sections: sections.map((s) => ({ anchor: s.anchor ?? "", views: Number(s.views), seconds: Number(s.seconds) })),
      referrers: referrers.map((r) => ({ referrer: r.referrer ?? "", views: Number(r.views) })),
      devices: devices.map((d) => ({ device: d.device ?? "", views: Number(d.views) })),
      byDay: byDay.map((d) => ({ day: d.day, views: Number(d.views) })),
    };
  } catch { return empty; }
}
