// Reading the campaign switches, and what they have cost (B44).
//
// Split from `lib/campaigns.ts` because that file is imported by
// `lib/invoices.ts`, which is imported by two CLIENT components — and anything
// reaching `lib/cms` from there fails the build. The rule this encodes: the
// model is pure and importable from anywhere; the reads live here and only
// server code touches them.

import { getContent } from "@/lib/cms";
import {
  CAMPAIGN_CMS_KEYS, buildCampaigns, type CampaignConfig,
} from "@/lib/campaigns";

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function campaigns(
  fallbacks: { serverValue: number; serverCap: number; brandCap: number },
): Promise<CampaignConfig> {
  try {
    const c = await getContent(CAMPAIGN_CMS_KEYS);
    return buildCampaigns(c, fallbacks);
  } catch {
    // A campaign that cannot be read is a campaign that is OFF. Failing the
    // other way would spend money because a query timed out.
    return buildCampaigns({}, fallbacks);
  }
}


// ===== What the campaigns have cost, and what they produced =====
//
// One table, brands and servers together, because "what did the founding offers
// cost us and what did they return" is ONE question. Split across two screens it
// is a question nobody answers.

export type CampaignRecipient = {
  kind: "brand" | "server";
  id: string;
  name: string;
  /** When they received it. */
  at: string | null;
  /** What it cost us. For a brand, the discount lines actually issued. */
  cost: number;
  /** What it produced — invoiced revenue for a brand, linked gamers for a server. */
  producedLabel: string;
  produced: number;
  href: string | null;
};

export type CampaignAnalytics = {
  recipients: CampaignRecipient[];
  brandCost: number;
  serverCost: number;
  totalCost: number;
  /** Gross billed to brands that took the offer, discount lines excluded. */
  brandRevenue: number;
};

export async function campaignAnalytics(cfg: CampaignConfig): Promise<CampaignAnalytics> {
  const empty: CampaignAnalytics = {
    recipients: [], brandCost: 0, serverCost: 0, totalCost: 0, brandRevenue: 0,
  };
  try {
    const { getDb, schema } = await import("@/lib/db");
    const { eq, isNotNull, inArray } = await import("drizzle-orm");
    const db = await getDb();

    const [brands, guilds] = await Promise.all([
      db.select({
        id: schema.brands.id, name: schema.brands.name, slug: schema.brands.slug,
        at: schema.brands.founderCreditAt,
      }).from(schema.brands).where(isNotNull(schema.brands.founderCreditAt)),
      db.select({
        id: schema.discordGuilds.guildId, name: schema.discordGuilds.name,
        at: schema.discordGuilds.welcomeChallengeAt,
      }).from(schema.discordGuilds).where(isNotNull(schema.discordGuilds.welcomeChallengeAt)),
    ]);

    // The cost is read from the DISCOUNT LINES ACTUALLY ISSUED, not from the
    // configured percentage — the percentage is what we intend to spend, the
    // lines are what we spent. They differ the moment somebody edits a bill,
    // which the item explicitly allows.
    const brandIds = brands.map((b) => b.id);
    const byBrand = new Map<string, { cost: number; revenue: number }>();
    if (brandIds.length) {
      const rows = await db.select({
        brandId: schema.brandInvoices.brandId,
        kind: schema.invoiceLines.kind,
        label: schema.invoiceLines.label,
        quantity: schema.invoiceLines.quantity,
        unitAmount: schema.invoiceLines.unitAmount,
      }).from(schema.invoiceLines)
        .innerJoin(schema.brandInvoices, eq(schema.brandInvoices.id, schema.invoiceLines.invoiceId))
        .where(inArray(schema.brandInvoices.brandId, brandIds));
      for (const r of rows) {
        const cur = byBrand.get(r.brandId) ?? { cost: 0, revenue: 0 };
        const amt = Number(r.quantity) * Number(r.unitAmount);
        if (r.kind === "discount" && /founding brand offer/i.test(r.label)) cur.cost += Math.abs(amt);
        else if (r.kind !== "discount") cur.revenue += amt;
        byBrand.set(r.brandId, cur);
      }
    }

    const linked = new Map<string, number>();
    try {
      const rows = await db.select({
        guildId: schema.discordGuildMembers.guildId,
        firstLinkedAt: schema.discordGuildMembers.firstLinkedAt,
      }).from(schema.discordGuildMembers);
      for (const r of rows) {
        if (!r.firstLinkedAt) continue;
        linked.set(r.guildId, (linked.get(r.guildId) ?? 0) + 1);
      }
    } catch { /* the count is context, not the answer */ }

    const recipients: CampaignRecipient[] = [
      ...brands.map((b): CampaignRecipient => ({
        kind: "brand", id: b.id, name: b.name,
        at: b.at?.toISOString() ?? null,
        cost: round2(byBrand.get(b.id)?.cost ?? 0),
        producedLabel: "invoiced",
        produced: round2(byBrand.get(b.id)?.revenue ?? 0),
        href: b.slug ? `/admin/brands` : null,
      })),
      ...guilds.map((g): CampaignRecipient => ({
        kind: "server", id: g.id, name: g.name || g.id,
        at: g.at?.toISOString() ?? null,
        cost: cfg.server.value,
        producedLabel: "gamers linked",
        produced: linked.get(g.id) ?? 0,
        href: "/admin/discord",
      })),
    ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

    const brandCost = round2(recipients.filter((r) => r.kind === "brand").reduce((s, r) => s + r.cost, 0));
    const serverCost = round2(recipients.filter((r) => r.kind === "server").reduce((s, r) => s + r.cost, 0));
    return {
      recipients,
      brandCost,
      serverCost,
      totalCost: round2(brandCost + serverCost),
      brandRevenue: round2(recipients.filter((r) => r.kind === "brand").reduce((s, r) => s + r.produced, 0)),
    };
  } catch { return empty; }
}
