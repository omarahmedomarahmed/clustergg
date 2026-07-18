import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { savePlacement } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Placements" };

export default async function AdminPlacementsPage() {
  const db = await getDb();
  const placements = await db.select().from(schema.adPlacements);

  // Which creatives (brand + campaign) are assigned to each placement.
  const assignments = await db.select({
    placementId: schema.adCampaignCreatives.placementId,
    campaignId: schema.adCampaignCreatives.campaignId,
    creativeName: schema.adCreatives.name,
    creativeType: schema.adCreatives.type,
    brandName: schema.brands.name,
    campaignName: schema.adCampaigns.name,
    campaignStatus: schema.adCampaigns.status,
  }).from(schema.adCampaignCreatives)
    .innerJoin(schema.adCreatives, eq(schema.adCampaignCreatives.creativeId, schema.adCreatives.id))
    .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
    .innerJoin(schema.brands, eq(schema.adCampaigns.brandId, schema.brands.id));
  const byPlacement = new Map<string, typeof assignments>();
  for (const a of assignments) { const arr = byPlacement.get(a.placementId) ?? []; arr.push(a); byPlacement.set(a.placementId, arr); }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Ad placements</h1>
      <p className="text-sm text-muted mb-6">
        Every inventory slot. Edit sizes, rotation cadence and caps — the placement loops
        all its assigned creatives on this interval. The serving layer picks changes up
        immediately.
      </p>
      <div className="space-y-4">
        {placements.map((p) => {
        const assigned = byPlacement.get(p.id) ?? [];
        return (
        <div key={p.id} className="space-y-2">
          <form action={savePlacement} className="glass p-5 grid sm:grid-cols-3 md:grid-cols-6 gap-3 items-end">
            <input type="hidden" name="placementId" value={p.id} />
            <div className="sm:col-span-3 md:col-span-2">
              <div className="font-mono text-xs text-cyan-300">{p.key}</div>
              <input name="pageScope" defaultValue={p.pageScope} className="input-cosmic mt-1 text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted">Device</label>
              <select name="device" defaultValue={p.device} className="input-cosmic mt-1 text-sm">
                <option value="both">both</option>
                <option value="desktop">desktop</option>
                <option value="mobile">mobile</option>
              </select>
            </div>
            <div className="flex gap-2">
              <div>
                <label className="text-[10px] uppercase text-muted">W</label>
                <input name="width" type="number" defaultValue={p.width} className="input-cosmic mt-1 text-sm" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted">H</label>
                <input name="height" type="number" defaultValue={p.height} className="input-cosmic mt-1 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <div>
                <label className="text-[10px] uppercase text-muted">Max rot.</label>
                <input name="maxCreativesInRotation" type="number" defaultValue={p.maxCreativesInRotation} className="input-cosmic mt-1 text-sm" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted">Interval s</label>
                <input name="rotationIntervalSeconds" type="number" defaultValue={p.rotationIntervalSeconds} className="input-cosmic mt-1 text-sm" />
              </div>
            </div>
            <button className="ghost-btn rounded-full px-4 py-2 text-xs h-fit">Save</button>
          </form>
          {assigned.length > 0 && (
            <div className="glass p-3 -mt-1">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Assigned creatives ({assigned.length}) — looped every {p.rotationIntervalSeconds}s</div>
              <div className="flex flex-wrap gap-1.5">
                {assigned.map((a, i) => (
                  <Link key={i} href={`/admin/ads/campaign/${a.campaignId}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 text-[11px] hover:border-cyan-400/40">
                    <span className={a.campaignStatus === "active" ? "text-emerald-300" : "text-amber-300"}>●</span> {a.brandName} · {a.campaignName} <span className="text-muted">({a.creativeType})</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        );})}
      </div>
    </div>
  );
}
