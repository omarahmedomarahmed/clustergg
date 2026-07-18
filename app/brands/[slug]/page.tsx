import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getBrandBySlugOrId, getCampaignReadiness, getCampaignAnalytics, getBrandInbox } from "@/lib/brands";
import BrandCreativeUploader from "@/components/BrandCreativeUploader";
import BrandMessageForm from "@/components/BrandMessageForm";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Brand portal · ${slug}` };
}

export default async function BrandPortalPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ key?: string }> }) {
  const { slug } = await params;
  const { key = "" } = await searchParams;
  const db = await getDb();
  const brand = await getBrandBySlugOrId(db, slug);
  if (!brand) notFound();

  const unlocked = !!brand.accessKey && brand.accessKey === key;
  const cover = brand.coverUrl;

  // Locked: ask for the key + show the creative-requirements teaser.
  if (!unlocked) {
    const placements = await db.select().from(schema.adPlacements).orderBy(schema.adPlacements.key);
    return (
      <div className="min-h-screen">
        <PortalHeader name={brand.name} logo={brand.logoUrl} cover={cover} subtitle="Brand campaign portal" />
        <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
          <div className="glass p-6">
            <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="lock" size={18} className="text-amber-300" /> Enter your access key</h2>
            <p className="text-sm text-muted mt-1">Your Cluster account manager shared a key that unlocks this dashboard. No login needed.</p>
            <form method="get" className="mt-4 flex gap-2">
              <input name="key" defaultValue={key} placeholder="CLSTR-XXXX-XXXX-XXXX" className="input-cosmic flex-1 font-mono" />
              <button className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">Unlock</button>
            </form>
            {key && <p className="mt-2 text-xs text-rose-300">That key didn&apos;t match. Double-check it or reach out to your manager.</p>}
          </div>

          <div className="glass p-6">
            <h3 className="font-bold flex items-center gap-2"><Icon name="grid" size={16} className="text-cyan-300" /> What we&apos;ll need from you</h3>
            <p className="text-sm text-muted mt-1 mb-4">Your campaign runs across every section of every page. Each placement needs one creative (image or a short looping video) at the size below.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {placements.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
                  <div className="min-w-0"><div className="text-sm font-semibold truncate">{p.key}</div><div className="text-[11px] text-muted truncate">{p.pageScope}</div></div>
                  <span className="shrink-0 text-[11px] font-mono text-muted">{p.width}×{p.height}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted">No campaign yet? <a href={`mailto:hello@clustergg.com?subject=${encodeURIComponent(`Campaign for ${brand.name}`)}`} className="text-cyan-300 underline">Message us to get started</a> and we&apos;ll spin one up.</p>
          </div>
        </div>
      </div>
    );
  }

  // Unlocked: campaign readiness + analytics + inbox.
  const [campaign] = await db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.brandId, brand.id)).orderBy(desc(schema.adCampaigns.createdAt)).limit(1);
  const [readiness, analytics, inbox] = await Promise.all([
    campaign ? getCampaignReadiness(db, campaign.id) : Promise.resolve(null),
    campaign ? getCampaignAnalytics(db, campaign.id) : Promise.resolve(null),
    getBrandInbox(db, brand.id),
  ]);

  const refreshHref = `/brands/${brand.slug}?key=${encodeURIComponent(key)}`;
  const num = (n: number) => n.toLocaleString();

  return (
    <div className="min-h-screen">
      <PortalHeader name={brand.name} logo={brand.logoUrl} cover={cover} subtitle={campaign ? campaign.name : "No live campaign yet"} />
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        {brand.about && <div className="glass p-5 text-sm text-muted">{brand.about}</div>}

        {!campaign ? (
          <div className="glass p-6">
            <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="rocket" size={18} className="text-cyan-300" /> Your campaign isn&apos;t set up yet</h2>
            <p className="text-sm text-muted mt-1">Message us below and we&apos;ll create your campaign — then you can upload creatives for every placement right here.</p>
          </div>
        ) : (
          <>
            {/* Status + analytics summary */}
            <div className="grid sm:grid-cols-4 gap-3">
              <Stat label="Status" value={campaign.status === "active" ? "Live" : campaign.status} accent={campaign.status === "active" ? "#34d399" : "#fbbf24"} />
              <Stat label="Impressions (30d)" value={num(analytics?.impressions ?? 0)} />
              <Stat label="Clicks (30d)" value={num(analytics?.clicks ?? 0)} />
              <Stat label="CTR" value={`${((analytics?.ctr ?? 0) * 100).toFixed(2)}%`} />
            </div>

            {/* Creative slots */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="grid" size={18} className="text-violet-300" /> Creatives by placement</h2>
                {readiness && <span className={`text-xs font-semibold ${readiness.ready ? "text-emerald-300" : "text-amber-300"}`}>{readiness.filled}/{readiness.total} ready{readiness.ready ? " — campaign can go live" : ""}</span>}
              </div>
              <p className="text-xs text-muted mb-4">Your campaign shows in every placement. Each shows for ~5 seconds every minute alongside other brands. Upload one creative per placement below.</p>
              <div className="grid md:grid-cols-2 gap-3">
                {readiness?.slots.map((s) => (
                  <BrandCreativeUploader key={s.placementId} brandId={brand.id} keyStr={key}
                    slot={{ placementId: s.placementId, key: s.key, pageScope: s.pageScope, width: s.width, height: s.height, creativeType: s.creativeType, fileUrl: s.fileUrl, clickUrl: s.clickUrl }} />
                ))}
              </div>
            </section>

            {/* Per-placement analytics */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="chart" size={18} className="text-cyan-300" /> Placement analytics</h2>
                <a href={refreshHref} className="ghost-btn pressable rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"><Icon name="satellite" size={13} /> Refresh</a>
              </div>
              <div className="glass overflow-x-auto">
                <table className="w-full table-cosmic min-w-[520px]">
                  <thead><tr><th>Placement</th><th>Page</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead>
                  <tbody>
                    {(analytics?.byPlacement ?? []).length === 0 && <tr><td colSpan={5} className="text-muted text-sm p-4">No impressions yet — they appear once your campaign is live.</td></tr>}
                    {analytics?.byPlacement.map((r) => (
                      <tr key={r.key}>
                        <td className="font-semibold text-sm">{r.key}</td>
                        <td className="text-xs text-muted">{r.pageScope}</td>
                        <td className="text-cyan-200 font-bold">{num(r.impressions)}</td>
                        <td>{num(r.clicks)}</td>
                        <td className="text-xs">{r.impressions ? ((r.clicks / r.impressions) * 100).toFixed(1) : "0.0"}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(analytics?.byPage.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {analytics!.byPage.slice(0, 12).map((p) => (
                    <a key={p.path} href={p.path} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 text-[11px] hover:border-cyan-400/40">
                      <Icon name="link" size={11} className="text-muted" /> {p.path} · {num(p.impressions)}
                    </a>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* Shared inbox */}
        <section className="glass p-5">
          <h2 className="font-bold flex items-center gap-2 mb-3"><Icon name="message" size={16} className="text-cyan-300" /> Message your Cluster team</h2>
          <div className="mb-4"><BrandMessageForm brandId={brand.id} keyStr={key} /></div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {inbox.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
            {inbox.map((m) => (
              <div key={m.id} className={`rounded-xl border p-3 text-sm ${m.sender === "admin" ? "border-cyan-400/25 bg-cyan-500/[0.05]" : "border-white/10 bg-white/[0.02]"}`}>
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1">{m.sender === "admin" ? "Cluster team" : brand.name} · {new Date(m.createdAt).toLocaleString()}</div>
                {m.body}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PortalHeader({ name, logo, cover, subtitle }: { name: string; logo: string | null; cover: string | null; subtitle: string }) {
  return (
    <div className="relative h-40 md:h-48 overflow-hidden border-b border-white/10">
      {cover ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 140% at 15% 0%, #8b5cf655, transparent 60%), radial-gradient(120% 140% at 100% 100%, #22d3ee44, transparent 60%), #0a0a1c" }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#04051a] via-[#04051a]/50 to-transparent" />
      <div className="absolute bottom-4 left-0 right-0 mx-auto max-w-5xl px-4 flex items-center gap-4">
        {logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="" className="h-14 w-14 rounded-xl object-cover ring-2 ring-white/15 bg-black/40" />}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{name}</h1>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="glass p-4 text-center">
      <div className="text-2xl font-bold" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{label}</div>
    </div>
  );
}
