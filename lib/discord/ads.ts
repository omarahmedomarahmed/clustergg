import { and, eq, gte, isNull} from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { serveAds } from "@/lib/ads";
import { canAct, siteUrl } from "@/lib/discord/config";
import { postMessage } from "@/lib/discord/rest";
import { adEligibleGuilds } from "@/lib/discord/guilds";
import { linkButton, rows } from "@/lib/discord/components";
import { embedColor } from "@/lib/discord/cards";

// Ads the bot posts into servers that have crossed the unlock threshold.
//
// Two rules keep this from feeling like spam, which is what would get the bot
// removed from every server it's in:
//   * Only servers past the linked-gamer threshold AND opted in receive posts.
//   * A server gets at most one ad per interval, tracked in discord_ad_posts —
//     so a cron that runs twice, or a retry, can't double-post.
//
// Impressions are written to the EXISTING adImpressions table with `guildId`
// set, so Discord revenue shows up in the ad dashboards brands already read
// rather than in a parallel system nobody reconciles.

export const MIN_HOURS_BETWEEN_ADS = 6;
const PLACEMENT = "discord_bot_post";

export type AdRunResult = { considered: number; posted: number; skipped: number };

export type ManualAdOptions = {
  // Post to these servers only. Empty/undefined means every eligible server.
  guildIds?: string[];
  // Which creative to send. Omitted means "whatever rotation picks".
  campaignCreativeId?: string;
  // Staff sending on purpose can override the one-ad-per-interval rule; the
  // cron never can.
  force?: boolean;
};

export async function postAdsToGuilds(opts: ManualAdOptions = {}): Promise<AdRunResult> {
  const result: AdRunResult = { considered: 0, posted: 0, skipped: 0 };
  if (!canAct()) return result;

  let guilds = await adEligibleGuilds();
  if (opts.guildIds?.length) guilds = guilds.filter((g) => opts.guildIds!.includes(g.guildId));
  result.considered = guilds.length;
  if (!guilds.length) return result;

  const db = await getDb();
  // One ad selection for the whole run — every eligible server sees the same
  // creative in a given cycle, which is also what a brand expects to buy.
  const creative = opts.campaignCreativeId
    ? await creativeById(db, opts.campaignCreativeId)
    : (await serveAds(db, PLACEMENT, "both").catch(() => null))?.creatives?.[0] ?? null;
  if (!creative) return result;

  for (const g of guilds) {
    if (!g.channelId) { result.skipped++; continue; }
    if (!opts.force && await postedRecently(g.guildId)) { result.skipped++; continue; }

    const res = await postMessage(g.channelId, {
      embeds: [{
        author: { name: `${creative.brandName} · sponsored` },
        image: { url: creative.fileUrl },
        color: embedColor("#8b5cf6"),
        footer: { text: "Sponsored — this server earns a share of Cluster's ad revenue." },
      }],
      components: rows([
        creative.clickUrl ? linkButton("Learn more", creative.clickUrl, "🔗") : null,
        linkButton("Open Cluster", siteUrl(), "🚀"),
      ]),
    });

    try {
      await db.insert(schema.discordAdPosts).values({
        id: uid(), guildId: g.guildId, campaignCreativeId: creative.campaignCreativeId,
        channelId: g.channelId, messageId: res.ok ? res.data.id : null,
        status: res.ok ? "posted" : "failed",
      });
      if (res.ok) {
        // Straight into the existing analytics pipeline.
        await db.insert(schema.adImpressions).values({
          id: uid(), campaignCreativeId: creative.campaignCreativeId,
          pagePath: `discord:${g.guildId}`, deviceType: "discord", guildId: g.guildId,
          // B81.2. A scheduled ad post lands in a public channel. ONE row for
          // it — not one per member. `docs/AD_VIEW.md` says why we do not
          // multiply a public post by an audience estimate.
          surface: "discord_public", cardKind: "ad_post",
        });
      }
    } catch { /* the post already happened; bookkeeping failing is not worse */ }

    if (res.ok) result.posted++; else result.skipped++;
  }

  return result;
}

// One specific creative, shaped like what `serveAds` returns so the posting
// loop doesn't care which way it was chosen.
async function creativeById(db: Awaited<ReturnType<typeof getDb>>, campaignCreativeId: string) {
  try {
    const [row] = await db.select({
      campaignCreativeId: schema.adCampaignCreatives.id,
      fileUrl: schema.adCreatives.fileUrl,
      clickUrl: schema.adCreatives.clickUrl,
      brandName: schema.brands.name,
    })
      .from(schema.adCampaignCreatives)
      .innerJoin(schema.adCreatives, eq(schema.adCampaignCreatives.creativeId, schema.adCreatives.id))
      .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
      .innerJoin(schema.brands, eq(schema.adCampaigns.brandId, schema.brands.id))
      .where(eq(schema.adCampaignCreatives.id, campaignCreativeId))
      .limit(1);
    return row ?? null;
  } catch { return null; }
}

// Every creative staff can send by hand, newest campaign first.
export async function sendableCreatives(): Promise<{
  campaignCreativeId: string; fileUrl: string; brandName: string; campaignName: string; placement: string | null;
}[]> {
  try {
    const db = await getDb();
    return await db.select({
      campaignCreativeId: schema.adCampaignCreatives.id,
      fileUrl: schema.adCreatives.fileUrl,
      brandName: schema.brands.name,
      campaignName: schema.adCampaigns.name,
      placement: schema.adPlacements.key,
    })
      .from(schema.adCampaignCreatives)
      .innerJoin(schema.adCreatives, eq(schema.adCampaignCreatives.creativeId, schema.adCreatives.id))
      .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
      .innerJoin(schema.brands, eq(schema.adCampaigns.brandId, schema.brands.id))
      .innerJoin(schema.adPlacements, eq(schema.adCampaignCreatives.placementId, schema.adPlacements.id))
      // Staff pick from what is running, not from everything that ever ran.
      .where(isNull(schema.adCampaignCreatives.retiredAt))
      .limit(60);
  } catch { return []; }
}

async function postedRecently(guildId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const since = new Date(Date.now() - MIN_HOURS_BETWEEN_ADS * 3600_000);
    const rows = await db.select({ id: schema.discordAdPosts.id })
      .from(schema.discordAdPosts)
      .where(and(
        eq(schema.discordAdPosts.guildId, guildId),
        gte(schema.discordAdPosts.createdAt, since),
      )).limit(1);
    return rows.length > 0;
  } catch {
    // If we can't tell, don't post — a missed ad is cheaper than a duplicate.
    return true;
  }
}
