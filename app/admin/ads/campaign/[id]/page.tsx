import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCampaignReadiness, getCampaignAnalytics } from "@/lib/brands";
import { saveCampaign } from "@/app/actions/admin";
import AdminCreativeSlot from "@/components/AdminCreativeSlot";
import AdminCampaignActions from "@/components/AdminCampaignActions";
import ImageUpload from "@/components/ImageUpload";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

// Best-effort representative page for a placement key, so the analytics rows
// link to a page where the ad actually shows.
function pageForPlacement(key: string): string {
  if (key.startsWith("feed")) return "/feed";
  if (key.startsWith("planet") || key.startsWith("games")) return "/planets";
  if (key.startsWith("leaderboard")) return "/leaderboards";
  if (key.startsWith("landing") || key === "top_banner") return "/";
  return "/";
}

export default async function AdminCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [campaign] = await db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, id)).limit(1);
  if (!campaign) notFound();
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, campaign.brandId)).limit(1);
  const [readiness, analytics] = await Promise.all([
    getCampaignReadiness(db, id),
    getCampaignAnalytics(db, id, 30),
  ]);
  const num = (n: number) => n.toLocaleString();
  const byPageForPlacement = new Map(analytics.byPage.map((p) => [p.path, p.impressions]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass relative overflow-hidden">
        <div className="h-24 md:h-28 relative">
          {campaign.coverUrl || brand?.coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={campaign.coverUrl || brand?.coverUrl || ""} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : <div className="absolute inset-0" style={{ background: "radial-gradient(120% 140% at 10% 0%, #8b5cf655, transparent 60%), #0a0a1c" }} />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a1c] to-transparent" />
        </div>
        <div className="p-5 -mt-8 relative flex flex-wrap items-center gap-3">
          {(campaign.logoUrl || brand?.logoUrl) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={campaign.logoUrl || brand?.logoUrl || ""} alt="" className="h-12 w-12 rounded-xl object-cover ring-2 ring-white/15 bg-black/40" />}
          <div className="min-w-0">
            <div className="text-xs text-muted"><Link href={`/admin/brands/${campaign.brandId}`} className="hover:underline">{brand?.name}</Link> · campaign</div>
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`text-xs font-semibold ${campaign.status === "active" ? "text-emerald-300" : "text-amber-300"}`}>● {campaign.status}</span>
            <AdminCampaignActions campaignId={campaign.id} status={campaign.status} ready={readiness.ready} />
          </div>
        </div>
      </div>

      {/* Campaign branding — cover + logo uploads (default to the brand's) */}
      <details className="glass p-5 group">
        <summary className="cursor-pointer font-bold list-none flex items-center gap-2"><Icon name="edit" size={15} className="text-cyan-300" /> Campaign branding &amp; settings<span className="ml-auto text-xs text-muted group-open:hidden">Edit</span></summary>
        <form action={saveCampaign.bind(null, campaign.brandId)} className="mt-4 border-t border-white/10 pt-4 grid sm:grid-cols-2 gap-3">
          <input type="hidden" name="campaignId" value={campaign.id} />
          <input name="name" required defaultValue={campaign.name} placeholder="Campaign name" className="input-cosmic" />
          <select name="status" defaultValue={campaign.status} className="input-cosmic">
            <option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option>
          </select>
          <input type="hidden" name="startDate" value={campaign.startDate.toISOString()} />
          <input type="hidden" name="endDate" value={campaign.endDate.toISOString()} />
          <input type="hidden" name="targetDevice" value={campaign.targetDevice} />
          <div><div className="text-xs text-muted mb-1">Campaign logo (default: brand logo)</div><ImageUpload name="logoUrl" defaultValue={campaign.logoUrl ?? ""} aspect="1/1" rounded="rounded-xl" maxDim={400} scope="creative" hint="Square logo." /></div>
          <div><div className="text-xs text-muted mb-1">Campaign cover (default: brand cover)</div><ImageUpload name="coverUrl" defaultValue={campaign.coverUrl ?? ""} aspect="16/9" maxDim={1400} scope="creative" hint="Wide cover for this campaign." /></div>
          <div className="sm:col-span-2"><button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Save campaign</button></div>
        </form>
      </details>

      {/* Analytics at the top — placement rows link to a page where the ad shows */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="chart" size={18} className="text-cyan-300" /> Analytics (30 days)</h2>
          <Link href={`/admin/ads/campaign/${id}`} className="ghost-btn pressable rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"><Icon name="satellite" size={13} /> Refresh</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <Stat label="Impressions" value={num(analytics.impressions)} />
          <Stat label="Clicks" value={num(analytics.clicks)} />
          <Stat label="CTR" value={`${(analytics.ctr * 100).toFixed(2)}%`} />
          <Stat label="Placements live" value={`${readiness.filled}/${readiness.total}`} />
        </div>
        <div className="glass overflow-x-auto">
          <table className="w-full table-cosmic min-w-[560px]">
            <thead><tr><th>Placement</th><th>Page</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead>
            <tbody>
              {analytics.byPlacement.length === 0 && <tr><td colSpan={5} className="text-sm text-muted p-4">No impressions yet.</td></tr>}
              {analytics.byPlacement.map((r) => {
                const path = pageForPlacement(r.key);
                return (
                  <tr key={r.key} className="hover:bg-white/5">
                    <td><Link href={path} target="_blank" className="font-semibold text-sm text-cyan-300 hover:underline inline-flex items-center gap-1.5"><Icon name="link" size={12} /> {r.key}</Link></td>
                    <td className="text-xs text-muted">{r.pageScope}</td>
                    <td className="text-cyan-200 font-bold">{num(r.impressions)}{byPageForPlacement.size ? "" : ""}</td>
                    <td>{num(r.clicks)}</td>
                    <td className="text-xs">{r.impressions ? ((r.clicks / r.impressions) * 100).toFixed(1) : "0.0"}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Creatives by placement — collapsed slots */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="grid" size={18} className="text-violet-300" /> Creatives by placement</h2>
          <span className={`text-xs font-semibold ${readiness.ready ? "text-emerald-300" : "text-amber-300"}`}>{readiness.filled}/{readiness.total} ready</span>
        </div>
        {!readiness.ready && campaign.status !== "active" && (
          <p className="text-sm text-amber-200/90 mb-3">Upload a creative for every placement below — each turns green when done. Once all are ready, use <b>Launch</b> above to publish.</p>
        )}
        <div className="grid md:grid-cols-2 gap-2.5">
          {readiness.slots.map((s) => (
            <AdminCreativeSlot key={s.placementId} campaignId={id}
              slot={{ placementId: s.placementId, key: s.key, pageScope: s.pageScope, width: s.width, height: s.height, creativeType: s.creativeType, fileUrl: s.fileUrl, clickUrl: s.clickUrl }} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass p-4 text-center">
      <div className="text-2xl font-bold text-cyan-200">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{label}</div>
    </div>
  );
}
