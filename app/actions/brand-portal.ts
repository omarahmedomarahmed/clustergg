"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";

// The brand portal is unauthenticated but gated by the brand's access key. Every
// action re-validates the key against the brand before doing anything.
async function requireBrand(brandId: string, key: string) {
  const db = await getDb();
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!brand || !brand.accessKey || brand.accessKey !== key) throw new Error("Invalid brand access key");
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

// Brand posts a message into the shared inbox.
export async function portalSendMessage(brandId: string, key: string, formData: FormData) {
  const { db, brand } = await requireBrand(brandId, key);
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a message first." };
  await db.insert(schema.brandMessages).values({ id: uid(), brandId, sender: "brand", body, readByBrand: true });
  revalidatePath(`/brands/${brand.slug}`);
  return { ok: true };
}
