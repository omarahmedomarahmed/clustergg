import { createHash } from "crypto";
import { and, eq, gte, inArray, lte, isNull} from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";

export function hashIp(ip: string): string {
  const salt = process.env.AD_ANALYTICS_SALT ?? "cluster-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * A stable identifier for one browsing session, derived from the session cookie
 * and never containing any of it. B104.
 *
 * THE HOLE: the beacon stored `cluster_session.slice(-16)` — the last sixteen
 * characters of the session JWT — in `ad_impressions.session_id`. Sixteen
 * characters of a signature is not enough to forge anything, and that is not
 * the point. It is a fragment of a CREDENTIAL sitting in an analytics table,
 * which has a much lower security bar than the cookie jar it came from: staff
 * read it, reports join on it, and every backup of that table now contains a
 * piece of everybody's live session.
 *
 * Hashing costs nothing, because nothing ever needed the value. The only
 * property the beacon wants is STABILITY — the same browser producing the same
 * key so a second view of the same card can be deduped — and a hash has that.
 *
 * Salted with the same secret as `hashIp`, so a dump of this table cannot be
 * matched against a rainbow table built somewhere else.
 */
export function hashSession(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const salt = process.env.AD_ANALYTICS_SALT ?? "cluster-salt";
  return createHash("sha256").update(`${salt}:session:${v}`).digest("hex").slice(0, 32);
}

export type ServedCreative = {
  campaignCreativeId: string;
  creativeId: string;
  type: string;
  fileUrl: string;
  clickUrl: string | null;
  /** The brand's own words on the Discord button under this creative. */
  ctaLabel: string | null;
  brandName: string;
  /** Whose creative this is. M4 uses it to keep the Discord slot house-only. */
  brandId: string;
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
    ctaLabel: schema.adCreatives.ctaLabel,
    durationSeconds: schema.adCreatives.durationSeconds,
    brandName: schema.brands.name,
    brandId: schema.brands.id,
    targetDevice: schema.adCampaigns.targetDevice,
  })
    .from(schema.adCampaignCreatives)
    .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
    .innerJoin(schema.adCreatives, eq(schema.adCampaignCreatives.creativeId, schema.adCreatives.id))
    .innerJoin(schema.brands, eq(schema.adCampaigns.brandId, schema.brands.id))
    .where(and(
      eq(schema.adCampaignCreatives.placementId, placement.id),
      // Retired rows keep their history and stop being served. Without this
      // the replaced creative would still rotate alongside its replacement.
      isNull(schema.adCampaignCreatives.retiredAt),
      eq(schema.adCampaigns.status, "active"),
      eq(schema.adCreatives.status, "approved"),
      eq(schema.brands.status, "active"),
      lte(schema.adCampaigns.startDate, now),
      gte(schema.adCampaigns.endDate, now),
    ));

  // ===== B75.5: no silent cutoff =====
  //
  // `maxCreativesInRotation` defaults to 3 and this used to be a plain sort +
  // slice: sorted by priority then weight, then everything past the third row
  // DROPPED. A fourth paying brand on a placement served nothing, was billed,
  // and appeared nowhere — money taken for delivery not made, invisible because
  // the code looks completely reasonable.
  //
  // The cap is a rendering limit, not an eligibility one, so it now rotates
  // WHICH creatives fill those slots instead of permanently excluding the same
  // ones. The window advances with the hour, so every eligible creative reaches
  // the surface within a day whatever its priority.
  //
  // Priority still leads: a high-priority creative is in every window. It is
  // the tail that rotates rather than being cut off.
  const ranked = rows
    .filter((r) => r.targetDevice === "both" || r.targetDevice === device)
    .sort((a, b) => b.priority - a.priority || b.weight - a.weight);

  const slots = Math.max(1, placement.maxCreativesInRotation);
  let eligible = ranked;
  if (ranked.length > slots) {
    // Everything at the top priority is always in. Whatever is left rotates
    // through the remaining slots on an hourly offset.
    const topPriority = ranked[0].priority;
    const always = ranked.filter((r) => r.priority === topPriority).slice(0, slots);
    const tail = ranked.filter((r) => !always.includes(r));
    const room = Math.max(0, slots - always.length);
    if (room === 0 || tail.length === 0) {
      eligible = always;
    } else {
      const hour = Math.floor(now.getTime() / 3600_000);
      const offset = (hour * room) % tail.length;
      const window: typeof tail = [];
      for (let i = 0; i < room; i++) window.push(tail[(offset + i) % tail.length]);
      eligible = [...always, ...window];
    }
  }

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
      ctaLabel: r.ctaLabel,
      brandName: r.brandName,
      brandId: r.brandId,
      durationSeconds: r.durationSeconds,
    })),
  };
}
