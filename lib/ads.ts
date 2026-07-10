import { createHash } from "crypto";
import { and, eq, gte, lte } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";

export function hashIp(ip: string): string {
  const salt = process.env.AD_ANALYTICS_SALT ?? "cluster-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export type ServedCreative = {
  campaignCreativeId: string;
  creativeId: string;
  type: string;
  fileUrl: string;
  clickUrl: string | null;
  brandName: string;
  durationSeconds: number | null;
};

export type ServedPlacement = {
  key: string;
  width: number;
  height: number;
  rotationIntervalSeconds: number;
  creatives: ServedCreative[];
};

// Resolve what to show right now in a placement: active campaigns mapped to the
// placement, within their date window, weighted rotation handled client-side.
export async function serveAds(db: DB, placementKey: string, device: string): Promise<ServedPlacement | null> {
  const [placement] = await db.select().from(schema.adPlacements)
    .where(eq(schema.adPlacements.key, placementKey)).limit(1);
  if (!placement) return null;
  if (placement.device !== "both" && placement.device !== device) return null;

  const now = new Date();
  const rows = await db.select({
    cc: schema.adCampaignCreatives,
    creative: schema.adCreatives,
    campaign: schema.adCampaigns,
    brand: schema.brands,
  })
    .from(schema.adCampaignCreatives)
    .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
    .innerJoin(schema.adCreatives, eq(schema.adCampaignCreatives.creativeId, schema.adCreatives.id))
    .innerJoin(schema.brands, eq(schema.adCampaigns.brandId, schema.brands.id))
    .where(and(
      eq(schema.adCampaignCreatives.placementId, placement.id),
      eq(schema.adCampaigns.status, "active"),
      eq(schema.adCreatives.status, "approved"),
      eq(schema.brands.status, "active"),
      lte(schema.adCampaigns.startDate, now),
      gte(schema.adCampaigns.endDate, now),
    ));

  const eligible = rows
    .filter((r) => r.campaign.targetDevice === "both" || r.campaign.targetDevice === device)
    .sort((a, b) => b.cc.priority - a.cc.priority || b.cc.weight - a.cc.weight)
    .slice(0, placement.maxCreativesInRotation);

  if (eligible.length === 0) return null;
  return {
    key: placement.key,
    width: placement.width,
    height: placement.height,
    rotationIntervalSeconds: placement.rotationIntervalSeconds,
    creatives: eligible.map((r) => ({
      campaignCreativeId: r.cc.id,
      creativeId: r.creative.id,
      type: r.creative.type,
      fileUrl: r.creative.fileUrl,
      clickUrl: r.creative.clickUrl,
      brandName: r.brand.name,
      durationSeconds: r.creative.durationSeconds,
    })),
  };
}
