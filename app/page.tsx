import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getContent } from "@/lib/cms";
import GameLogo from "@/components/GameLogo";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import HeroStage from "@/components/HeroStage";
import QuestCard from "@/components/QuestCard";
import OAuthButtons from "@/components/OAuthButtons";
import { buildSkinnedPlanets } from "@/lib/planets";
import { getQuestHeroData } from "@/lib/quest-hero";
import { getUserQuests, getQuestTops } from "@/lib/quests";
import { buildCardBgMap, cardBgCmsKeys, cardBgStyle } from "@/lib/card-bg";
import { getT } from "@/lib/i18n/t-server";
import { slimImg } from "@/lib/img";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const db = await getDb();
  const viewer = await getCurrentUser();
  const skinnedPlanets = await buildSkinnedPlanets(db);

  // Quest hero data — the homepage toggle can swap the planet globe for the
  // primary quest's treasure map without leaving the page.
  const questHero = await getQuestHeroData(db, viewer?.id ?? null);
  // Full quests + CP tops for the "Chart your quests" card grid.
  const homeQuests = await getUserQuests(db, viewer?.id ?? null);
  const questTops = await getQuestTops(db, homeQuests.map((q) => q.id), 6);
  const c = await getContent([
    "hero.badge", "hero.title.line1", "hero.title.line2", "hero.subtitle",
    "hero.cta.primary", "hero.cta.secondary", "hero.image",
    "section.challenges.title", "section.challenges.subtitle",
    "section.games.title", "section.games.subtitle",
    "section.badges.title", "section.badges.subtitle",
    "section.partners.title",
    "section.cta.title", "section.cta.subtitle", "section.cta.button",
    "banner.arena",
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
  const { tr } = await getT();
  const statCards = [
    { n: counts.users, label: tr("Gamers"), icon: "users" },
    { n: counts.accounts, label: tr("Linked accounts"), icon: "link" },
    { n: counts.games, label: tr("Games"), icon: "gamepad" },
    { n: counts.challenges, label: tr("Challenges"), icon: "zap" },
  ];

  return (
    <div className="overflow-x-clip">
      {/* ===== INTERACTIVE HERO — planet globe ⇄ quest map toggle ===== */}
      {skinnedPlanets.length > 0 && (
        <HeroStage planets={skinnedPlanets} initialSlug={skinnedPlanets[0].slug} heading={tr("The Cluster galaxy — pick a game")} quest={questHero} />
      )}

      {/* ===== HERO ===== */}
      {skinnedPlanets.length > 0 ? (
        // The interactive globe above is the hero. Keep only a slim guest CTA
        // and the platform numbers — the old marketing hero is retired.
        <section className="mx-auto max-w-6xl px-4 pt-2 pb-14">
          {!viewer && (
            <div className="flex flex-col items-center gap-4 mb-12 text-center">
              <p className="text-lg text-muted max-w-xl">{c["hero.subtitle"]}</p>
              <div className="w-full max-w-xs"><OAuthButtons next="/onboarding" /></div>
              <Link href="/leaderboards" className="text-sm text-cyan-300 hover:underline">{c["hero.cta.secondary"]} →</Link>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-3xl mx-auto">
            {statCards.map((s) => (
              <div key={s.label} className="glass card-lift px-4 py-4 text-center">
                <Icon name={s.icon} size={16} className="text-violet-300 mb-1.5" />
                <div className="text-3xl font-bold grad-text">{Number(s.n).toLocaleString()}</div>
                <div className="text-xs uppercase tracking-widest text-muted mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="relative">
          <div className="absolute inset-0 -z-10 bg-cover bg-center opacity-80" style={{ backgroundImage: `url(${c["hero.image"]})` }} />
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
          <div className="absolute inset-0 -z-10 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${c["banner.arena"]})` }} />
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
                        style={{ backgroundImage: `url(${challenge.coverUrl ?? c["banner.arena"]})` }}
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
                      style={{ backgroundImage: `url(${cover})`, backgroundPosition: `${g.coverAdjust?.x ?? 50}% ${g.coverAdjust?.y ?? 50}%` }} />
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
      {homeQuests.length > 0 && (
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
            {homeQuests.map((q) => <QuestCard key={q.id} quest={q} top={questTops.get(q.id) ?? []} />)}
          </div>
          <div className="mt-8 text-center">
            <Link href="/quests" className="ghost-btn pressable rounded-full px-6 py-2.5 text-sm inline-flex items-center gap-2">
              {tr("Explore all quests")} <Icon name="arrowRight" size={15} />
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

      {/* ===== CTA ===== */}
      <section className="mx-auto max-w-4xl px-4 py-24 text-center">
        <div className="glass p-12 relative overflow-hidden glow-sweep">
          <h2 className="text-3xl md:text-4xl font-bold">
            {c["section.cta.title"].split(",")[0]}, <span className="grad-text">{c["section.cta.title"].split(",")[1]?.trim() ?? "one link"}</span>
          </h2>
          <p className="text-muted mt-4 max-w-md mx-auto">{c["section.cta.subtitle"]}</p>
          <Link href="/signup" className="glow-btn pressable mt-8 inline-block rounded-full px-10 py-4 font-semibold text-white text-lg">
            {c["section.cta.button"]}
          </Link>
        </div>
      </section>
    </div>
  );
}
