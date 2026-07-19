import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getBrandBySlugOrId, getBrandPortalData, getBrandAnalytics, getCampaignReadiness, getBrandInbox } from "@/lib/brands";
import BrandMessageForm from "@/components/BrandMessageForm";
import BrandAnalyticsPanel from "@/components/BrandAnalyticsPanel";
import BrandAppearanceEditor from "@/components/BrandAppearanceEditor";
import BrandCreativesTab from "@/components/BrandCreativesTab";
import Tabs from "@/components/Tabs";
import AnimatedNumber from "@/components/AnimatedNumber";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Brand portal · ${slug}` };
}

export default async function BrandPortalPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ key?: string; campaign?: string; filter?: string }> }) {
  const { slug } = await params;
  const { key = "", campaign: campaignId = "", filter = "all" } = await searchParams;
  const db = await getDb();
  const brand = await getBrandBySlugOrId(db, slug);
  if (!brand) notFound();

  const unlocked = !!brand.accessKey && brand.accessKey === key;
  const cover = brand.coverUrl;
  const base = `/brands/${brand.slug}?key=${encodeURIComponent(key)}`;
  const num = (n: number) => n.toLocaleString();

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

  const inbox = await getBrandInbox(db, brand.id);

  // ---- Per-campaign drill-down view ----
  if (campaignId) {
    const [campaign] = await db.select().from(schema.adCampaigns)
      .where(eq(schema.adCampaigns.id, campaignId)).limit(1);
    if (!campaign || campaign.brandId !== brand.id) {
      return <div className="min-h-screen mx-auto max-w-5xl px-4 py-10"><a href={base} className="text-cyan-300">← Back to portal</a><div className="glass p-6 mt-4 text-muted">Campaign not found.</div></div>;
    }
    const [readiness, analytics] = await Promise.all([
      getCampaignReadiness(db, campaign.id),
      getBrandAnalytics(db, brand.id, { campaignId: campaign.id, days: 90 }),
    ]);
    return (
      <div className="min-h-screen">
        <PortalHeader name={brand.name} logo={campaign.logoUrl || brand.logoUrl} cover={campaign.coverUrl || cover} subtitle={campaign.name} />
        <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
          <div className="flex items-center justify-between">
            <a href={base} className="ghost-btn pressable rounded-full px-4 py-2 text-sm inline-flex items-center gap-1.5"><Icon name="arrowLeft" size={14} /> All campaigns</a>
            <span className={`text-xs font-semibold ${campaign.status === "active" ? "text-emerald-300" : "text-amber-300"}`}>● {campaign.status}</span>
          </div>

          <div className="grid sm:grid-cols-4 gap-3">
            <AnimStat label="Impressions (30d)" value={analytics.impressions} />
            <AnimStat label="Clicks (30d)" value={analytics.clicks} />
            <AnimStat label="CTR" value={analytics.ctr * 100} suffix="%" decimals={2} />
            <Stat label="Placements ready" value={`${readiness.filled}/${readiness.total}`} accent={readiness.ready ? "#34d399" : "#fbbf24"} />
          </div>

          {/* Analytics + Creatives split into tabs */}
          <Tabs tabs={[
            {
              key: "analytics", label: "Analytics", icon: "spark",
              node: (
                <BrandAnalyticsPanel brandId={brand.id} keyStr={key} campaignId={campaign.id} initial={analytics}
                  title="Performance over time" filename={`campaign-${campaign.name.replace(/\s+/g, "-").toLowerCase()}`} />
              ),
            },
            {
              key: "creatives", label: `Creatives (${readiness.filled}/${readiness.total})`, icon: "grid",
              node: (
                <div>
                  <p className="text-xs text-muted mb-4">Your campaign shows in every placement — ~5 seconds every minute alongside other brands. Each row below is one placement; click it to view or upload a creative.</p>
                  <BrandCreativesTab brandId={brand.id} keyStr={key}
                    slots={readiness.slots.map((s) => ({ placementId: s.placementId, key: s.key, pageScope: s.pageScope, width: s.width, height: s.height, creativeType: s.creativeType, fileUrl: s.fileUrl, clickUrl: s.clickUrl }))} />
                </div>
              ),
            },
          ]} />
        </div>
      </div>
    );
  }

  // ---- Overview: all campaigns + brand-wide intelligence ----
  const [data, brandAnalytics] = await Promise.all([
    getBrandPortalData(db, brand.id),
    getBrandAnalytics(db, brand.id, { days: 90 }),
  ]);
  const shown = data.campaigns.filter((c) => filter === "all" || c.status === filter);
  const chip = (f: string, label: string) => (
    <a href={`${base}&filter=${f}`} className={`rounded-full border px-3 py-1 text-xs transition ${filter === f ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:border-white/25"}`}>{label}</a>
  );

  return (
    <div className="min-h-screen relative">
      {brand.portalBgUrl && (
        <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.82), rgba(4,5,26,0.92)), url(${brand.portalBgUrl})` }} />
      )}
      <PortalHeader name={brand.name} logo={brand.logoUrl} cover={cover} subtitle={`${data.totals.total} campaign${data.totals.total === 1 ? "" : "s"} · ${data.totals.active} live`} />
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        {brand.about && <div className="glass p-5 text-sm text-muted">{brand.about}</div>}

        {/* Brand can restyle its own portal */}
        <BrandAppearanceEditor brandId={brand.id} keyStr={key} initial={{ logoUrl: brand.logoUrl ?? "", coverUrl: brand.coverUrl ?? "", portalBgUrl: brand.portalBgUrl ?? "" }} />

        {data.totals.total === 0 ? (
          <div className="glass p-6">
            <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="rocket" size={18} className="text-cyan-300" /> Your first campaign isn&apos;t set up yet</h2>
            <p className="text-sm text-muted mt-1">Message us below and we&apos;ll create your campaign — then you can upload creatives for every placement right here.</p>
          </div>
        ) : (
          <>
            {/* Brand-wide animated totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <AnimStat label="Impressions (30d)" value={data.totals.impressions} />
              <AnimStat label="Clicks (30d)" value={data.totals.clicks} />
              <AnimStat label="CTR" value={data.totals.ctr * 100} suffix="%" decimals={2} />
              <AnimStat label="Live campaigns" value={data.totals.active} />
            </div>

            {/* Interactive chart (all campaigns) + placement table — refreshes in place */}
            <BrandAnalyticsPanel brandId={brand.id} keyStr={key} initial={brandAnalytics}
              title="Impressions & clicks — all campaigns" filename={`${brand.slug}-analytics`} />

            {/* Marketing intelligence */}
            <section>
              <h2 className="font-bold text-lg flex items-center gap-2 mb-3"><Icon name="spark" size={18} className="text-amber-300" /> Marketing intelligence</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Intel icon="pin" label="Top placement" value={data.intel.topPlacement?.key ?? "—"} sub={data.intel.topPlacement ? `${num(data.intel.topPlacement.impressions)} impressions` : "No data yet"} />
                <Intel icon="globe" label="Top country" value={data.intel.topCountry?.country ?? "—"} sub={data.intel.topCountry ? `${num(data.intel.topCountry.impressions)} impressions` : "No data yet"} />
                <Intel icon="link" label="Top page" value={data.intel.topPage?.path ?? "—"} sub={data.intel.topPage ? `${num(data.intel.topPage.impressions)} impressions` : "No data yet"} />
                <Intel icon="clock" label="Best day" value={data.intel.bestDay?.day ?? "—"} sub={data.intel.bestDay ? `${num(data.intel.bestDay.impressions)} impressions` : "No data yet"} />
              </div>
            </section>

            {/* Campaigns — filter + clickable cards → per-campaign analytics */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="rocket" size={18} className="text-cyan-300" /> Your campaigns</h2>
                <div className="flex flex-wrap gap-1.5">
                  {chip("all", `All (${data.totals.total})`)}
                  {chip("active", "Live")}
                  {chip("paused", "Paused")}
                  {chip("draft", "Draft")}
                  {chip("completed", "Ended")}
                </div>
              </div>
              {shown.length === 0 && <div className="glass p-6 text-center text-muted">No campaigns in this filter.</div>}
              <div className="grid md:grid-cols-2 gap-3">
                {shown.map((c) => (
                  <a key={c.id} href={`${base}&campaign=${c.id}`} className="glass overflow-hidden group hover:ring-1 hover:ring-cyan-400/40 transition">
                    <div className="h-20 relative">
                      {(c.coverUrl || cover) ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={c.coverUrl || cover || ""} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80 group-hover:opacity-100 transition" />
                      ) : <div className="absolute inset-0" style={{ background: "radial-gradient(120% 140% at 10% 0%, #8b5cf655, transparent 60%), #0a0a1c" }} />}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a1c] to-transparent" />
                      <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2">
                        {(c.logoUrl || brand.logoUrl) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.logoUrl || brand.logoUrl || ""} alt="" className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/20 bg-black/40" />}
                        <div className="font-bold truncate">{c.name}</div>
                        <span className={`ml-auto text-[10px] font-semibold ${c.status === "active" ? "text-emerald-300" : "text-amber-300"}`}>● {c.status}</span>
                      </div>
                    </div>
                    <div className="p-3 grid grid-cols-3 gap-2 text-center">
                      <MiniStat label="Impr." value={num(c.impressions)} />
                      <MiniStat label="Clicks" value={num(c.clicks)} />
                      <MiniStat label="CTR" value={`${(c.ctr * 100).toFixed(1)}%`} />
                    </div>
                    <div className="px-3 pb-3 flex items-center justify-between">
                      <span className={`text-[11px] ${c.ready ? "text-emerald-300" : "text-amber-300"}`}>{c.filled}/{c.total} placements ready</span>
                      <span className="text-[11px] text-cyan-300 inline-flex items-center gap-1 group-hover:gap-2 transition-all">Open analytics <Icon name="arrowRight" size={12} /></span>
                    </div>
                  </a>
                ))}
              </div>
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

function AnimStat({ label, value, suffix = "", decimals = 0 }: { label: string; value: number; suffix?: string; decimals?: number }) {
  return (
    <div className="glass p-4 text-center">
      <AnimatedNumber value={value} suffix={suffix} decimals={decimals} className="text-2xl font-bold text-cyan-200" />
      <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-bold text-cyan-100">{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}

function Intel({ icon, label, value, sub }: { icon: string; label: string; value: string; sub: string }) {
  return (
    <div className="glass p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted"><Icon name={icon} size={13} className="text-amber-300" /> {label}</div>
      <div className="text-lg font-bold mt-1.5 truncate">{value}</div>
      <div className="text-[11px] text-muted truncate">{sub}</div>
    </div>
  );
}
