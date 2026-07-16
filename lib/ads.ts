import { createHash } from "crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
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
  // Project only the columns we return. Crucially we do NOT fetch
  // `adCreatives.fileUrl` here (it can be a large inline data URL) — we first
  // rank/slice to the few creatives actually shown, then fetch their fileUrls in
  // a second, tiny query. This stops us from pulling every eligible creative's
  // full art on every ad-slot request (a hot path on almost every page).
  const rows = await db.select({
    ccId: schema.adCampaignCreatives.id,
    creativeId: schema.adCreatives.id,
    priority: schema.adCampaignCreatives.priority,
    weight: schema.adCampaignCreatives.weight,
    type: schema.adCreatives.type,
    clickUrl: schema.adCreatives.clickUrl,
    durationSeconds: schema.adCreatives.durationSeconds,
    brandName: schema.brands.name,
    targetDevice: schema.adCampaigns.targetDevice,
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
    .filter((r) => r.targetDevice === "both" || r.targetDevice === device)
    .sort((a, b) => b.priority - a.priority || b.weight - a.weight)
    .slice(0, placement.maxCreativesInRotation);

  if (eligible.length === 0) return null;

  // Now fetch fileUrls for ONLY the creatives we're actually returning.
  const creativeIds = [...new Set(eligible.map((r) => r.creativeId))];
  const fileRows = creativeIds.length
    ? await db.select({ id: schema.adCreatives.id, fileUrl: schema.adCreatives.fileUrl })
        .from(schema.adCreatives).where(inArray(schema.adCreatives.id, creativeIds))
    : [];
  const fileById = new Map(fileRows.map((f) => [f.id, f.fileUrl]));

  return {
    key: placement.key,
    width: placement.width,
    height: placement.height,
    rotationIntervalSeconds: placement.rotationIntervalSeconds,
    creatives: eligible.map((r) => ({
      campaignCreativeId: r.ccId,
      creativeId: r.creativeId,
      type: r.type,
      fileUrl: fileById.get(r.creativeId) ?? "",
      clickUrl: r.clickUrl,
      brandName: r.brandName,
      durationSeconds: r.durationSeconds,
    })),
  };
}
