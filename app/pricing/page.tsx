import Link from "next/link";
import Icon from "@/components/Icon";
import PricingPlans from "@/components/PricingPlans";
import ServerEarnCards from "@/components/ServerEarnCards";
import { BrandHero, ProblemSection, InsightSection, SolutionSection, LoopSection, PrizeSection } from "@/components/BrandStory";
import PlacementMap from "@/components/viz/PlacementMap";
import OpsSplit from "@/components/viz/OpsSplit";
import CompareMatrix from "@/components/viz/CompareMatrix";
import TechProofGrid from "@/components/viz/TechProofGrid";
import { getContent } from "@/lib/cms";
import { buildCardBgMap, cardBgCmsKeys, cardBgStyle } from "@/lib/card-bg";
import { pricingLive } from "@/lib/pricing-live";
import { money, lines, pairs, quote, perGame } from "@/lib/pricing";
import { installHref } from "@/lib/discord/config";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "What it costs to advertise to gamers on Discord",
  description:
    "$250 a sponsored challenge — $175 of it is the prize pool that reaches a gamer. The published rate card for Discord gaming advertising, with reach stated before you spend.",
};

// The rate card.
//
// This page exists because "contact us for pricing" costs us the brand who was
// ready to buy and only wanted to know whether we were a $600 or a $60,000
// decision. Everything is stated: the base, the per-game rate, what the prizes
// cost us, and what we can honestly claim about reach.

export default async function PricingPage() {
  const live = await pricingLive();
  const { cfg, copy, network, games } = live;

  const [storyCopy, bgContent] = await Promise.all([
    getContent([
      "brand.hero.badge", "brand.hero.title", "brand.hero.title2", "brand.hero.subtitle",
      "brand.hero.cta.primary", "brand.hero.cta.secondary",
      "brand.problem.title", "brand.problem.subtitle", "brand.problem.items",
      "brand.insight.title", "brand.insight.body", "brand.insight.stat", "brand.insight.statLabel",
      "brand.insight.stat2", "brand.insight.stat2Label",
      "brand.solution.title", "brand.solution.subtitle", "brand.solution.items",
      "brand.loop.title", "brand.loop.subtitle", "brand.loop.items",
      "brand.prize.title", "brand.prize.body",
      "pricing.faq",
    ]),
    getContent(cardBgCmsKeys),
  ]);
  const bg = buildCardBgMap(bgContent);
  const install = installHref();

  const nf = (n: number) => n.toLocaleString();
  const entry = quote(cfg, { games: 1 });
  const full = quote(cfg, { games: cfg.games });

  // What a brand is buying, stated as counted numbers. `reach` is only claimed
  // once servers exist — an empty network advertising "0 gamers reachable" is
  // worse than not showing the tile at all.
  const heroStats = [
    { label: "ad placements", value: nf(live.placements) },
    { label: "games running weekly", value: nf(games.length || cfg.games) },
    { label: "challenges a month", value: nf(cfg.games * cfg.challengesPerGame) },
    network.reach > 0
      ? { label: "gamers reachable", value: nf(network.reach) }
      : { label: "prize money a month", value: money(cfg.games * cfg.challengesPerGame * cfg.prizePool, cfg.currency) },
  ];

  const faq = pairs(copy["pricing.faq"]).map((p) => ({ q: p.title, a: p.note }));

  return (
    <div className="overflow-x-clip">
      <BrandHero c={storyCopy} stats={heroStats} />

      <ProblemSection c={storyCopy} bg={bg} />
      <InsightSection c={storyCopy} bg={bg} />
      <SolutionSection c={storyCopy} bg={bg} />

      {/* ===== What you are buying, drawn ===== */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">Where your brand appears</h2>
          <p className="mt-3 leading-relaxed text-muted">
            Two surfaces. One of them cannot be bought anywhere else, because it is inside a Discord
            server rather than next to it.
          </p>
        </div>
        <PlacementMap discordPlacements={live.discordPlacements} webPlacements={live.webPlacements} />
      </section>

      {/* ===== The no-operations argument ===== */}
      <section className="border-y border-violet-500/15 py-20" style={{ background: cardBgStyle(bg, "sec_ops") }}>
        <div className="mx-auto max-w-6xl px-4">
          <OpsSplit
            title="Not a tournament organiser"
            subtitle={`We do not hire match admins, book venues or run production. Software reads each game's own API on a schedule, so ${money(cfg.prizePool, cfg.currency)} of every ${money(cfg.challengePrice, cfg.currency)} challenge reaches the players instead of the people running it.`}
            spend={cfg.challengePrice}
            currency={cfg.currency}
          />
        </div>
      </section>

      {/* ===== THE PLANS ===== */}
      <section id="plans" className="relative py-20 scroll-mt-24" style={{ background: cardBgStyle(bg, "sec_pricing") }}>
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-cyan-200/90 mb-5">
              <Icon name="grid" size={12} /> {copy["pricing.eyebrow"]}
            </div>
            <h2 className="text-3xl md:text-5xl font-bold leading-tight">{copy["pricing.title"]}</h2>
            <p className="text-muted mt-4 leading-relaxed">{copy["pricing.subtitle"]}</p>
          </div>

          <PricingPlans
            cfg={cfg}
            copy={copy}
            games={games.map((g) => ({ slug: g.slug, name: g.name, logoUrl: g.logoUrl, gamers: g.gamers }))}
            reach={network.reach}
            placements={{ total: live.placements, web: live.webPlacements, discord: live.discordPlacements }}
          />

          {/* The add-on, given its own card because it sells on any plan. */}
          <div className="mt-6 glass rounded-3xl p-6 md:p-8 grid md:grid-cols-[1.4fr_1fr] gap-8 items-center border border-amber-400/20">
            <div>
              <div className="inline-flex items-center gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-full px-3 py-1.5">
                <Icon name="play" size={12} /> Add-on · any plan
              </div>
              <h3 className="text-2xl font-bold mt-4">{copy["pricing.addon.name"]}</h3>
              <p className="text-muted mt-2 leading-relaxed">
                {copy["pricing.addon.tagline"]} Every Sunday the week&apos;s Best Profile competition is decided live,
                announced in every server on the network, and cut into clips.
              </p>
              <ul className="mt-4 grid sm:grid-cols-2 gap-2">
                {lines(copy["pricing.addon.features"]).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Icon name="check" size={14} className="mt-1 shrink-0 text-amber-300" />
                    <span className="text-muted leading-snug">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-center rounded-3xl bg-black/30 border border-white/10 p-8">
              <div className="text-5xl font-bold text-amber-300 leading-none">{money(cfg.streamAddon, cfg.currency)}</div>
              <div className="text-xs uppercase tracking-widest text-muted mt-3">per month</div>
              <Link href="/brands" className="pressable mt-6 block rounded-full px-6 py-3 font-semibold bg-amber-500 text-[#1a1200]">
                Add it to a plan
              </Link>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted max-w-2xl mx-auto leading-relaxed">{copy["pricing.note"]}</p>
        </div>
      </section>

      <PrizeSection c={storyCopy} cfg={cfg} bg={bg} />
      <LoopSection c={storyCopy} bg={bg} />

      {/* ===== The games, with their real audiences ===== */}
      {games.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-3xl md:text-4xl font-bold">The games you can own</h2>
            <p className="text-muted mt-3 leading-relaxed">
              One weekly challenge per game, {cfg.challengesPerGame} a month each, {money(perGame(cfg), cfg.currency)} per game per month.
              Gamer counts are linked, verified accounts — read from each game&apos;s own API, never self-reported.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {games.map((g) => (
              <Link key={g.slug} href={`/games/${g.slug}`} className="glass rounded-2xl p-4 text-center card-lift">
                {g.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.logoUrl} alt="" className="h-12 w-12 mx-auto rounded-xl object-contain" />
                ) : (
                  <div className="h-12 w-12 mx-auto rounded-xl bg-violet-500/20 grid place-items-center"><Icon name="gamepad" size={18} /></div>
                )}
                <div className="text-xs font-semibold mt-3 truncate">{g.name}</div>
                <div className="text-[11px] text-cyan-300 mt-1">{nf(g.gamers)} gamers</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ===== The other side of the marketplace ===== */}
      <section className="relative py-20 border-y border-violet-500/15" style={{ background: cardBgStyle(bg, "sec_servers") }}>
        <div className="relative mx-auto max-w-6xl px-4">
          <ServerEarnCards installUrl={install || undefined} compact />
        </div>
      </section>

      {/* ===== What else the budget could buy ===== */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <CompareMatrix
          title="What else you could do with the budget"
          subtitle="Three other ways to reach the same gamers, and where each of them actually wins. The rows we lose are on the table too."
        />
      </section>

      {/* ===== How it's built ===== */}
      <section className="border-y border-sky-500/15 py-20" style={{ background: cardBgStyle(bg, "sec_tech") }}>
        <div className="mx-auto max-w-6xl px-4">
          <TechProofGrid
            cfg={cfg}
            title="Built as software, end to end"
            subtitle="Nothing here is operated by hand. The same architecture serves one server and a thousand."
          />
        </div>
      </section>

      {/* ===== FAQ ===== */}
      {faq.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 py-20">
          <h2 className="text-3xl font-bold text-center mb-8">Questions brands ask</h2>
          <div className="space-y-3">
            {faq.map((f) => (
              <details key={f.q} className="glass rounded-2xl p-5 group">
                <summary className="font-semibold cursor-pointer list-none flex items-center justify-between gap-4">
                  {f.q}
                  <Icon name="chevronDown" size={16} className="text-muted shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="text-sm text-muted mt-3 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* ===== CTA ===== */}
      <section className="mx-auto max-w-4xl px-4 pb-24">
        <div className="glass rounded-3xl p-10 md:p-12 text-center glow-sweep">
          <h2 className="text-3xl md:text-4xl font-bold">
            Start at <span className="brand-text">{money(cfg.reachBase, cfg.currency)}</span>. Own a game from <span className="brand-text">{money(entry.monthly, cfg.currency)}</span>.
          </h2>
          <p className="text-muted mt-4 max-w-xl mx-auto leading-relaxed">
            Take the whole network for {money(full.monthly, cfg.currency)} a month — {nf(full.challengesPerMonth)} challenges,
            every placement, and your name on every competition we run.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/brands" className="brand-btn pressable rounded-full px-8 py-3.5 font-semibold text-white">
              {copy["pricing.cta.primary"]}
            </Link>
            <Link href="/dataroom/company-profile" className="ghost-btn pressable rounded-full px-6 py-3.5">
              {copy["pricing.cta.secondary"]}
            </Link>
          </div>
          <p className="text-xs text-muted mt-6">
            Or email <a href={`mailto:${copy["pricing.contact.email"]}`} className="text-cyan-300 hover:underline">{copy["pricing.contact.email"]}</a>
          </p>
        </div>
      </section>
    </div>
  );
}
