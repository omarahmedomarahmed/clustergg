"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { keysMatch, hasPortalSession } from "@/lib/portal-auth";
import { CARD_AD_PLACEMENT } from "@/lib/cards/ads";

// The brand portal is unauthenticated but gated by the brand's access key. Every
// action re-validates the key against the brand before doing anything.
async function requireBrand(brandId: string, key: string) {
  const db = await getDb();
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!brand) throw new Error("Invalid brand access key");
  // Accept either the key itself or a session already granted for THIS brand.
  // The comparison is constant-time: a plain `!==` leaks a short shared secret
  // one byte at a time to anyone willing to measure.
  const ok = keysMatch(brand.accessKey, key) || (await hasPortalSession("brand", brand.id));
  if (!ok) throw new Error("Invalid brand access key");
  return { db, brand };
}

// The campaign the portal edits: the brand's most recent campaign (draft first).
async function portalCampaign(db: Awaited<ReturnType<typeof getDb>>, brandId: string) {
  const [c] = await db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.brandId, brandId))
    .orderBy(desc(schema.adCampaigns.createdAt)).limit(1);
  return c ?? null;
}

// Brand uploads (or replaces) the creative for one placement of their campaign.
export async function portalUploadCreative(brandId: string, key: string, formData: FormData) {
  const { db, brand } = await requireBrand(brandId, key);
  const campaign = await portalCampaign(db, brandId);
  if (!campaign) return { error: "No campaign yet — reach out and we'll set one up." };

  const placementId = String(formData.get("placementId") ?? "");
  const fileUrl = String(formData.get("fileUrl") ?? "").trim();
  const type = String(formData.get("type") ?? "image");
  const clickUrl = String(formData.get("clickUrl") ?? "").trim() || brand.contactEmail || null;
  if (!placementId || !fileUrl) return { error: "Pick a placement and upload the creative." };

  const [placement] = await db.select().from(schema.adPlacements).where(eq(schema.adPlacements.id, placementId)).limit(1);
  if (!placement) return { error: "Unknown placement." };

  const creativeId = uid();
  await db.insert(schema.adCreatives).values({
    id: creativeId, brandId, name: `${brand.name} · ${placement.key}`, type,
    fileUrl, clickUrl, width: placement.width, height: placement.height,
    durationSeconds: type === "video" ? 5 : null, status: "approved",
  });
  // One creative per placement per campaign — replace any existing assignment.
  await db.delete(schema.adCampaignCreatives).where(and(
    eq(schema.adCampaignCreatives.campaignId, campaign.id),
    eq(schema.adCampaignCreatives.placementId, placementId)));
  await db.insert(schema.adCampaignCreatives).values({ id: uid(), campaignId: campaign.id, creativeId, placementId, weight: 1, priority: 0 });
  revalidatePath(`/brands/${brand.slug}`);
  return { ok: true };
}

// ===== The card campaign: upload one image, you are live =====
//
// The old flow said "No campaign yet — reach out and we'll set one up." That is
// a sales meeting standing between a brand and the thing they came to buy, and
// it is the difference between a product and a service. Uploading a card
// creative IS the launch: it creates the campaign, activates it, and the next
// card ClusterBot renders anywhere on the network can carry it.
//
// Unlike every other placement, creatives here ADD rather than replace — a
// brand runs several and the renderer rotates between them.

const CARD_CAMPAIGN_DAYS = 90;

async function cardPlacement(db: Awaited<ReturnType<typeof getDb>>) {
  const [p] = await db.select().from(schema.adPlacements)
    .where(eq(schema.adPlacements.key, CARD_AD_PLACEMENT)).limit(1);
  return p ?? null;
}

export async function portalLaunchCardCreative(brandId: string, key: string, formData: FormData) {
  const { db, brand } = await requireBrand(brandId, key);
  const fileUrl = String(formData.get("fileUrl") ?? "").trim();
  const clickUrl = String(formData.get("clickUrl") ?? "").trim() || null;
  if (!fileUrl) return { error: "Upload a creative first." };

  const placement = await cardPlacement(db);
  if (!placement) return { error: "The Discord card placement isn't available yet. Message us and we'll sort it." };

  // Reuse the brand's existing card campaign so a second upload joins the
  // rotation instead of starting a rival campaign against itself.
  const [existing] = await db.select({ id: schema.adCampaigns.id, status: schema.adCampaigns.status, endDate: schema.adCampaigns.endDate })
    .from(schema.adCampaigns)
    .innerJoin(schema.adCampaignCreatives, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
    .where(and(
      eq(schema.adCampaigns.brandId, brandId),
      eq(schema.adCampaignCreatives.placementId, placement.id),
    ))
    .orderBy(desc(schema.adCampaigns.createdAt))
    .limit(1);

  const now = new Date();
  const until = new Date(Date.now() + CARD_CAMPAIGN_DAYS * 86400_000);
  let campaignId = existing?.id;
  if (campaignId) {
    // A paused or expired campaign that a brand is uploading to again is a
    // brand asking to run — turn it back on rather than silently accepting art
    // that will never be served.
    await db.update(schema.adCampaigns)
      .set({ status: "active", endDate: existing!.endDate.getTime() < now.getTime() ? until : existing!.endDate })
      .where(eq(schema.adCampaigns.id, campaignId));
  } else {
    campaignId = uid();
    await db.insert(schema.adCampaigns).values({
      id: campaignId, brandId, name: `${brand.name} · Discord cards`,
      startDate: now, endDate: until, targetDevice: "both", status: "active",
    });
  }

  const creativeId = uid();
  await db.insert(schema.adCreatives).values({
    id: creativeId, brandId, name: `${brand.name} · card ${new Date().toISOString().slice(0, 10)}`,
    type: "image", fileUrl, clickUrl: clickUrl ?? brand.contactEmail ?? null,
    width: placement.width, height: placement.height, status: "approved",
  });
  await db.insert(schema.adCampaignCreatives).values({
    id: uid(), campaignId, creativeId, placementId: placement.id, weight: 1, priority: 0,
  });

  revalidatePath(`/brands/${brand.slug}`);
  return { ok: true };
}

/** Pull one creative out of the rotation. The campaign and its stats stay. */
export async function portalRemoveCardCreative(brandId: string, key: string, campaignCreativeId: string) {
  const { db, brand } = await requireBrand(brandId, key);
  const placement = await cardPlacement(db);
  if (!placement) return { error: "Nothing to remove." };

  // Scoped to this brand's own card placement — an id from somewhere else must
  // not be able to unlink another brand's creative.
  const [row] = await db.select({ id: schema.adCampaignCreatives.id })
    .from(schema.adCampaignCreatives)
    .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
    .where(and(
      eq(schema.adCampaignCreatives.id, campaignCreativeId),
      eq(schema.adCampaignCreatives.placementId, placement.id),
      eq(schema.adCampaigns.brandId, brandId),
    )).limit(1);
  if (!row) return { error: "Nothing to remove." };

  await db.delete(schema.adCampaignCreatives).where(eq(schema.adCampaignCreatives.id, row.id));
  revalidatePath(`/brands/${brand.slug}`);
  return { ok: true };
}

/** Stop or restart the card campaign without deleting anything. */
export async function portalSetCardCampaignRunning(brandId: string, key: string, running: boolean) {
  const { db, brand } = await requireBrand(brandId, key);
  const placement = await cardPlacement(db);
  if (!placement) return { error: "No card campaign yet." };

  const [campaign] = await db.select({ id: schema.adCampaigns.id, endDate: schema.adCampaigns.endDate })
    .from(schema.adCampaigns)
    .innerJoin(schema.adCampaignCreatives, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
    .where(and(
      eq(schema.adCampaigns.brandId, brandId),
      eq(schema.adCampaignCreatives.placementId, placement.id),
    )).limit(1);
  if (!campaign) return { error: "No card campaign yet." };

  const patch: { status: string; endDate?: Date } = { status: running ? "active" : "paused" };
  // Restarting a campaign whose window has closed extends it, otherwise
  // "resume" would report success and serve nothing.
  if (running && campaign.endDate.getTime() < Date.now()) patch.endDate = new Date(Date.now() + CARD_CAMPAIGN_DAYS * 86400_000);
  await db.update(schema.adCampaigns).set(patch).where(eq(schema.adCampaigns.id, campaign.id));
  revalidatePath(`/brands/${brand.slug}`);
  return { ok: true };
}

// Brand updates its own portal appearance: logo, cover, background art. Each URL
// is already hosted (uploaded via the key-gated /api/brands/upload).
export async function portalSaveAppearance(brandId: string, key: string, formData: FormData) {
  const { db, brand } = await requireBrand(brandId, key);
  const patch: Record<string, string | null> = {};
  for (const [field, col] of [["logoUrl", "logoUrl"], ["coverUrl", "coverUrl"], ["portalBgUrl", "portalBgUrl"]] as const) {
    if (formData.has(field)) patch[col] = String(formData.get(field) ?? "").trim() || null;
  }
  if (Object.keys(patch).length) await db.update(schema.brands).set(patch).where(eq(schema.brands.id, brandId));
  revalidatePath(`/brands/${brand.slug}`);
  return { ok: true };
}

// Brand saves its customized chart dashboard layout (chart_prefs jsonb).
export async function portalSaveCharts(brandId: string, key: string, json: string) {
  const { db, brand } = await requireBrand(brandId, key);
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return { error: "Could not save charts." }; }
  await db.update(schema.brands).set({ chartPrefs: parsed as typeof schema.brands.$inferInsert.chartPrefs }).where(eq(schema.brands.id, brandId));
  revalidatePath(`/brands/${brand.slug}`);
  return { ok: true };
}

// Brand posts a message into the shared inbox.
export async function portalSendMessage(brandId: string, key: string, formData: FormData) {
  const { db, brand } = await requireBrand(brandId, key);
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a message first." };
  await db.insert(schema.brandMessages).values({ id: uid(), brandId, sender: "brand", body, readByBrand: true });
  revalidatePath(`/brands/${brand.slug}`);
  return { ok: true };
}
