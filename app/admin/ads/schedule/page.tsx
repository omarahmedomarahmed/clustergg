import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { assignCreative, removeAssignment } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Ad schedule" };

export default async function AdminAdSchedulePage() {
  const db = await getDb();
  const [assignments, campaigns, creatives, placements] = await Promise.all([
    db.select({
      cc: schema.adCampaignCreatives,
      campaign: schema.adCampaigns,
      creative: schema.adCreatives,
      placement: schema.adPlacements,
      brand: schema.brands,
    })
      .from(schema.adCampaignCreatives)
      .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
      .innerJoin(schema.adCreatives, eq(schema.adCampaignCreatives.creativeId, schema.adCreatives.id))
      .innerJoin(schema.adPlacements, eq(schema.adCampaignCreatives.placementId, schema.adPlacements.id))
      .innerJoin(schema.brands, eq(schema.adCampaigns.brandId, schema.brands.id)),
    db.select().from(schema.adCampaigns),
    db.select().from(schema.adCreatives).where(eq(schema.adCreatives.status, "approved")),
    db.select().from(schema.adPlacements),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Ad schedule</h1>

      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-4">Assign creative → placement → campaign</h2>
        <form action={assignCreative} className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          <select name="campaignId" required className="input-cosmic">
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="creativeId" required className="input-cosmic">
            {creatives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="placementId" required className="input-cosmic">
            {placements.map((p) => <option key={p.id} value={p.id}>{p.key} ({p.width}×{p.height})</option>)}
          </select>
          <input name="weight" type="number" defaultValue={1} placeholder="Weight" className="input-cosmic" />
          <input name="priority" type="number" defaultValue={0} placeholder="Priority" className="input-cosmic" />
          <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Assign</button>
        </form>
      </div>

      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic min-w-[720px]">
          <thead><tr><th>Placement</th><th>Creative</th><th>Campaign</th><th>Window</th><th>Weight/Prio</th><th></th></tr></thead>
          <tbody>
            {assignments.map(({ cc, campaign, creative, placement, brand }) => (
              <tr key={cc.id}>
                <td className="font-mono text-xs text-cyan-300">{placement.key}</td>
                <td className="text-sm">{creative.name} <span className="text-xs text-muted">({brand.name})</span></td>
                <td className="text-sm text-muted">{campaign.name}</td>
                <td className="text-xs text-muted">{campaign.startDate.toLocaleDateString()} → {campaign.endDate.toLocaleDateString()}</td>
                <td className="text-sm">{cc.weight} / {cc.priority}</td>
                <td>
                  <form action={removeAssignment.bind(null, cc.id)}>
                    <button className="text-xs text-rose-300 hover:underline">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
