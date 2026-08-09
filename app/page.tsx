import Link from "next/link";
import ProductAtlas from "@/components/marketing/ProductAtlas";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getContent } from "@/lib/cms";
import GameLogo from "@/components/GameLogo";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import HeroBanner from "@/components/HeroBanner";
import QuestCard from "@/components/QuestCard";
import OAuthButtons from "@/components/OAuthButtons";
import PricingPlans from "@/components/PricingPlans";
import ServerEarnCards from "@/components/ServerEarnCards";
import { BrandHero, ProblemSection, InsightSection, SolutionSection, LoopSection, PrizeSection } from "@/components/BrandStory";
import { pricingLive } from "@/lib/pricing-live";
import { money } from "@/lib/pricing";
import { buildSkinnedPlanets } from "@/lib/planets";
import { getUserQuests, getQuestTops } from "@/lib/quests";
import { buildCardBgMap, cardBgCmsKeys, cardBgStyle } from "@/lib/card-bg";
import { getT } from "@/lib/i18n/t-server";
import { localizeQuest } from "@/lib/i18n/entities";
import { slimImg, optImg } from "@/lib/img";
import { timeAgo } from "@/lib/utils";
import { networkStats, publicServers } from "@/lib/network";
import { DiscordSection } from "@/components/DiscordSection";
import { botShowcaseSteps } from "@/lib/bot-showcase";
import { installHref } from "@/lib/discord/config";
import { OrganizationSchema, WebSiteSchema, BotSchema, FaqSchema, SEARCH_FAQ } from "@/components/StructuredData";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const db = await getDb();
  const viewer = await getCurrentUser();
  const skinnedPlanets = await buildSkinnedPlanets(db);

  // Quest hero data — the homepage toggle can swap the planet globe for the
  // primary quest's treasure map without leaving the page.
  // Full quests + CP tops for the "Chart your quests" card grid.
  const homeQuests = await getUserQuests(db, viewer?.id ?? null);
  const questTops = await getQuestTops(db, homeQuests.map((q) => q.id), 6);
  const [network, topServers, botSteps, pricing] = await Promise.all([
    networkStats(), publicServers(6), botShowcaseSteps(), pricingLive(),
  ]);
  const install = installHref();
  const c = await getContent([
    "discord.badge", "discord.title", "discord.subtitle",
    "discord.cta.primary", "discord.cta.secondary",
    "hero.badge", "hero.title.line1", "hero.title.line2", "hero.subtitle",
    "hero.cta.primary", "hero.cta.secondary", "hero.image",
    "hero.banner.label", "hero.banner.note",
    "section.challenges.title", "section.challenges.subtitle",
    "section.games.title", "section.games.subtitle",
    "section.badges.title", "section.badges.subtitle",
    "section.partners.title",
    "section.cta.title", "section.cta.subtitle", "section.cta.button",
    "banner.arena",
    // The brand story — the guest homepage's spine.
    "brand.hero.badge", "brand.hero.title", "brand.hero.title2", "brand.hero.subtitle",
    "brand.hero.cta.primary", "brand.hero.cta.secondary",
    "brand.problem.title", "brand.problem.subtitle", "brand.problem.items",
    "brand.insight.title", "brand.insight.body", "brand.insight.stat", "brand.insight.statLabel",
    "brand.insight.stat2", "brand.insight.stat2Label",
    "brand.solution.title", "brand.solution.subtitle", "brand.solution.items",
    "brand.loop.title", "brand.loop.subtitle", "brand.loop.items",
    "brand.prize.title", "brand.prize.body",
  ]);

  const [activeChallenges, games, partners, statCounts, tickerRows] = await Promise.all([
    db.select({
      challenge: {
        id: schema.challenges.id, title: schema.challenges.title, game: schema.challenges.game,
        cadence: schema.challenges.cadence, endAt: schema.challenges.endAt, coverUrl: schema.challenges.coverUrl,
        description: schema.challenges.description, prizeDescription: schema.challenges.prizeDescription,
      },
      space: { slug: schema.spaces.slug },
    })
      .from(schema.challenges)
      .innerJoin(schema.spaces, eq(schema.challenges.spaceId, schema.spaces.id))
      .where(eq(schema.challenges.status, "active"))
      .orderBy(asc(schema.challenges.endAt)).limit(3),
    db.select({ id: schema.games.id, name: schema.games.name, slug: schema.games.slug, logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl, coverAdjust: schema.games.coverAdjust })
      .from(schema.games).where(eq(schema.games.isActive, true))
      .orderBy(asc(schema.games.sortOrder)).limit(12),
    db.select({ id: schema.partners.id, name: schema.partners.name, logoUrl: schema.partners.logoUrl, url: schema.partners.url })
      .from(schema.partners).where(eq(schema.partners.isActive, true)).orderBy(asc(schema.partners.sortOrder)),
    db.select({
      users: sql<number>`(SELECT COUNT(*) FROM users)`,
      accounts: sql<number>`(SELECT COUNT(*) FROM linked_game_accounts)`,
      challenges: sql<number>`(SELECT COUNT(*) FROM challenges)`,
      games: sql<number>`(SELECT COUNT(*) FROM games WHERE is_active = true)`,
    }).from(schema.users).limit(1),
    db.select({
      points: schema.challengeParticipants.currentPoints,
      user: { displayName: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl },
      challenge: { title: schema.challenges.title, game: schema.challenges.game },
    })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .innerJoin(schema.challenges, eq(schema.challengeParticipants.challengeId, schema.challenges.id))
      .where(eq(schema.challenges.status, "active"))
      .orderBy(desc(schema.challengeParticipants.currentPoints))
      .limit(10),
  ]);

  // Top-3 standings per featured challenge for the hover reveal.
  const top3ByChallenge = new Map<string, { name: string; slug: string; avatarUrl: string | null; points: number }[]>();
  if (activeChallenges.length) {
    const rows = await db.select({
      challengeId: schema.challengeParticipants.challengeId,
      points: schema.challengeParticipants.currentPoints,
      user: { displayName: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl },
    })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .where(inArray(schema.challengeParticipants.challengeId, activeChallenges.map((x) => x.challenge.id)))
      .orderBy(desc(schema.challengeParticipants.currentPoints));
    for (const r of rows) {
      const list = top3ByChallenge.get(r.challengeId) ?? [];
      if (list.length < 3) {
        list.push({ name: r.user.displayName, slug: r.user.slug, avatarUrl: r.user.avatarUrl, points: r.points });
        top3ByChallenge.set(r.challengeId, list);
      }
    }
  }

  const counts = statCounts[0] ?? { users: 0, accounts: 0, challenges: 0, games: 0 };
  const ticker = tickerRows.length > 0 ? [...tickerRows, ...tickerRows] : [];
  const cardBg = buildCardBgMap(await getContent(cardBgCmsKeys));
  const { tr, te } = await getT();
  const homeQuestsL = homeQuests.map((q) => localizeQuest(q, te));
  // Only the art-only fallback hero uses these now: with planets present, the
  // Discord section above carries the network numbers that actually matter.
  const statCards = [
    { n: counts.users, label: tr("Gamers"), icon: "users" },
    { n: counts.accounts, label: tr("Linked accounts"), icon: "link" },
    { n: counts.games, label: tr("Games"), icon: "gamepad" },
    { n: counts.challenges, label: tr("Challenges"), icon: "zap" },
  ];

  // The gamer half of the page, hoisted so it can sit in either position.
  //
  // A signed-in gamer sees it first — they came to play. A guest sees the
  // commercial argument first and this underneath as the proof of it, because
  // "here is the thing your money buys" only lands after they know what the
  // thing is. Same blocks, two orders, one definition.
  const gamerSections = (
    <>
        {/* ===== LIVE TICKER ===== */}
        {ticker.length > 0 && (
          <section className="border-y border-violet-500/15 bg-[#070826]/60 py-3 overflow-hidden">
            <div className="flex w-max ticker-track gap-10">
              {ticker.map((t, i) => (
                <Link key={i} href={`/u/${t.user.slug}`} className="flex items-center gap-2 text-sm whitespace-nowrap text-muted hover:text-ink">
                  <Avatar name={t.user.displayName} src={t.user.avatarUrl} size={22} />
                  <span className="text-ink font-semibold">{t.user.displayName}</span>
                  <span className="text-cyan-300 font-bold">{t.points} {tr("pts")}</span>
                  <span>{tr("in")} {t.challenge.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ===== LIVE CHALLENGES — event hero cards ===== */}
        {activeChallenges.length > 0 && (
          <section className="relative py-20">
            <div className="absolute inset-0 -z-10 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${optImg(c["banner.arena"], 1200)})` }} />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#04051a] via-transparent to-[#04051a]" />
            <div className="mx-auto max-w-6xl px-4">
              <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
                    <Icon name="zap" size={30} className="text-amber-300" />
                    {c["section.challenges.title"].split(" ")[0]} <span className="grad-text">{c["section.challenges.title"].split(" ").slice(1).join(" ") || "Challenges"}</span>
                  </h2>
                  <p className="text-muted mt-2 max-w-xl">{c["section.challenges.subtitle"]}</p>
                </div>
                <Link href="/planets" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">{tr("All challenges")}</Link>
              </div>

              <div className="grid md:grid-cols-3 gap-5">
                {activeChallenges.map(({ challenge, space }) => {
                  const top3 = top3ByChallenge.get(challenge.id) ?? [];
                  return (
                    <Link
                      key={challenge.id}
                      href={`/planets/${space.slug}/challenges/${challenge.id}`}
                      className="event-card glass card-lift overflow-hidden group relative block"
                      style={{ background: cardBgStyle(cardBg, "challenge") }}
                    >
                      <div className="h-40 relative overflow-hidden">
                        <div
                          className="event-cover absolute inset-0 bg-cover bg-center"
                          style={{ backgroundImage: `url(${optImg(challenge.coverUrl ?? c["banner.arena"], 1200)})` }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d26] via-[#0b0d26]/40 to-transparent" />
                        <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {tr("Live")} · {challenge.cadence}
                        </div>
                        <div className="absolute bottom-3 left-4 right-4">
                          <div className="font-bold text-lg leading-tight drop-shadow">{challenge.title}</div>
                          <div className="text-xs text-muted mt-0.5 inline-flex items-center gap-1.5">
                            <Icon name="clock" size={11} /> {tr("ends")} {timeAgo(challenge.endAt).replace(" ago", "")} · {challenge.game}
                          </div>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="text-xs text-muted line-clamp-2 min-h-[2rem]">{challenge.description}</div>
                        {/* Hover reveal: live top 3 */}
                        <div className="event-reveal mt-3 space-y-1.5">
                          {top3.length === 0 && (
                            <div className="text-xs text-cyan-300 inline-flex items-center gap-1.5"><Icon name="crown" size={12} /> {tr("Throne unclaimed — join first")}</div>
                          )}
                          {top3.map((t, i) => (
                            <div key={t.slug} className="flex items-center gap-2 text-sm">
                              <span className={`rank-chip rank-chip-${i + 1} !h-6 !min-w-6 text-xs`}>{i + 1}</span>
                              <Avatar name={t.name} src={t.avatarUrl} size={20} />
                              <span className="truncate text-xs">{t.name}</span>
                              <span className="ml-auto text-cyan-200 font-bold text-xs">{t.points} {tr("pts")}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          {challenge.prizeDescription && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-300 truncate">
                              <Icon name="trophy" size={12} /> {challenge.prizeDescription.split("+")[0]}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs text-cyan-300 shrink-0">{tr("Compete")} <Icon name="chevronRight" size={12} /></span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ===== AD ===== */}
        <div className="mx-auto max-w-6xl px-4">
          <AdSlot placement="landing_hero_banner" />
        </div>

        {/* ===== GAMES GALAXY ===== */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold">
                {tr("The")} <span className="grad-text">{tr("Game Galaxy")}</span>
              </h2>
              <p className="text-muted mt-2 max-w-xl">{c["section.games.subtitle"]}</p>
            </div>
            <Link href="/planets" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">{tr("All planets")}</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {games.map((g, i) => {
              const cover = slimImg(g.coverUrl);
              return (
                <Link key={g.id} href={`/games/${g.slug}`} className="glass card-lift overflow-hidden group relative" style={{ animationDelay: `${i * 0.3}s` }}>
                  <div className="h-28 relative overflow-hidden">
                    {cover ? (
                      <div className="absolute inset-0 bg-cover transition-transform duration-500 group-hover:scale-110"
                        style={{ backgroundImage: `url(${optImg(cover, 1200)})`, backgroundPosition: `${g.coverAdjust?.x ?? 50}% ${g.coverAdjust?.y ?? 50}%` }} />
                    ) : (
                      <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: "url(/assets/ambient.png)" }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d26] via-[#0b0d26]/30 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="transition-transform duration-300 group-hover:scale-110 drop-shadow-2xl">
                        <GameLogo logoUrl={g.logoUrl} name={g.name} size={54} rounded="rounded-2xl" className="ring-1 ring-white/15" />
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 text-center text-xs font-semibold truncate">{g.name}</div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ===== QUESTS — same card layout as /quests ===== */}
        {homeQuestsL.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-20">
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold">
                {tr("Chart your")} <span className="grad-text">{tr("Quests")}</span>
              </h2>
              <p className="text-muted mt-3 max-w-lg mx-auto">
                {tr("Everything you do earns Cluster Points across galaxy-spanning quests. Climb each map from Bronze to Platinum.")}
              </p>
            </div>
            <div className="mt-10 grid md:grid-cols-2 gap-5">
              {homeQuestsL.map((q) => <QuestCard key={q.id} quest={q} top={questTops.get(q.id) ?? []} />)}
            </div>
            <div className="mt-8 text-center">
              <Link href="/quests" className="ghost-btn pressable rounded-full px-6 py-2.5 text-sm inline-flex items-center gap-2">
                {tr("Explore all quests")} <Icon name="arrowRight" size={15} />
              </Link>
            </div>
          </section>
        )}
    </>
  );

  return (
    <div className="overflow-x-clip">
      {/* Machine-readable facts about what Cluster is. An assistant asked
          "what's a good Discord bot for game stats" answers from what it can
          read and reconcile — prose gets paraphrased, sometimes wrongly, and a
          wrong claim about price or permissions is worse than no mention. */}
      <OrganizationSchema />
      <WebSiteSchema />
      <BotSchema servers={network.servers} />

      {/* ===== THE HERO =====
          One section, one background: a collapsed band of game logos on top of
          the headline that follows it. The band is not a separate card above the
          hero — it is the hero's first line, and opening it swaps the globe in
          place rather than sending the reader to a planet page.

          The commercial argument only runs for guests. A signed-in gamer has
          already bought in; showing them a rate card is noise. A guest is far
          more likely to be a brand or a server owner, and this is the order the
          argument has to arrive in: what reaching gamers costs today → why
          → what we built → what it costs here. */}
      <HeroBanner
        planets={skinnedPlanets}
        heading={tr("The Cluster galaxy — pick a game")}
        label={c["hero.banner.label"]}
        note={c["hero.banner.note"]}
      >
        {!viewer && (
          <BrandHero
            c={c}
            stats={[
              { label: "ad placements", value: pricing.placements.toLocaleString() },
              { label: "games, one challenge a week each", value: String(pricing.games.length || pricing.cfg.games) },
              { label: "challenges a month", value: String(pricing.cfg.games * pricing.cfg.challengesPerGame) },
              network.reach > 0
                ? { label: "gamers reachable", value: network.reach.toLocaleString() }
                : { label: "prize money a month", value: money(pricing.cfg.games * pricing.cfg.challengesPerGame * pricing.cfg.prizePool, pricing.cfg.currency) },
            ]}
          />
        )}
      </HeroBanner>

      {viewer && gamerSections}

      {!viewer && (
        <>
          {/* ===== WHICH ONE ARE YOU =====
              Three audiences arrive here and only one of them wants the next
              screen. Saying so in the first fold — and jumping straight to the
              section that answers them — is the difference between a landing
              page and a brochure that has to be read in order. */}
          <section className="mx-auto max-w-6xl px-4 pt-4 pb-2">
            <div className="grid gap-4 md:grid-cols-3">
              <DoorCard
                icon="target" tone="violet" title="I want to reach gamers"
                body={`Sponsored challenges from ${money(pricing.cfg.challengePrice, pricing.cfg.currency)} each, placements included, on a published rate card. Your name on the competition, not a banner they scroll past.`}
                href="#brands" cta="What it costs"
              />
              <DoorCard
                icon="satellite" tone="emerald" title="I run a Discord server"
                body="Install the bot free. Brands fund the prizes, your members win them, and your server takes a share of the fee."
                href="#servers" cta="What you earn"
              />
              <DoorCard
                icon="gamepad" tone="cyan" title="I play games"
                body={`One profile for every game you play, and a weekly competition worth ${money(pricing.cfg.prize1, pricing.cfg.currency)} to win. You were playing anyway.`}
                href="#gamers" cta="What you win"
              />
            </div>
          </section>

          {/* Proof before argument. A brand reading a pitch wants to know the
              audience is real before it wants to know why. */}
          <ProofBand net={network} games={pricing.games.length || pricing.cfg.games} cfg={pricing.cfg} />

          {/* B92. The mechanism, shown with the product's own components,
              before the argument for it. Everything above this point is a
              claim; this is the thing itself. */}
          <ProductAtlas />

          <ProblemSection c={c} bg={cardBg} />
          <InsightSection c={c} bg={cardBg} />
          <SolutionSection c={c} bg={cardBg} />
        </>
      )}

      {/* ===== THE PRODUCT: ClusterBot for Discord =====
          The proof under the claim: the network numbers and a live in-Discord
          demo on the same screen. */}
      <DiscordSection stats={network} servers={topServers} copy={c} steps={botSteps} installUrl={install} />

      {/* ===== FOR BRANDS: what it costs (guests only) ===== */}
      {!viewer && (
        <>
          <div id="brands" className="scroll-mt-24" />
          <PrizeSection c={c} cfg={pricing.cfg} bg={cardBg} />

          <section id="pricing" className="relative py-20 scroll-mt-24" style={{ background: cardBgStyle(cardBg, "sec_pricing") }}>
            <div className="relative mx-auto max-w-6xl px-4">
              <div className="text-center max-w-2xl mx-auto mb-10">
                <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-cyan-200/90 mb-5">
                  <Icon name="grid" size={12} /> {pricing.copy["pricing.eyebrow"]}
                </div>
                <h2 className="text-3xl md:text-5xl font-bold leading-tight">{pricing.copy["pricing.title"]}</h2>
                <p className="text-muted mt-4 leading-relaxed">{pricing.copy["pricing.subtitle"]}</p>
              </div>
              <PricingPlans
                cfg={pricing.cfg}
                copy={pricing.copy}
                games={pricing.games.map((g) => ({ slug: g.slug, name: g.name, logoUrl: g.logoUrl, gamers: g.gamers }))}
                reach={network.reach}
                placements={{ total: pricing.placements, web: pricing.webPlacements, discord: pricing.discordPlacements }}
                compact
              />
              <div className="mt-8 text-center">
                <Link href="/pricing" className="ghost-btn pressable rounded-full px-6 py-2.5 text-sm inline-flex items-center gap-2">
                  {tr("Full rate card, add-ons and FAQ")} <Icon name="arrowRight" size={15} />
                </Link>
              </div>
            </div>
          </section>

          <div id="servers" className="scroll-mt-24" />
          <LoopSection c={c} bg={cardBg} />

          {/* ===== FOR SERVER OWNERS: what they earn ===== */}
          <section className="relative py-20 border-y border-violet-500/15" style={{ background: cardBgStyle(cardBg, "sec_servers") }}>
            <div className="relative mx-auto max-w-6xl px-4">
              <ServerEarnCards installUrl={install || undefined} />
            </div>
          </section>
        </>
      )}

      {/* ===== ART-ONLY FALLBACK HERO (no planets configured yet) ===== */}
      {skinnedPlanets.length > 0 ? null : (
        <section className="relative">
          <div className="absolute inset-0 -z-10 bg-cover bg-center opacity-80" style={{ backgroundImage: `url(${optImg(c["hero.image"], 1200)})` }} />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#04051a]/30 via-[#04051a]/60 to-[#04051a]" />
          <div className="mx-auto max-w-6xl px-4 pt-24 pb-20 text-center">
            <div className="rise-in inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-cyan-200/90 mb-8">
              <span className="inline-block h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
              {c["hero.badge"]}
            </div>
            <h1 className="rise-in rise-in-1 text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
              {c["hero.title.line1"]}<br />
              <span className="grad-text">{c["hero.title.line2"]}</span>
            </h1>
            <p className="rise-in rise-in-2 mx-auto mt-6 max-w-2xl text-lg text-muted leading-relaxed">{c["hero.subtitle"]}</p>
            <div className="rise-in rise-in-3 mt-10 flex flex-col items-center gap-4">
              {viewer ? (
                <Link href="/feed" className="glow-btn pressable rounded-full px-8 py-3.5 font-semibold text-white text-lg">
                  {tr("Enter your feed")} <Icon name="arrowRight" size={16} className="ml-1" />
                </Link>
              ) : (
                <>
                  <div className="w-full max-w-xs"><OAuthButtons next="/onboarding" /></div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Link href="/signup" className="ghost-btn pressable rounded-full px-6 py-2.5">{c["hero.cta.primary"]} <Icon name="arrowRight" size={15} className="ml-1" /></Link>
                    <Link href="/leaderboards" className="ghost-btn pressable rounded-full px-6 py-2.5">{c["hero.cta.secondary"]}</Link>
                  </div>
                </>
              )}
            </div>
            <div className="rise-in rise-in-4 mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-3xl mx-auto">
              {statCards.map((s) => (
                <div key={s.label} className="glass card-lift px-4 py-4">
                  <Icon name={s.icon} size={16} className="text-violet-300 mb-1.5" />
                  <div className="text-3xl font-bold grad-text">{Number(s.n).toLocaleString()}</div>
                  <div className="text-xs uppercase tracking-widest text-muted mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}


      {/* ===== FOR GAMERS: what they play for =====
          A guest reaches this having read what a brand buys and what a server
          earns. This is the thing both of those are actually buying: real
          competitions with real people in them. */}
      {!viewer && (
        <section className="mx-auto max-w-6xl px-4 pt-16 text-center">
          <div id="gamers" className="scroll-mt-24" />
          <div className="text-[11px] uppercase tracking-[0.25em] text-cyan-300">For gamers</div>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">This is what the money buys.</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            Every challenge below is funded, live, and scored from the game&apos;s own API. Entering more
            costs nothing — one account, as many as you like.
          </p>
        </section>
      )}
      {gamerSections}

      {/* ===== THE QUESTIONS PEOPLE ACTUALLY ASK =====
          The same eight answers the /answers page publishes, on the page most
          people land on. Written as self-contained paragraphs so an answer
          engine can quote one, and marked up as FAQPage for the same reason. */}
      {!viewer && (
        <section className="mx-auto max-w-4xl px-4 py-20">
          <FaqSchema items={SEARCH_FAQ} />
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">Straight answers</h2>
            <p className="mt-3 text-muted">The questions we get before anyone signs anything.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {SEARCH_FAQ.map(([q, a]) => (
              <div key={q} className="glass p-5">
                <h3 className="text-sm font-bold text-ink">{q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/answers" className="ghost-btn pressable inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm">
              All of them, in one page <Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </section>
      )}

      {/* ===== TRUSTED BY ===== */}
      {partners.length > 0 && (
        <section className="border-y border-violet-500/12 bg-[#070826]/40 py-12 overflow-hidden">
          <div className="text-center text-xs uppercase tracking-[0.3em] text-muted mb-8">{c["section.partners.title"]}</div>
          <div className="flex w-max marquee-track gap-14 items-center">
            {[...partners, ...partners].map((p, i) => (
              <a key={`${p.id}-${i}`} href={p.url ?? "#"} target={p.url ? "_blank" : undefined} rel="noopener" className="opacity-60 hover:opacity-100 transition-opacity">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.logoUrl} alt={p.name} className="h-10 w-auto object-contain" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ===== CTA =====
          Three doors, because there are three people on this page: a brand with
          a budget, an owner with a community, and a gamer with an account. One
          generic "sign up" button served exactly one of them. */}
      <section className="relative mx-auto max-w-6xl px-4 py-24" style={{ background: cardBgStyle(cardBg, "sec_cta") }}>
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl md:text-4xl font-bold">
            {c["section.cta.title"].split(",")[0]},{" "}
            <span className="grad-text">{c["section.cta.title"].split(",").slice(1).join(",").trim() || "one network"}</span>
          </h2>
          <p className="text-muted mt-4">{c["section.cta.subtitle"]}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          <DoorCard
            icon="target" tone="violet" title="I'm a brand"
            body={`Sponsored challenges from ${money(pricing.cfg.challengePrice, pricing.cfg.currency)} each, with placements included. Your name on the competition, not a banner they scroll past.`}
            href="/pricing" cta="See pricing"
          />
          <DoorCard
            icon="satellite" tone="emerald" title="I run a Discord"
            body="Install the bot free, link 500 gamers, and brands start sponsoring challenges in your server — with the prize money won by your members."
            href="/discord-bot" cta="Add ClusterBot"
          />
          <DoorCard
            icon="gamepad" tone="cyan" title="I'm a gamer"
            body={`Link your accounts, get one profile for every game, and compete each week for ${money(pricing.cfg.prize1, pricing.cfg.currency)} a win.`}
            href="/signup" cta={c["section.cta.button"]}
          />
        </div>
      </section>
    </div>
  );
}

// The audience, before the argument.
//
// A brand reading a pitch wants to know the audience is real before it wants to
// know why. Every number here is read from production on this request — if one
// is small, it says so, because a landing page that inflates its own reach gets
// found out in the first campaign.
function ProofBand({ net, games, cfg }: {
  net: { servers: number; reach: number; gamers: number; linked: number };
  games: number;
  cfg: { challengePrice: number; prizePool: number; currency: string };
}) {
  const stats = [
    { value: net.servers.toLocaleString(), label: "Discord servers running the bot" },
    { value: net.reach.toLocaleString(), label: "members inside them" },
    { value: net.linked.toLocaleString(), label: "gamers with a verified game account" },
    { value: String(games), label: "games, one weekly competition each" },
  ];
  return (
    <section className="border-y border-violet-500/12 bg-[#070826]/40 py-10">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="brand-text text-3xl font-bold leading-none">{s.value}</div>
              <div className="mt-2 text-[11px] uppercase tracking-wider text-muted">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Read from production as this page loaded. A sponsored challenge is{" "}
          <b className="text-ink">{money(cfg.challengePrice, cfg.currency)}</b>, of which{" "}
          <b className="text-ink">{money(cfg.prizePool, cfg.currency)}</b> is prize money won by players.
        </p>
      </div>
    </section>
  );
}

// One of the three doors. Used twice: as the audience selector under the hero,
// and as the closing CTA. Kept local — this layout is the home page's argument,
// not a shared pattern.
function DoorCard({
  icon, tone, title, body, href, cta,
}: { icon: string; tone: "violet" | "emerald" | "cyan"; title: string; body: string; href: string; cta: string }) {
  const ring = tone === "violet" ? "border-violet-400/25" : tone === "emerald" ? "border-emerald-400/25" : "border-cyan-400/25";
  const chip = tone === "violet" ? "bg-violet-500/15 text-violet-200" : tone === "emerald" ? "bg-emerald-500/15 text-emerald-200" : "bg-cyan-500/15 text-cyan-200";
  return (
    <Link href={href} className={`glass rounded-3xl p-6 card-lift border ${ring} flex flex-col`}>
      <div className={`h-11 w-11 rounded-xl grid place-items-center ${chip}`}>
        <Icon name={icon} size={20} />
      </div>
      <div className="font-bold text-lg mt-4">{title}</div>
      <p className="text-sm text-muted mt-2 leading-relaxed flex-1">{body}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-300">
        {cta} <Icon name="arrowRight" size={14} />
      </span>
    </Link>
  );
}
