import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { pricingConfig } from "@/lib/pricing-live";
import { PRICING_DEFAULTS } from "@/lib/pricing";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import type {
  BuilderBrand, BuilderGuild, BuilderPricing, BuilderProvider, BuilderReach, BuilderTrophy,
} from "@/components/ChallengeBuilder";

/**
 * The games the builder can build on, with everything their APIs expose.
 *
 * One function because both admin pages listed the capability fields by hand
 * and both forgot `ranks` — so the builder never knew a metric had a ladder,
 * `isRanked()` was false for every game, and "Flex 5v5 tier" asked staff to
 * type a number that a gamer then read back as "At least 9 flex 5v5 tier".
 * Passing the whole MetricDef means there is no list to forget from.
 */
export function builderProviders(): BuilderProvider[] {
  return PROVIDERS
    .filter((p) => !p.identityOnly && p.capabilities.length > 0)
    .map((p) => ({
      id: p.id, name: p.name, game: p.game, live: isProviderLive(p),
      authType: p.authType, docsUrl: p.docsUrl,
      capabilities: p.capabilities,
    }));
}

// Everything the challenge builder needs that isn't the challenge.
//
// One function because both the create page and the edit page need exactly the
// same set, and the last time they didn't, the create page shipped without the
// server list — so a server-gated challenge could only be made from the edit
// page of a challenge that already existed.

export type BuilderContext = {
  trophies: BuilderTrophy[];
  guilds: BuilderGuild[];
  brands: BuilderBrand[];
  pricing: BuilderPricing;
  reach: BuilderReach;
};

export async function builderContext(): Promise<BuilderContext> {
  const db = await getDb();

  const [trophyRows, guildRows, brandRows, cfg] = await Promise.all([
    db.select().from(schema.trophies),
    db.select({
      guildId: schema.discordGuilds.guildId,
      name: schema.discordGuilds.name,
      members: schema.discordGuilds.memberCount,
    }).from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active")),
    db.select({ id: schema.brands.id, name: schema.brands.name, status: schema.brands.status })
      .from(schema.brands),
    pricingConfig().catch(() => null),
  ]);

  // Campaigns per brand, so a sponsored challenge can be attached to the buy it
  // came from. One query, grouped in memory — the alternative is a query per
  // brand on a page that already makes six.
  const brandIds = brandRows.map((b) => b.id);
  const campaignRows = brandIds.length
    ? await db.select({ id: schema.adCampaigns.id, brandId: schema.adCampaigns.brandId, name: schema.adCampaigns.name })
        .from(schema.adCampaigns).where(inArray(schema.adCampaigns.brandId, brandIds))
    : [];
  const byBrand = new Map<string, { id: string; name: string }[]>();
  for (const c of campaignRows) {
    const list = byBrand.get(c.brandId) ?? [];
    list.push({ id: c.id, name: c.name });
    byBrand.set(c.brandId, list);
  }

  const brandNames = new Map(brandRows.map((b) => [b.id, b.name]));

  return {
    trophies: trophyRows.map((t) => ({
      id: t.id, name: t.name, tier: t.tier, imageUrl: t.imageUrl,
      brandId: t.brandId, brandName: t.brandId ? brandNames.get(t.brandId) ?? null : null,
      value: Number(t.value ?? 0),
    })),
    guilds: guildRows.map((g) => ({
      guildId: g.guildId, name: g.name ?? g.guildId, members: Number(g.members ?? 0),
    })),
    brands: brandRows
      .filter((b) => b.status !== "archived")
      .map((b) => ({ id: b.id, name: b.name, campaigns: byBrand.get(b.id) ?? [] })),
    pricing: {
      challengePrice: cfg?.challengePrice ?? PRICING_DEFAULTS.challengePrice,
      prizePool: cfg?.prizePool ?? PRICING_DEFAULTS.prizePool,
      currency: cfg?.currency ?? "USD",
    },
    // Where a public challenge lands. Counted from the servers that would
    // actually receive the announcement, so the number staff see before
    // launching is the number the delivery ledger will record after.
    reach: {
      servers: guildRows.length,
      members: guildRows.reduce((n, g) => n + Number(g.members ?? 0), 0),
    },
  };
}
