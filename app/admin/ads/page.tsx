import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getAdsMasterTotals, getCampaignReadiness } from "@/lib/brands";
import AdminBrandKey from "@/components/AdminBrandKey";
import AdminCampaignActions from "@/components/AdminCampaignActions";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Ads master" };

export default async function AdminAdsMasterPage() {
  const db = await getDb();
  const totals = await getAdsMasterTotals(db, 30);
  const brands = await db.select().from(schema.brands).orderBy(desc(schema.brands.createdAt));
  const campaigns = await db.select().from(schema.adCampaigns).orderBy(desc(schema.adCampaigns.createdAt));

  // Readiness per campaign (which placements have a creative).
  const readiness = new Map(await Promise.all(campaigns.map(async (c) => [c.id, await getCampaignReadiness(db, c.id)] as const)));

  // Unread brand-inbox counts (messages from brands not yet read by admin).
  const brandIds = brands.map((b) => b.id);
  const unreadRows = brandIds.length
    ? await db.select({ brandId: schema.brandMessages.brandId, c: sql<number>`count(*)` }).from(schema.brandMessages)
        .where(inArray(schema.brandMessages.brandId, brandIds))
        .groupBy(schema.brandMessages.brandId)
    : [];
  const msgCount = new Map(unreadRows.map((r) => [r.brandId, Number(r.c)]));
  const campaignsByBrand = new Map<string, typeof campaigns>();
  for (const c of campaigns) { const arr = campaignsByBrand.get(c.brandId) ?? []; arr.push(c); campaignsByBrand.set(c.brandId, arr); }

  const num = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Ads — Master Dashboard</h1>
        <p className="text-sm text-muted mt-1">Every brand, campaign, placement and creative — plus the analytics that pay the bills.</p>
      </div>

      {/* Platform totals */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Impressions (30d)" value={num(totals.impressions)} />
        <Stat label="Clicks (30d)" value={num(totals.clicks)} />
        <Stat label="CTR" value={`${(totals.ctr * 100).toFixed(2)}%`} />
        <Stat label="Brands" value={num(totals.brands)} />
        <Stat label="Live campaigns" value={num(totals.liveCampaigns)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/brands" className="ghost-btn pressable rounded-full px-4 py-2 text-sm inline-flex items-center gap-1.5"><Icon name="plus" size={14} /> Brands</Link>
        <Link href="/admin/ads/schedule" className="ghost-btn pressable rounded-full px-4 py-2 text-sm inline-flex items-center gap-1.5"><Icon name="grid" size={14} /> Assign creatives</Link>
        <Link href="/admin/ads/analytics" className="ghost-btn pressable rounded-full px-4 py-2 text-sm inline-flex items-center gap-1.5"><Icon name="chart" size={14} /> Deep analytics</Link>
        <Link href="/admin/placements" className="ghost-btn pressable rounded-full px-4 py-2 text-sm inline-flex items-center gap-1.5"><Icon name="monitor" size={14} /> Placements</Link>
      </div>

      {/* Brands */}
      <div className="space-y-4">
        {brands.length === 0 && <div className="glass p-8 text-center text-muted">No brands yet. <Link href="/admin/brands" className="text-cyan-300 underline">Create one</Link>.</div>}
        {brands.map((b) => {
          const bcs = campaignsByBrand.get(b.id) ?? [];
          const unread = msgCount.get(b.id) ?? 0;
          return (
            <div key={b.id} className="glass p-5">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {b.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/15" />}
                <div className="min-w-0">
                  <div className="font-bold flex items-center gap-2">{b.name}
                    <span className={`text-[10px] ${b.status === "active" ? "text-emerald-300" : "text-amber-300"}`}>● {b.status}</span>
                    {unread > 0 && <Link href={`/admin/brands/${b.id}`} className="text-[10px] rounded-full bg-fuchsia-500/20 border border-fuchsia-400/40 px-2 py-0.5 text-fuchsia-200">{unread} msg</Link>}
                  </div>
                  <div className="text-xs text-muted">{b.industry}</div>
                </div>
                <Link href={`/admin/brands/${b.id}`} className="ml-auto text-xs text-cyan-300 hover:underline">Manage →</Link>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <AdminBrandKey brandId={b.id} slug={b.slug} initialKey={b.accessKey} />
                <div className="space-y-2">
                  {bcs.length === 0 && <div className="text-xs text-muted rounded-xl border border-white/10 p-3">No campaigns yet.</div>}
                  {bcs.map((c) => {
                    const rd = readiness.get(c.id);
                    return (
                      <div key={c.id} className="rounded-xl border border-white/10 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <Link href={`/admin/ads/campaign/${c.id}`} className="text-sm font-semibold truncate hover:text-cyan-300">{c.name}</Link>
                            <div className="text-[11px] text-muted">{rd ? `${rd.filled}/${rd.total} placements ready` : "—"} · <Link href={`/admin/ads/campaign/${c.id}`} className="text-cyan-300 hover:underline">manage</Link></div>
                          </div>
                          <AdminCampaignActions campaignId={c.id} status={c.status} ready={rd?.ready ?? false} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
