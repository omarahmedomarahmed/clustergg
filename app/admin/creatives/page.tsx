import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveCreative } from "@/app/actions/admin";
import ImageUpload from "@/components/ImageUpload";
import CreativesManager from "@/components/CreativesManager";
import BulkCreativeUpload from "@/components/BulkCreativeUpload";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Creatives" };

export default async function AdminCreativesPage() {
  const db = await getDb();
  const [rows, brands, campaigns, placements, assignRows] = await Promise.all([
    db.select({ c: schema.adCreatives, b: schema.brands })
      .from(schema.adCreatives)
      .innerJoin(schema.brands, eq(schema.adCreatives.brandId, schema.brands.id))
      .orderBy(desc(schema.adCreatives.createdAt)),
    db.select().from(schema.brands).orderBy(schema.brands.name),
    db.select().from(schema.adCampaigns),
    db.select().from(schema.adPlacements),
    db.select({
      id: schema.adCampaignCreatives.id,
      creativeId: schema.adCampaignCreatives.creativeId,
      placementId: schema.adCampaignCreatives.placementId,
      campaignId: schema.adCampaignCreatives.campaignId,
      placementKey: schema.adPlacements.key,
      campaignName: schema.adCampaigns.name,
      campaignStatus: schema.adCampaigns.status,
    }).from(schema.adCampaignCreatives)
      .innerJoin(schema.adPlacements, eq(schema.adCampaignCreatives.placementId, schema.adPlacements.id))
      .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id)),
  ]);

  const creatives = rows.map(({ c, b }) => ({
    id: c.id, name: c.name, type: c.type, status: c.status, fileUrl: c.fileUrl,
    width: c.width, height: c.height, durationSeconds: c.durationSeconds,
    brandId: c.brandId, brandName: b.name,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Ad creatives</h1>
      <p className="text-sm text-muted mb-6">Filter by brand, expand a creative to review it, and link it to any placement — the placement loops every creative linked to it.</p>

      <BulkCreativeUpload brands={brands.map((b) => ({ id: b.id, name: b.name }))} />

      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-1">Upload a single creative (with framing)</h2>
        <p className="text-xs text-muted mb-4">
          Upload the image straight from your device. For video, use &quot;paste a link&quot; — video creatives are rejected above 5 seconds (hard cap).
        </p>
        <form action={saveCreative} className="grid sm:grid-cols-2 gap-3">
          <select name="brandId" required className="input-cosmic">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input name="name" required placeholder="Creative name (e.g. GPU hero 970x250)" className="input-cosmic" />
          <select name="type" className="input-cosmic">
            <option value="image">Image</option>
            <option value="video">Video (max 5s)</option>
          </select>
          <input name="durationSeconds" type="number" max={5} placeholder="Duration s (video only)" className="input-cosmic" />
          <div className="sm:col-span-2">
            <ImageUpload name="fileUrl" label="Creative file" aspect="16/9" maxDim={1600} scope="creative" hint="Image is optimized on upload. Video: use “paste a link”." />
          </div>
          <input name="clickUrl" placeholder="Click-through URL" className="input-cosmic sm:col-span-2" />
          <div className="flex gap-2">
            <input name="width" type="number" placeholder="W px" className="input-cosmic" />
            <input name="height" type="number" placeholder="H px" className="input-cosmic" />
          </div>
          <div className="sm:col-span-2">
            <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Submit for review</button>
          </div>
        </form>
      </div>

      <CreativesManager
        creatives={creatives}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, brandId: c.brandId, status: c.status }))}
        placements={placements.map((p) => ({ id: p.id, key: p.key, width: p.width, height: p.height }))}
        assignments={assignRows}
      />
    </div>
  );
}
