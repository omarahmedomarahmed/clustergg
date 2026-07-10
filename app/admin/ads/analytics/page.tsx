import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fmtNum } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Ad analytics" };

export default async function AdminAdAnalyticsPage({
  searchParams,
}: { searchParams: Promise<{ days?: string; device?: string }> }) {
  const { days: daysRaw, device } = await searchParams;
  const days = Math.max(1, Math.min(365, Number(daysRaw) || 30));
  const since = new Date(Date.now() - days * 86400000);
  const db = await getDb();

  const deviceFilter = device === "desktop" || device === "mobile"
    ? [eq(schema.adImpressions.deviceType, device)] : [];

  const [perCreative, [totals], geo] = await Promise.all([
    db.select({
      creativeName: schema.adCreatives.name,
      brandName: schema.brands.name,
      placementKey: schema.adPlacements.key,
      impressions: count(schema.adImpressions.id),
      avgViewMs: sql<number>`COALESCE(AVG(${schema.adImpressions.durationViewedMs}), 0)`,
      uniques: sql<number>`COUNT(DISTINCT ${schema.adImpressions.hashedIp})`,
      clicks: sql<number>`(SELECT COUNT(*) FROM ad_clicks WHERE ad_clicks.campaign_creative_id = ${schema.adCampaignCreatives.id} AND ad_clicks.created_at >= ${since})`,
    })
      .from(schema.adImpressions)
      .innerJoin(schema.adCampaignCreatives, eq(schema.adImpressions.campaignCreativeId, schema.adCampaignCreatives.id))
      .innerJoin(schema.adCreatives, eq(schema.adCampaignCreatives.creativeId, schema.adCreatives.id))
      .innerJoin(schema.adPlacements, eq(schema.adCampaignCreatives.placementId, schema.adPlacements.id))
      .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
      .innerJoin(schema.brands, eq(schema.adCampaigns.brandId, schema.brands.id))
      .where(and(gte(schema.adImpressions.createdAt, since), ...deviceFilter))
      .groupBy(schema.adCampaignCreatives.id, schema.adCreatives.name, schema.brands.name, schema.adPlacements.key),
    db.select({
      impressions: count(),
      uniques: sql<number>`COUNT(DISTINCT ${schema.adImpressions.hashedIp})`,
    }).from(schema.adImpressions).where(and(gte(schema.adImpressions.createdAt, since), ...deviceFilter)),
    db.select({
      country: schema.adImpressions.geoCountry,
      impressions: count(),
    })
      .from(schema.adImpressions)
      .where(and(gte(schema.adImpressions.createdAt, since), ...deviceFilter))
      .groupBy(schema.adImpressions.geoCountry)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10),
  ]);

  const totalClicks = perCreative.reduce((a, r) => a + Number(r.clicks), 0);
  const totalImpr = Number(totals?.impressions ?? 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Ad analytics</h1>

      <form className="flex flex-wrap gap-3 mb-6">
        <select name="days" defaultValue={String(days)} className="input-cosmic !w-40">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <select name="device" defaultValue={device ?? ""} className="input-cosmic !w-40">
          <option value="">All devices</option>
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
        </select>
        <button className="ghost-btn rounded-full px-5 text-sm">Apply</button>
      </form>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Impressions", value: totalImpr },
          { label: "Clicks", value: totalClicks },
          { label: "CTR", value: totalImpr ? `${((totalClicks / totalImpr) * 100).toFixed(2)}%` : "—" },
          { label: "Unique reach", value: Number(totals?.uniques ?? 0) },
        ].map((t) => (
          <div key={t.label} className="glass p-5">
            <div className="text-2xl font-bold grad-text">{typeof t.value === "number" ? fmtNum(t.value) : t.value}</div>
            <div className="text-xs uppercase tracking-widest text-muted mt-1">{t.label}</div>
          </div>
        ))}
      </div>

      <h2 className="font-bold mb-3">Per creative</h2>
      <div className="glass overflow-x-auto mb-8">
        <table className="w-full table-cosmic min-w-[720px]">
          <thead><tr><th>Creative</th><th>Brand</th><th>Placement</th><th>Impr.</th><th>Clicks</th><th>CTR</th><th>Avg view</th><th>Uniques</th></tr></thead>
          <tbody>
            {perCreative.map((r, i) => {
              const impr = Number(r.impressions), clicks = Number(r.clicks);
              return (
                <tr key={i}>
                  <td className="text-sm font-semibold">{r.creativeName}</td>
                  <td className="text-sm text-muted">{r.brandName}</td>
                  <td className="font-mono text-xs text-cyan-300">{r.placementKey}</td>
                  <td className="text-sm">{fmtNum(impr)}</td>
                  <td className="text-sm">{fmtNum(clicks)}</td>
                  <td className="text-sm">{impr ? `${((clicks / impr) * 100).toFixed(2)}%` : "—"}</td>
                  <td className="text-sm">{(Number(r.avgViewMs) / 1000).toFixed(1)}s</td>
                  <td className="text-sm">{fmtNum(Number(r.uniques))}</td>
                </tr>
              );
            })}
            {perCreative.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted text-sm py-6">No impressions in this window yet — browse the public site to generate some.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="font-bold mb-3">Top geographies</h2>
      <div className="glass p-5 flex flex-wrap gap-3">
        {geo.map((g, i) => (
          <span key={i} className="rounded-full border border-violet-400/20 px-3 py-1.5 text-sm">
            {g.country ?? "Unknown"} · {fmtNum(Number(g.impressions))}
          </span>
        ))}
        {geo.length === 0 && <span className="text-sm text-muted">No geo data yet.</span>}
      </div>
    </div>
  );
}
