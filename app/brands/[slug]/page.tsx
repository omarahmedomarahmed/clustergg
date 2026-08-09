import { notFound } from "next/navigation";
import { hasPortalSession } from "@/lib/portal-auth";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getBrandBySlugOrId, getBrandPortalData, getBrandAnalytics, getCampaignReadiness, getCardCampaign } from "@/lib/brands";
import { readThread, unreadCount, markThreadRead } from "@/lib/threads";
import { portalSendMessage } from "@/app/actions/brand-portal";
import { CARD_AD_PLACEMENT } from "@/lib/cards/ads";
import { networkStats } from "@/lib/network";
import { brandCampaigns, campaignQuote, networkReach, nextMonday, slotWindows } from "@/lib/sponsored-campaigns";
import { trophiesForBrand } from "@/lib/brand-trophies";
import BrandDraftCampaigns from "@/components/BrandDraftCampaigns";
import BrandAudience from "@/components/BrandAudience";
import { audienceSegments } from "@/lib/segments";
import { campaignGames } from "@/lib/sponsored-campaigns";
import { brandChallengeReports, campaignReport, brandTestimonials, brandTier, challengeServers } from "@/lib/brand-report";
import { pricingConfig } from "@/lib/pricing-live";
import { listInvoices } from "@/lib/invoices";
import { money } from "@/lib/pricing";
import InvoiceView, { InvoiceStatus, DueLine, PayBlock } from "@/components/InvoiceView";
import BrandCampaignReports from "@/components/BrandCampaignReports";
import AdDelivery from "@/components/AdDelivery";
import { brandCreativeIds, deliveryFor } from "@/lib/ad-delivery";
import BrandTierStrip from "@/components/BrandTierStrip";
import BrandInbox from "@/components/BrandInbox";
import ContactUs from "@/components/ContactUs";
import BrandAnalyticsPanel from "@/components/BrandAnalyticsPanel";
import BrandAppearanceEditor from "@/components/BrandAppearanceEditor";
import BrandCreativesTab from "@/components/BrandCreativesTab";
import BrandCardCampaign from "@/components/BrandCardCampaign";
import CampaignBuilder from "@/components/CampaignBuilder";
import BrandChartBuilder from "@/components/BrandChartBuilder";
import Tabs from "@/components/Tabs";
import AnimatedNumber from "@/components/AnimatedNumber";
import Icon from "@/components/Icon";
import PortalKeyHandoff from "@/components/PortalKeyHandoff";
import { optImg } from "@/lib/img";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Brand portal · ${slug}` };
}

export default async function BrandPortalPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ key?: string; unlock?: string; campaign?: string; challenge?: string; filter?: string; left?: string; mins?: string }> }) {
  const { slug } = await params;
  const { key = "", unlock = "", campaign: campaignId = "", challenge: challengeId = "", filter = "all", left = "", mins = "" } = await searchParams;
  const db = await getDb();
  const brand = await getBrandBySlugOrId(db, slug);
  if (!brand) notFound();

  // Same hardening as the server portal, and the same reason it can't happen
  // here: writing a cookie during a Server Component render throws in Next, so
  // the exchange belongs to a Route Handler. A shared `?key=` link hands off to
  // it and comes back with a session and a clean URL.
  // Hand a shared `?key=` link to the unlock route with a real form
  // submission. The page can't do the exchange itself (a Server Component
  // render may not write cookies) and can't `redirect()` there either — App
  // Router redirects go through the client router, which doesn't reliably
  // follow a route handler's 307.
  // The deep-link target travels with the key so a shared "open this week"
  // link lands on the week rather than the portal home.
  if (key) {
    const deep = new URLSearchParams();
    if (challengeId) deep.set("challenge", challengeId);
    if (campaignId) deep.set("campaign", campaignId);
    return <PortalKeyHandoff kind="brand" slug={brand.slug ?? brand.id} portalKey={key} deep={deep.toString()} />;
  }
  const unlocked = await hasPortalSession("brand", brand.id);
  const cover = brand.coverUrl;
  const base = `/brands/${brand.slug}`;
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
            <form method="POST" action="/api/portal/unlock" className="mt-4 flex gap-2">
              <input type="hidden" name="kind" value="brand" />
              <input type="hidden" name="slug" value={brand.slug ?? brand.id} />
              <input name="key" required placeholder="CLSTR-XXXX-XXXX-XXXX" className="input-cosmic flex-1 font-mono" />
              <button className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">Unlock</button>
            </form>
            {unlock === "bad" && (
              <p className="mt-2 text-xs text-rose-300">
                That key didn&apos;t match. Double-check it or reach out to your manager.
                {left !== "" && (
                  <> {Number(left) > 0
                    ? `${left} ${Number(left) === 1 ? "try" : "tries"} left before this portal locks.`
                    : "That was the last try — this portal is now locked."}</>
                )}
              </p>
            )}
            {unlock === "throttled" && (
              <p className="mt-2 text-xs text-amber-300">
                Locked after too many wrong keys{mins ? ` — try again in about ${mins} minute${mins === "1" ? "" : "s"}` : ""}.
                The attempt has been reported to our team; if it was you, email us and we&apos;ll lift it.
              </p>
            )}
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

  // The conversation, and how much of it they haven't seen. Counted BEFORE
  // marking read so a reply that arrived since their last visit still puts a
  // dot on the tab they're about to open.
  const [inbox, unreadFromUs] = await Promise.all([
    readThread("brand", brand.id),
    unreadCount("brand", brand.id, "portal"),
  ]);
  await markThreadRead("brand", brand.id, "portal");
  const sendToCluster = portalSendMessage.bind(null, brand.id, key);

  // ---- One sponsored challenge, in full ----
  //
  // A brand that bought four weeks had a cover image and a podium per week.
  // This is the week itself: the trophies their logo is on, everyone who
  // entered, where each entrant came from, and how any one of them scored.
  if (challengeId) {
    const { brandChallengeDetail } = await import("@/lib/brand-challenge-detail");
    const detail = await brandChallengeDetail(brand.id, challengeId);
    if (!detail) {
      return (
        <div className="min-h-screen mx-auto max-w-5xl px-4 py-10">
          <a href={base} className="text-cyan-300">← Back to portal</a>
          <div className="glass p-6 mt-4 text-muted">
            That challenge isn&apos;t one of yours. If you think it should be, message us from the Messages tab.
          </div>
        </div>
      );
    }
    const BrandChallengeDetailView = (await import("@/components/BrandChallengeDetail")).default;
    return (
      <div className="min-h-screen">
        <PortalHeader name={brand.name} logo={brand.logoUrl} cover={detail.coverUrl || cover} subtitle={detail.title} />
        <div className="mx-auto max-w-5xl px-4 py-8">
          <BrandChallengeDetailView detail={detail} brandId={brand.id} keyStr={key} backHref={base} />
        </div>
      </div>
    );
  }

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
  const [data, brandAnalytics, cardCampaign, net, reach, sponsored, invoices] = await Promise.all([
    getBrandPortalData(db, brand.id),
    getBrandAnalytics(db, brand.id, { days: 90 }),
    getCardCampaign(db, brand.id, CARD_AD_PLACEMENT),
    networkStats().catch(() => null),
    networkReach(),
    brandCampaigns(brand.id),
    listInvoices({ brandId: brand.id, limit: 60 }),
  ]);

  // B82. Delivery, from logged rows only. Scoped by resolving the brand's
  // creative ids FIRST and handing those to the report — the report takes ids
  // and never a brand id, so no argument reaches another brand's rows.
  const delivery = await deliveryFor(db, await brandCreativeIds(db, brand.id));

  // Drafts are ours, not theirs. A brand seeing a bill that staff are still
  // building is a conversation nobody wanted to have yet.
  const bills = invoices.filter((i) => i.status !== "draft");
  const dueNow = bills.filter((i) => i.status === "sent");
  const owed = dueNow.reduce((a, i) => a + i.total, 0);
  const anyOverdue = dueNow.some((i) => i.overdue);

  // What the builder needs: every game with its own audience, plus which ones
  // are already taken — by anybody this week, or by THIS brand for the month.
  const gameLogos = new Map(
    (await db.select({ name: schema.games.name, logoUrl: schema.games.logoUrl }).from(schema.games))
      .map((g) => [g.name, g.logoUrl]),
  );
  const mineByGame = new Set(
    sponsored.filter((c) => c.status === "submitted" || c.status === "running").map((c) => c.game),
  );
  const busyGames = new Set(
    (await db.select({ game: schema.challenges.game })
      .from(schema.challenges)
      .where(and(eq(schema.challenges.status, "active"), sql`${schema.challenges.sponsorPrice} > 0`)))
      .map((c) => c.game),
  );
  const builderGames = reach.byGame.map((g) => ({
    game: g.game,
    logoUrl: gameLogos.get(g.game) ?? null,
    servers: g.servers,
    unlockedServers: g.unlockedServers,
    gamers: g.gamers,
    verifiedPlayers: g.verifiedPlayers,
    regions: g.regions,
    busy: busyGames.has(g.game),
    owned: mineByGame.has(g.game),
  }));
  // B36: what is owed, when it is due, and what happens if it is not paid.
  const { brandBlocked } = await import("@/lib/prepay");
  const prepay = await brandBlocked(db, brand.id);
  // B91.9. Theirs plus the general catalogue — another brand's logo must never
  // appear in this list, let alone on a podium.
  const brandTrophies = (await trophiesForBrand(await getDb(), brand.id)).map((t) => ({
    id: t.id, name: t.name, tier: t.tier, value: t.value, brandId: t.brandId,
  }));

  // B91.10. Campaigns sales built for them, waiting to be confirmed. Before
  // this, what a brand saw after a sales call was an invoice for something they
  // had never seen a screen for.
  const draftCampaigns = sponsored
    .filter((c) => c.status === "draft")
    .map((c) => ({
      id: c.id, game: c.game, slots: c.slots,
      total: Number(c.total ?? 0), pricePerChallenge: Number(c.pricePerChallenge ?? 0),
      startAt: c.startAt.toISOString(), status: c.status,
      games: campaignGames(c),
    }));

  // B89.5. Aggregate only, floor of 25, no drill-down and no export — the
  // decision is in lib/segments.ts and this is the only surface that shows it.
  const audience = await audienceSegments(db);

  const buyQuote = campaignQuote();
  const buyWeeks = slotWindows(nextMonday());

  // ---- What the money did: the reporting half of the buy ----
  //
  // Built here rather than in the component so every number crosses to the
  // client already counted. The per-challenge reports are fetched ONCE for the
  // brand and shared across campaigns — a portal that queried per week would
  // issue a query per week of every month they've ever bought.
  const cfg = await pricingConfig();
  const challengeReports = await brandChallengeReports(brand.id, cfg);
  const campaignViews = await Promise.all(sponsored.map((c) => campaignReport(c, challengeReports, cfg)));
  const testimonials = await brandTestimonials(brand.id);
  // The servers each week landed in — the drill-down under "servers reached".
  // Only for weeks that actually ran, so an unstarted month costs no queries.
  const ranIds = [...new Set(
    campaignViews.flatMap((r) => r.weeks.map((w) => w.report?.challengeId).filter((x): x is string => !!x)),
  )];
  const serversByChallenge = new Map(
    await Promise.all(ranIds.map(async (id) => [id, await challengeServers(id)] as const)),
  );
  const tier = brandTier(
    sponsored.filter((c) => c.status === "submitted" || c.status === "running").map((c) => c.game),
    cfg,
  );
  const shown = data.campaigns.filter((c) => filter === "all" || c.status === filter);
  const chip = (f: string, label: string) => (
    <a href={`${base}?filter=${f}`} className={`rounded-full border px-3 py-1 text-xs transition ${filter === f ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:border-white/25"}`}>{label}</a>
  );

  // What needs them, rather than what is merely empty.
  //
  // A red dot is a promise that something is wrong, and it is spent the first
  // time it turns out to mean "you haven't bought this yet". So each one below
  // names a thing the brand has ALREADY paid for that isn't working: an empty
  // card slot is house art running where their creative should be, and a live
  // campaign short of creatives is a placement they own showing somebody
  // else's. The buy tab has no dot at all — not buying is not a fault.
  const cardEmpty = cardCampaign.creatives.length === 0;
  const adsIncomplete = data.campaigns.some((c) => (c.status === "active" || c.status === "paused") && !c.ready);

  return (
    <div className="min-h-screen relative">
      {brand.portalBgUrl && (
        <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.82), rgba(4,5,26,0.92)), url(${optImg(brand.portalBgUrl, 1200)})` }} />
      )}
      <PortalHeader
        name={brand.name} logo={brand.logoUrl} cover={cover}
        subtitle={`${data.totals.total} campaign${data.totals.total === 1 ? "" : "s"} · ${data.totals.active} live`}
        signOutSlug={brand.slug ?? brand.id}
      />
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* The overdue state, above the tabs and on every tab (B36).
            A brand that is about to be blocked, or already is, should not have
            to find that out by clicking into billing — and the consequence is
            stated with the amount, because "overdue" without "and here is what
            happens next" is a nag rather than a notice. */}
        {prepay.invoiceId && prepay.stage !== "paid" && (
          <div className={`mb-6 rounded-2xl border p-5 ${prepay.blocked ? "border-rose-400/40 bg-rose-500/5" : "border-amber-400/35 bg-amber-500/5"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <Icon name="alert" size={18} className={prepay.blocked ? "text-rose-300" : "text-amber-300"} />
              <div className="min-w-0 flex-1">
                <div className={`font-bold ${prepay.blocked ? "text-rose-200" : "text-amber-200"}`}>
                  {prepay.blocked
                    ? `Invoice ${prepay.invoiceNumber} is unpaid — nothing new is being published`
                    : `Invoice ${prepay.invoiceNumber} is due — $${prepay.amount.toLocaleString()}`}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {prepay.blocked
                    ? prepay.reason
                    : <>Campaign invoices are due the day they are issued. You have until your first challenge ends
                        {prepay.graceEndsAt ? <> — {new Date(prepay.graceEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</> : null}
                        {" "}to settle it. After that we stop publishing new challenges for you; the ones already
                        running finish, and every prize already won is still paid.</>}
                </p>
              </div>
            </div>
          </div>
        )}

        <Tabs tabs={[
          {
            key: "overview", label: "Overview", icon: "chart",
            node: (
              <div className="space-y-8">
                {brand.about && <div className="glass p-5 text-sm text-muted">{brand.about}</div>}

                {/* Where they stand, before anything they can buy. A brand opening
                    their own dashboard should see their position on it first. */}
                <BrandTierStrip
                  tier={tier}
                  spend={campaignViews.reduce((a, c) => a + c.totals.spend, 0)}
                  membersInServers={campaignViews.reduce((a, c) => a + c.totals.members, 0)}
                  entrants={campaignViews.reduce((a, c) => a + c.totals.entrants, 0)}
                  pastGames={new Set(sponsored.map((c) => c.game)).size}
                  currency={cfg.currency}
                />

                {/* B82. Delivery, counted. This panel said "measurement is
                    being rebuilt" from B72.1 until now — the old one priced a
                    server headcount and called the result a return. */}
                <AdDelivery delivery={delivery} />

                {/* What the last month did, before what the next one costs. */}
                <BrandCampaignReports
                  brandId={brand.id} keyStr={key}
                  campaigns={campaignViews.map((r) => ({
                    id: r.campaign.id,
                    game: r.campaign.game,
                    status: r.campaign.status,
                    startAt: r.campaign.startAt.toISOString(),
                    slots: r.campaign.slots,
                    total: r.campaign.total,
                    weeks: r.weeks.map((w) => ({
                      index: w.index, startAt: w.startAt, endAt: w.endAt,
                      coverUrl: w.coverUrl, status: w.status, challengeId: w.challengeId,
                      report: w.report ? {
                        title: w.report.title, game: w.report.game, status: w.report.status,
                        servers: w.report.reach.servers, members: w.report.reach.members, linked: w.report.reach.linked,
                        entrants: w.report.entrants, clicks: w.report.clicks,
                        ecpm: w.report.ecpm, costPerEntrant: w.report.costPerEntrant,
                        spend: w.report.spend,
                        standings: w.report.standings,
                        servers_list: (serversByChallenge.get(w.report.challengeId) ?? [])
                          .map((s) => ({ name: s.name || "A Discord server", members: s.members, linked: s.linked })),
                      } : null,
                    })),
                    totals: r.totals,
                    complete: r.complete,
                    // A quote belongs to the month it came from; ones staff recorded
                    // without a campaign are shown on the brand's latest.
                    testimonials: testimonials
                      .filter((t) => !t.campaignId || t.campaignId === r.campaign.id)
                      .map((t) => ({ name: t.name, quote: t.quote, slug: t.slug, avatarUrl: t.avatarUrl })),
                  }))}
                />

                {sponsored.length === 0 && (
                  <ContactUs
                    title="Want us to run the first one for you?"
                    body="You can buy a month of sponsored challenges yourself on the Buy tab — it goes live without anyone in the way. If you'd rather we planned it with you, say so and your account team will build it around the games your customers actually play."
                    topic="We'd like help planning our first month of sponsored challenges."
                    send={sendToCluster}
                  />
                )}
              </div>
            ),
          },
          {
            // The media buy is a tab of its own.
            // A brand opens this portal to buy reach, and the single biggest
            // thing they can buy is a month of sponsored challenges on a game.
            key: "buy", label: "Buy challenges", icon: "rocket",
            node: (
              <>
              <a
                href="/rules/brand"
                className="glass mb-4 flex items-center gap-3 p-4 text-sm hover:border-cyan-400/40"
              >
                <Icon name="spark" size={16} className="shrink-0 text-violet-300" />
                <span>
                  <b>What we will and will not promise you</b>
                  <span className="block text-xs text-muted">
                    Every rule that binds a brand here, with the reason it exists.
                  </span>
                </span>
              </a>
              <CampaignBuilder
                brandId={brand.id} keyStr={key}
                games={builderGames}
                quote={buyQuote}
                network={{ servers: reach.servers, unlockedServers: reach.unlockedServers, gamers: reach.gamers }}
                weeks={buyWeeks.map((w) => ({ startAt: w.startAt.toISOString(), endAt: w.endAt.toISOString() }))}
                trophies={brandTrophies}
              />
              </>
            ),
          },
          {
            // Every campaign a brand is running, in one place — the sponsored
            // months AND the ad campaigns. This used to be a section buried at
            // the bottom of the analytics tab, which is why nobody found the
            // week-by-week detail that sits one click inside it.
            key: "campaigns",
            label: draftCampaigns.length ? `Campaigns (${draftCampaigns.length} waiting)` : "Campaigns",
            icon: "rocket",
            node: (
              <div className="space-y-8">
                <BrandDraftCampaigns brandId={brand.id} keyStr={key} campaigns={draftCampaigns} />
                <BrandAudience audience={audience} />
                {/* Every week of every sponsored month, as its own card.
                    `sponsored` is the CAMPAIGNS a brand bought; the weeks
                    inside them are the challenges that actually ran, and the
                    week is what a brand wants to open. */}
                {campaignViews.length > 0 && (
                  <section>
                    <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
                      <Icon name="trophy" size={18} className="text-amber-300" /> Sponsored challenges
                    </h2>
                    <p className="mb-3 text-xs text-muted">
                      Open any week for the full field, the trophies your logo is on, and how each gamer scored.
                    </p>
                    <div className="space-y-5">
                      {campaignViews.map((cv) => (
                        <div key={cv.campaign.id}>
                          <div className="mb-2 flex flex-wrap items-baseline gap-2">
                            <span className="text-sm font-bold">{cv.campaign.game}</span>
                            <span className="text-[11px] text-muted">
                              {cv.campaign.slots} week{cv.campaign.slots === 1 ? "" : "s"} · {cv.totals.entrants} entrants · {num(cv.totals.members)} reached
                            </span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {cv.weeks.map((w) => {
                              const r = w.report;
                              const inner = (
                                <>
                                  <div className="relative h-20">
                                    {(w.coverUrl || cover) ? (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img src={w.coverUrl || cover || ""} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80 transition group-hover:opacity-100" />
                                    ) : <div className="absolute inset-0" style={{ background: "radial-gradient(120% 140% at 10% 0%, #8b5cf655, transparent 60%), #0a0a1c" }} />}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a1c] to-transparent" />
                                    <div className="absolute bottom-2 left-3 right-3">
                                      <div className="truncate text-sm font-bold">{r?.title ?? `Week ${w.index}`}</div>
                                      <div className="text-[10px] uppercase tracking-wider text-muted">Week {w.index} · {w.status}</div>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 p-3 text-center">
                                    <MiniStat label="Entrants" value={num(r?.entrants ?? 0)} />
                                    <MiniStat label="Reached" value={num(r?.reach.members ?? 0)} />
                                    <MiniStat label="Clicks" value={num(r?.clicks ?? 0)} />
                                  </div>
                                </>
                              );
                              // A week that hasn't been created yet has nothing
                              // to open — showing a dead link would be worse
                              // than showing it greyed.
                              return w.challengeId ? (
                                <a key={w.index} href={`${base}?challenge=${w.challengeId}`}
                                  className="glass group overflow-hidden transition hover:ring-1 hover:ring-cyan-400/40">
                                  {inner}
                                  <div className="flex items-center justify-end px-3 pb-3">
                                    <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300 transition-all group-hover:gap-2">
                                      Open the week <Icon name="arrowRight" size={12} />
                                    </span>
                                  </div>
                                </a>
                              ) : (
                                <div key={w.index} className="glass overflow-hidden opacity-60">
                                  {inner}
                                  <div className="px-3 pb-3 text-right text-[11px] text-muted">Not scheduled yet</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

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
                    <a key={c.id} href={`${base}?campaign=${c.id}`} className="glass overflow-hidden group hover:ring-1 hover:ring-cyan-400/40 transition">
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

                {campaignViews.length === 0 && data.totals.total === 0 && (
                  <ContactUs
                    title="No campaigns yet"
                    body="Buy a month of sponsored challenges on the Buy tab — it goes live without anyone in the way. Or tell us what you're trying to reach and we'll build it with you."
                    topic="We'd like to start a campaign."
                    send={sendToCluster}
                  />
                )}
              </div>
            ),
          },
          {
            // Every creative, both surfaces, on one page. A brand uploading art
            // should not have to work out which tab a given surface lives
            // behind — the Discord card had a tab of its own and the website
            // placements were inside the analytics tab.
            key: "creatives", label: "Creatives", icon: "image", dot: cardEmpty || adsIncomplete,
            node: (
              <div className="space-y-8">
                <BrandCardCampaign
                  brandId={brand.id} keyStr={key} brandName={brand.name}
                  creatives={cardCampaign.creatives.map((c) => ({
                    campaignCreativeId: c.campaignCreativeId, fileUrl: c.fileUrl,
                    ctaLabel: c.ctaLabel, clickUrl: c.clickUrl,
                    impressions: c.impressions, clicks: c.clicks,
                    reviewStatus: c.reviewStatus,
                  }))}
                  live={cardCampaign.live}
                  status={cardCampaign.campaign?.status ?? null}
                  impressions={cardCampaign.impressions}
                  clicks={cardCampaign.clicks}
                  reach={{ servers: net?.servers ?? 0, gamers: net?.reach ?? 0 }}
                />

                <section>
                  <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
                    <Icon name="grid" size={18} className="text-cyan-300" /> Website placements
                  </h2>
                  {data.totals.total === 0 ? (
                    <ContactUs
                      title="Want the website placements too?"
                      body="Your Discord card runs from the panel above — that part needs nobody. The banner and rail placements across clustergg.com are sold per campaign, so we open those with you."
                      topic="We'd like the website placements on clustergg.com set up."
                      send={sendToCluster}
                    />
                  ) : (
                    <p className="text-xs text-muted">
                      Open a campaign from the Campaigns tab to upload or replace the art for each of its placements.
                    </p>
                  )}
                </section>
              </div>
            ),
          },
          {
            // Renamed from "Website ads": it carries BOTH surfaces now, and a
            // brand asking "how did we do" shouldn't have to know that the bot
            // and the website were ever separate products.
            key: "analytics", label: "Analytics", icon: "chart", dot: adsIncomplete,
            node: data.totals.total === 0 ? (
              <ContactUs
                title="Want the website placements too?"
                body="Your Discord card runs from the tab next door — that part needs nobody. The banner and rail placements across clustergg.com are sold per campaign, so we open those with you."
                topic="We'd like the website placements on clustergg.com set up."
                send={sendToCluster}
              />
            ) : (
              <div className="space-y-8">
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

                {/* Customizable chart dashboard — brands build/resize/save their own charts */}
                <BrandChartBuilder mode="brand" brandId={brand.id} keyStr={key} initial={brand.chartPrefs}
                  data={{ impressions: brandAnalytics.impressions, clicks: brandAnalytics.clicks, ctr: brandAnalytics.ctr, active: data.totals.active, byDay: brandAnalytics.byDay, byPlacement: brandAnalytics.byPlacement }} />

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

              </div>
            ),
          },
          {
            // Between Analytics and Appearance on purpose: a brand checking
            // what they got should find what they owe on the way past, not
            // buried behind the cosmetic settings.
            key: "billing",
            label: owed > 0 ? `Billing (${money(owed, cfg.currency)})` : "Billing",
            icon: "diamond",
            dot: anyOverdue,
            node: (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold">Your bills</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    One invoice a month, {"30"} days to pay from the day it&apos;s issued. Every line is itemised —
                    what the placements cost, what each game&apos;s challenges cost, and any discount you were given.
                    Payment is taken by our payment provider on their own page; Cluster never sees or stores your
                    card or bank details.
                  </p>
                </div>

                {bills.length === 0 ? (
                  <div className="glass p-8 text-center text-sm text-muted">
                    Nothing invoiced yet. Your first bill appears here when your campaign goes live.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bills.map((inv) => (
                      <details key={inv.id} className="glass overflow-hidden" open={inv.status === "sent"}>
                        <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-5">
                          <span className="font-bold">{inv.number}</span>
                          <InvoiceStatus invoice={inv} />
                          <span className="text-xs text-muted">{inv.periodLabel ?? ""}</span>
                          <span className="text-xs"><DueLine invoice={inv} /></span>
                          <span className="ml-auto text-lg font-black tabular-nums">{money(inv.total, inv.currency)}</span>
                        </summary>
                        <div className="border-t border-white/10 p-5">
                          <InvoiceView invoice={inv} dense />
                          <div className="mt-5">
                            <PayBlock invoice={inv} />
                          </div>
                          {inv.payToken && inv.status === "sent" && (
                            <p className="mt-3 text-center text-[11px] text-muted">
                              Need to forward this to finance?{" "}
                              <a href={`/pay/${inv.payToken}`} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">
                                Send them this link
                              </a> — it opens the invoice and the payment page, no portal key needed.
                            </p>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                )}

                <ContactUs
                  title="Something wrong on a bill?"
                  body="Tell us which invoice and which line. We'd rather fix it than have you pay something you don't agree with."
                  topic="A question about one of our invoices."
                  send={sendToCluster}
                />
              </div>
            ),
          },
          {
            key: "appearance", label: "Appearance", icon: "edit",
            node: (
              <BrandAppearanceEditor brandId={brand.id} keyStr={key}
                initial={{ logoUrl: brand.logoUrl ?? "", coverUrl: brand.coverUrl ?? "", portalBgUrl: brand.portalBgUrl ?? "" }} />
            ),
          },
          {
            key: "messages",
            label: unreadFromUs ? `Messages (${unreadFromUs})` : "Messages",
            icon: "messages",
            dot: unreadFromUs > 0,
            node: (
              <BrandInbox
                brandId={brand.id} brandName={brand.name} side="portal"
                messages={inbox} send={sendToCluster}
                note="Write here for anything at all — a change to a creative, a game you want next month, a question about a report. It reaches the people who run your campaigns, not a queue."
              />
            ),
          },
        ]} />
      </div>
    </div>
  );
}

function PortalHeader({ name, logo, cover, subtitle, signOutSlug }: {
  name: string; logo: string | null; cover: string | null; subtitle: string;
  /** Present once unlocked — the portal this header can sign out of. */
  signOutSlug?: string;
}) {
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
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">{name}</h1>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        {/* A plain form, so leaving works with no JavaScript at all — the one
            control on the page that has to work even when everything else on
            it has failed. */}
        {signOutSlug && (
          <form method="POST" action="/api/portal/signout" className="ml-auto shrink-0">
            <input type="hidden" name="kind" value="brand" />
            <input type="hidden" name="slug" value={signOutSlug} />
            <button className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold">
              <Icon name="logout" size={13} /> Sign out
            </button>
          </form>
        )}
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
