import Link from "next/link";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import BotShowcase from "@/components/BotShowcase";
import { Milestones, GtmStages, TeamGrid, Gallery, MetricTiles, Explainer, CardShowcase } from "@/components/dataroom/Interactive";
import { RaiseSection, UnitSection, SaasSection, MarketSection } from "@/components/dataroom/Investor";
import FinanceModel from "@/components/dataroom/FinanceModel";
import { fillTokens, pricingTokens, type TokenValues } from "@/lib/dataroom/tokens";
import CompareMatrix from "@/components/viz/CompareMatrix";
import OpsSplit from "@/components/viz/OpsSplit";
import PlacementMap from "@/components/viz/PlacementMap";
import TechProofGrid from "@/components/viz/TechProofGrid";
import LoopRing from "@/components/viz/LoopRing";
import { ladder, metricValueFor, INVESTOR_AD_PLACEMENT, type LiveData, type Person, type Section } from "@/lib/dataroom";
import type { BotStep } from "@/components/BotShowcase";
import { optImg } from "@/lib/img";
import { money, perGame, marginPerChallenge, prizeSharePct } from "@/lib/pricing";

const nf = (n: number) => n.toLocaleString();


/**
 * Fill every string in a section from the live rate card. B110.
 *
 * Deep, because the numbers that drifted were not only in `body`: one was a
 * subtitle and one was a `note` inside a use-of-funds row. A filler that only
 * covered the obvious fields would have left the worst of them — a sentence
 * naming the platform fee — untouched.
 *
 * Only `{{token}}` patterns are rewritten, so URLs, colours and class names
 * pass through byte-for-byte.
 */
function fillDeep<T>(value: T, tokens: TokenValues): T {
  if (typeof value === "string") return fillTokens(value, tokens) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, tokens)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = fillDeep(v, tokens);
    return out as T;
  }
  return value;
}

function fillSection(section: Section, tokens: TokenValues): Section {
  return {
    ...section,
    title: fillTokens(section.title, tokens),
    subtitle: section.subtitle === null ? null : fillTokens(section.subtitle, tokens),
    body: section.body === null ? null : fillTokens(section.body, tokens),
    data: fillDeep(section.data, tokens),
  };
}

// One section, drawn.
//
// Every section is a full-bleed band with its own background art and its own
// readability scrim, so a document reads as a deck rather than a long page —
// and so an admin can art-direct each slide independently.

export function SectionBand({ section, doc, live, people, steps, installUrl, index }: {
  section: Section;
  doc: { accent: string; accent2: string; contactEmail: string | null; contactNote: string | null; title: string };
  live: LiveData;
  people: Person[];
  steps: BotStep[];
  installUrl: string | null;
  index: number;
}) {
  const { accent, accent2 } = doc;
  const hero = section.kind === "hero";
  // B110. Every string in the section is filled from the LIVE rate card before
  // anything renders it. One choke point rather than an interpolation in each
  // of twenty render paths — and the reason it has to be all of them is that
  // the drifted numbers were spread across a subtitle, a body, and a `note`
  // buried in a use-of-funds row.
  const filled = fillSection(section, pricingTokens(live.pricing));

  return (
    <section
      id={section.anchor}
      className={`relative overflow-hidden scroll-mt-4 ${hero ? "min-h-[82vh] flex items-center" : "py-16 sm:py-24"}`}
    >
      {/* Background art per slide. Without a scrim, text over real artwork is
          unreadable exactly where the artwork is interesting. */}
      {section.bgUrl && (
        <>
          <div aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${optImg(section.bgUrl, 1200)})` }} />
          <div aria-hidden className="absolute inset-0" style={{ background: `rgba(4,5,26,${Math.max(0, Math.min(100, section.dim)) / 100})` }} />
        </>
      )}
      {!section.bgUrl && index % 2 === 1 && (
        <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${accent}0d, transparent 60%)` }} />
      )}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }} />

      <div className={`relative mx-auto w-full max-w-6xl px-4 ${hero ? "" : "lg:pl-4"}`}>
        <Body section={filled} doc={doc} live={live} people={people} steps={steps} installUrl={installUrl} />
      </div>
    </section>
  );
}

function Heading({ section, accent }: { section: Section; accent: string }) {
  if (!section.title && !section.subtitle) return null;
  return (
    <div className="max-w-3xl mb-8">
      <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: accent }}>{section.navLabel}</div>
      {section.title && <h2 className="text-3xl sm:text-5xl font-black leading-[1.1]">{section.title}</h2>}
      {section.subtitle && <p className="text-muted mt-4 text-base sm:text-lg leading-relaxed">{section.subtitle}</p>}
    </div>
  );
}

function Prose({ body }: { body: string | null }) {
  if (!body) return null;
  return (
    <div className="max-w-3xl space-y-4">
      {body.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="text-base leading-relaxed text-ink/90">{p}</p>
      ))}
    </div>
  );
}

function Body({ section, doc, live, people, steps, installUrl }: {
  section: Section;
  doc: { accent: string; accent2: string; contactEmail: string | null; contactNote: string | null; title: string };
  live: LiveData;
  people: Person[];
  steps: BotStep[];
  installUrl: string | null;
}) {
  const { accent, accent2 } = doc;
  const d = section.data;

  switch (section.kind) {
    case "hero":
      return (
        <div className="max-w-4xl py-10">
          {d.badge && (
            <span className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs uppercase tracking-widest"
              style={{ borderColor: `${accent}66`, color: accent, background: `${accent}14` }}>
              <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: accent }} />
              {d.badge}
            </span>
          )}
          <h1 className="text-4xl sm:text-7xl font-black leading-[1.02] mt-6">{section.title}</h1>
          {section.subtitle && (
            <p className="text-muted mt-6 text-lg sm:text-xl leading-relaxed max-w-2xl">{section.subtitle}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-9">
            {d.ctaLabel && d.ctaHref && (
              <a href={d.ctaHref} className="pressable rounded-full px-7 py-3.5 font-bold text-white"
                style={{ background: accent, boxShadow: `0 12px 32px -14px ${accent}` }}>
                {d.ctaLabel}
              </a>
            )}
            <a href="#contact" className="ghost-btn pressable rounded-full px-7 py-3.5 font-semibold">Get in touch</a>
          </div>

          {/* The headline numbers, in the hero, live. A deck that opens with a
              claim it can't evidence spends the rest of itself recovering. */}
          <div className="flex flex-wrap gap-x-8 gap-y-4 mt-12">
            <HeroFact value={nf(live.network.reach)} label="gamers reachable" accent={accent2} />
            <HeroFact value={nf(live.network.servers)} label="servers running the bot" accent={accent2} />
            <HeroFact value={nf(live.network.games)} label="games synced" accent={accent2} />
          </div>
        </div>
      );

    case "text":
      return (
        <>
          <Heading section={section} accent={accent} />
          <Prose body={section.body} />
          {d.bullets && d.bullets.length > 0 && (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-8">
              {d.bullets.map((b, i) => (
                <li key={i} className="glass rounded-2xl p-5 text-sm leading-relaxed">
                  <span className="grid h-7 w-7 place-items-center rounded-full text-xs font-black mb-3"
                    style={{ background: `${accent}26`, color: accent }}>{i + 1}</span>
                  {b}
                </li>
              ))}
            </ul>
          )}
        </>
      );

    case "traction":
      return (
        <>
          <Heading section={section} accent={accent} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <BigStat value={live.network.reach} label="Gamers reachable" hint="Combined membership of every server running the bot" accent={accent2} />
            <BigStat value={live.network.servers} label="Servers" hint="Communities that installed it themselves" accent={accent2} />
            <BigStat value={live.network.linked} label="Verified accounts" hint="Members who linked a game we can read" accent={accent2} />
            <BigStat value={live.network.games} label="Games" hint="Official API integrations, not scrapes" accent={accent2} />
          </div>
          <LiveNote takenAt={live.takenAt} />
        </>
      );

    case "milestones": {
      const value = metricValueFor(d.metric ?? "reach", live);
      const targets = d.targets?.length ? d.targets : [1_000, 10_000, 100_000, 1_000_000];
      const label = d.metric === "linked" ? "verified gamers"
        : d.metric === "servers" ? "servers"
          : d.metric === "gamers" ? "Cluster profiles"
            : "monthly active audience";
      return (
        <>
          <Heading section={section} accent={accent} />
          <Milestones ladder={ladder(value, targets)} label={label} accent={accent} accent2={accent2} />
          <LiveNote takenAt={live.takenAt} />
        </>
      );
    }

    case "gtm":
      return (
        <>
          <Heading section={section} accent={accent} />
          <GtmStages stages={d.stages ?? []} accent={accent} accent2={accent2} />
        </>
      );

    case "product":
      return (
        <>
          <Heading section={section} accent={accent} />
          {steps.length > 1 ? (
            <div className="-mx-4 sm:mx-0">
              <BotShowcase steps={focusSteps(steps, d.focus)} installUrl={installUrl} bare />
            </div>
          ) : (
            <p className="text-sm text-muted">The live demo needs a game and a profile in the database to draw from.</p>
          )}
        </>
      );

    case "explainer":
      return (
        <>
          <Heading section={section} accent={accent} />
          <Explainer steps={d.steps ?? []} loop={d.loop} accent={accent} accent2={accent2} />
        </>
      );

    case "showcase":
      return (
        <>
          <Heading section={section} accent={accent} />
          <CardShowcase cards={showcaseCards(d.cards)} accent={accent} />
        </>
      );

    case "servers":
      return (
        <>
          <Heading section={section} accent={accent} />
          {live.servers.length === 0 ? (
            <p className="text-sm text-muted">No servers have installed the bot yet — this fills in the moment one does.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {live.servers.map((s) => (
                <Link key={s.guildId} href={s.slug ? `/servers/${s.slug}` : "/servers"}
                  className="glass rounded-2xl p-4 text-center transition hover:ring-1 hover:ring-white/25">
                  {s.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.iconUrl} alt="" className="h-12 w-12 rounded-xl object-cover mx-auto" />
                  ) : (
                    <div className="h-12 w-12 rounded-xl grid place-items-center mx-auto text-xl" style={{ background: `${accent}26` }}><Icon name="satellite" size={20} className="text-violet-200" /></div>
                  )}
                  <div className="font-semibold text-xs mt-2 truncate">{s.name}</div>
                  <div className="text-[10px] text-muted">{nf(s.memberCount)} members</div>
                </Link>
              ))}
            </div>
          )}
          <LiveNote takenAt={live.takenAt} />
        </>
      );

    case "tiers":
      return (
        <>
          <Heading section={section} accent={accent} />
          <div className="grid sm:grid-cols-3 gap-3">
            {live.tiers.map((t) => (
              <div key={t.key} className="glass rounded-2xl p-5">
                <Icon name={t.icon} size={28} style={{ color: accent2 }} />
                <div className="font-bold mt-2">{t.name}</div>
                <div className="text-xs mt-0.5" style={{ color: accent2 }}>
                  {nf(t.threshold)}+ verified members · {t.share}% of the pool
                </div>
                <div className="text-xs font-semibold mt-3">{t.unlocks}</div>
                <p className="text-xs text-muted mt-1.5 leading-snug">{t.detail}</p>
              </div>
            ))}
          </div>
        </>
      );

    case "pricing": {
      // The rate card, read from the same config the pricing page charges from.
      //
      // This is the one slide a reader will check against reality, so it is the
      // last one that can be allowed to go stale. Nothing here is typed into the
      // deck — change a price in Admin → Site content and this slide changes.
      const p = live.pricing;
      const { entry, full } = live.quotes;
      // ONE package. B118 removed the three-tier shells from the pricing page;
      // a deck that still shows an investor a Reach plan and an Ultimate plan
      // is showing them revenue lines that do not exist.
      const plans = [
        { name: "One game", price: entry.monthly, note: `${money(perGame(p), p.currency)} per game. ${p.challengesPerGame} sponsored challenges a month, with naming rights on that game's weekly competition.`, detail: "Entry" },
        { name: `All ${p.games} games`, price: full.monthly, note: `${full.challengesPerMonth} challenges a month across the network. Same per-game rate — there is no volume tier, and no base fee under either.`, detail: "The whole network" },
        { name: "Custom", price: 0, note: "More weeks, mixed games, or anything off the rate card. An operator builds it and the brand confirms it in their own portal.", detail: "Anything larger" },
      ];
      return (
        <>
          <Heading section={section} accent={accent} />
          <div className="grid sm:grid-cols-3 gap-3">
            {plans.map((pl, i) => (
              <div key={pl.name} className={`glass rounded-2xl p-5 ${i === 1 ? "ring-1" : ""}`} style={i === 1 ? { borderColor: accent2 } : undefined}>
                <div className="text-[11px] uppercase tracking-widest" style={{ color: accent2 }}>{pl.detail}</div>
                <div className="font-bold text-lg mt-1.5">{pl.name}</div>
                <div className="text-3xl font-black mt-2">
                  {pl.price > 0 ? <>{money(pl.price, p.currency)}<span className="text-sm font-normal text-muted">/mo</span></> : <span className="text-muted">Quoted</span>}
                </div>
                <p className="text-xs text-muted mt-2.5 leading-snug">{pl.note}</p>
              </div>
            ))}
          </div>
          {/* The unit, so the margin question is answered before it's asked. */}
          <div className="grid sm:grid-cols-4 gap-3 mt-4">
            <PriceFact label="charged per sponsored challenge" value={money(p.challengePrice, p.currency)} accent={accent2} />
            <PriceFact label="paid out to the winners" value={money(p.prizePool, p.currency)} accent={accent2} />
            <PriceFact label="gross margin per challenge" value={money(marginPerChallenge(p), p.currency)} accent={accent2} />
            <PriceFact label={`of brand spend reaches players (${nf(p.games * p.challengesPerGame)} challenges a month)`} value={`${prizeSharePct(p)}%`} accent={accent2} />
          </div>
          <p className="text-xs text-muted mt-4 max-w-2xl leading-relaxed">
            Prizes are paid as trophies carrying the sponsor&apos;s brand, one to ten places deep at the
            buyer&apos;s choice — {money(p.prize1, p.currency)}, {money(p.prize2, p.currency)} and{" "}
            {money(p.prize3, p.currency)} on a three-place podium. Annual is {Math.round(p.yearlyDiscountPct)}% off,
            and the Sunday broadcast sponsorship comes with the package rather than being sold on top.
            Every figure here is read from the live rate card, not written into this document.
          </p>
          <LiveNote takenAt={live.takenAt} />
        </>
      );
    }

    case "logos": {
      // An empty logo wall on the "games we sync" section fills itself from the
      // real catalogue rather than sitting blank waiting for an admin.
      const logos = d.logos?.length ? d.logos : null;
      return (
        <>
          <Heading section={section} accent={accent} />
          {logos ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {logos.map((l, i) => (
                <div key={i} className="glass rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2 min-h-[104px]">
                  {l.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.logoUrl} alt={l.name} className="h-10 w-10 object-contain" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-xl text-sm font-black" style={{ background: `${accent}26`, color: accent }}>
                      {l.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold leading-tight">{l.name}</span>
                  {l.note && <span className="text-[10px] text-muted">{l.note}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Add logos in Admin → Data room. {live.network.games > 0 && `We currently sync ${live.network.games} games.`}
            </p>
          )}
        </>
      );
    }

    case "gallery":
      return (
        <>
          <Heading section={section} accent={accent} />
          {d.images?.length
            ? <Gallery images={d.images} accent={accent} />
            : <p className="text-sm text-muted">Add images in Admin → Data room.</p>}
        </>
      );

    case "team":
      return (
        <>
          <Heading section={section} accent={accent} />
          <TeamGrid people={people} accent={accent} />
        </>
      );

    case "metrics": {
      const keys = d.metricKeys ?? [];
      const chosen = live.metricDefs
        .filter((m) => keys.includes(m.key))
        .map((m) => ({ key: m.key, label: m.label, value: live.metrics[m.key] ?? 0, definition: m.definition }));
      return (
        <>
          <Heading section={section} accent={accent} />
          {chosen.length
            ? <MetricTiles metrics={chosen} accent={accent} />
            : <p className="text-sm text-muted">Pick which metrics to show in Admin → Data room.</p>}
          <LiveNote takenAt={live.takenAt} />
        </>
      );
    }

    case "faq":
      return (
        <>
          <Heading section={section} accent={accent} />
          <div className="max-w-3xl space-y-3">
            {(d.qa ?? []).map((x, i) => (
              <details key={i} className="glass rounded-2xl p-5 group">
                <summary className="cursor-pointer font-semibold text-sm flex items-center justify-between gap-3">
                  {x.q}
                  <Icon name="chevronDown" size={15} className="shrink-0 text-muted transition group-open:rotate-180" />
                </summary>
                <p className="text-sm text-muted mt-3 leading-relaxed">{x.a}</p>
              </details>
            ))}
          </div>
        </>
      );

    case "ad":
      return (
        <>
          <Heading section={section} accent={accent} />
          <div className="glass rounded-3xl p-5 sm:p-8">
            <AdSlot placement={d.placement || INVESTOR_AD_PLACEMENT} />
            <p className="text-[11px] text-muted mt-4">
              Live slot, real rotation, impressions counted the same way every placement on the network is.
            </p>
          </div>
        </>
      );

    // ===== The investor set =====

    case "raise":
      return (
        <>
          <Heading section={section} accent={accent} />
          <RaiseSection d={d} accent={accent} />
        </>
      );

    case "unit":
      return (
        <>
          <Heading section={section} accent={accent} />
          <UnitSection d={d} accent={accent} pricing={live.pricing} />
        </>
      );

    // The model itself, not a picture of it. Assumptions are sliders, so a
    // reader who disagrees with a number can move it and see the consequence
    // instead of arguing with a static table.
    case "finance":
      return (
        <>
          <Heading section={section} accent={accent} />
          <FinanceModel initial={live.finance} pricing={live.pricing} accent={accent} />
        </>
      );

    case "saas":
      return (
        <>
          <Heading section={section} accent={accent} />
          <SaasSection d={d} live={live.commercial} accent={accent} />
          <LiveNote takenAt={live.takenAt} />
        </>
      );

    case "market":
      return (
        <>
          <Heading section={section} accent={accent} />
          <MarketSection d={d} accent={accent} />
        </>
      );

    case "compare":
      return (
        <>
          <Heading section={section} accent={accent} />
          <CompareMatrix />
        </>
      );

    case "ops":
      return (
        <>
          <Heading section={section} accent={accent} />
          <OpsSplit spend={live.pricing.challengePrice} currency={live.pricing.currency} />
        </>
      );

    case "placements":
      return (
        <>
          <Heading section={section} accent={accent} />
          <PlacementMap
            discordPlacements={live.commercial.placements.discord}
            webPlacements={live.commercial.placements.web}
          />
        </>
      );

    case "tech":
      return (
        <>
          <Heading section={section} accent={accent} />
          <TechProofGrid cfg={live.pricing} />
        </>
      );

    case "loop":
      return (
        <>
          <Heading section={section} accent={accent} />
          <LoopRing accent={accent} />
        </>
      );

    case "contact":
      return (
        <>
          <Heading section={section} accent={accent} />
          <div className="glass rounded-3xl p-7 sm:p-10 max-w-2xl">
            {doc.contactNote && <p className="text-base leading-relaxed">{doc.contactNote}</p>}
            <div className="flex flex-wrap gap-3 mt-7">
              {doc.contactEmail && (
                <a href={`mailto:${doc.contactEmail}?subject=${encodeURIComponent(doc.title)}`}
                  className="pressable rounded-full px-7 py-3 font-bold text-white"
                  style={{ background: accent, boxShadow: `0 12px 32px -14px ${accent}` }}>
                  {doc.contactEmail}
                </a>
              )}
              <Link href="/discord-bot" className="ghost-btn pressable rounded-full px-7 py-3 font-semibold">
                See the product
              </Link>
            </div>
            {d.linkLabel && d.linkHref && (
              <a href={d.linkHref} className="inline-block text-sm mt-5 hover:underline" style={{ color: accent }}>
                {d.linkLabel} →
              </a>
            )}
          </div>
        </>
      );

    default:
      return null;
  }
}

// Which slice of the live demo this section is about. A "challenges" section
// should open on a challenge, not on the welcome card.
// The real cards, requested live from the renderer that serves Discord.
//
// `preview=1` fills in the identifiers from actual platform data, so a section
// can ask for "a challenge card" without the deck having to know which
// challenge — and can never end up showing one that was deleted.
function showcaseCards(cards: { kind: string; caption?: string }[] | undefined) {
  const chosen = cards?.length ? cards : DEFAULT_SHOWCASE;
  return chosen.map((c) => ({
    ...c,
    url: `/api/card/${encodeURIComponent(c.kind)}?preview=1`,
  }));
}

// What "everything we built" looks like when nobody has picked: one card from
// each of the four things the product actually is.
const DEFAULT_SHOWCASE = [
  { kind: "profile", caption: "A gamer's profile — their own art, their trophies, every game they play" },
  { kind: "planet", caption: "A game world — live challenges, standings, and who's ranked on it" },
  { kind: "challenge", caption: "A live challenge — stats snapshotted on join, trophies with real value" },
  { kind: "leaderboard", caption: "A leaderboard, straight from the game's official API" },
];

function focusSteps(steps: BotStep[], focus?: string): BotStep[] {
  const first: Record<string, string> = {
    profile: "profile", challenges: "challenge", leaderboards: "leaderboard",
    quests: "cp", portal: "start", bot: "start",
  };
  const wanted = focus ? first[focus] : undefined;
  if (!wanted) return steps;
  const i = steps.findIndex((s) => s.id === wanted);
  if (i <= 0) return steps;
  // Rotate rather than filter: every step stays reachable, but the one the
  // section is about is the one you land on.
  return [steps[i], ...steps.slice(0, i), ...steps.slice(i + 1)];
}

function HeroFact({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div>
      <div className="text-3xl font-black tabular-nums" style={{ color: accent }}>{value}</div>
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  );
}

function BigStat({ value, label, hint, accent }: { value: number; label: string; hint: string; accent: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-3xl sm:text-4xl font-black tabular-nums" style={{ color: accent }}>{nf(value)}</div>
      <div className="text-sm font-semibold mt-1">{label}</div>
      <div className="text-[11px] text-muted mt-1 leading-snug">{hint}</div>
    </div>
  );
}

// Said on every live section, because a number without a timestamp is a claim
// and a number with one is evidence.
function LiveNote({ takenAt }: { takenAt: string }) {
  return (
    <p className="text-[11px] text-muted mt-5 inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Counted from production at {new Date(takenAt).toUTCString()} — refresh for the current figure.
    </p>
  );
}

function PriceFact({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-black/25 border border-white/10 p-4">
      <div className="text-2xl font-black leading-none" style={{ color: accent }}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted mt-2 leading-snug">{label}</div>
    </div>
  );
}
