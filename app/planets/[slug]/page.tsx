import Link from "next/link";
import type { Metadata } from "next";
import { cardMeta } from "@/lib/og";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import GameLogo from "@/components/GameLogo";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import LeaderboardWidget from "@/components/LeaderboardWidget";
import JoinSpaceButton from "@/components/JoinSpaceButton";
import HeroStage from "@/components/HeroStage";
import GameDirectory from "@/components/GameDirectory";
import ChallengePointsButton from "@/components/ChallengeLog";
import Countdown from "@/components/Countdown";
import { getContent } from "@/lib/cms";
import { timeAgo } from "@/lib/utils";
import { slimImg, optImg } from "@/lib/img";
import { buildSkinnedPlanets } from "@/lib/planets";
import { getPlanetExplore } from "@/lib/planet-explore";
import { getT } from "@/lib/i18n/t-server";
import OAuthButtons from "@/components/OAuthButtons";

export const dynamic = "force-dynamic";

// A "planet" is a community (space) — and, when it's tied to a game, it also
// surfaces that game's cover, standings and players. One page for everything
// about a game: the merge of the old game hub + community space.
// The planet's own card previews a planet link — its live challenges, its
// board and its top gamer, rather than the same site cover every other page
// used to show.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const db = await getDb();
  const [space] = await db.select().from(schema.spaces).where(eq(schema.spaces.slug, slug)).limit(1);
  if (!space) return {};
  const game = space.game || space.name;
  return {
    title: space.name,
    description: space.description || `Challenges, leaderboards and gamers on ${space.name}.`,
    ...cardMeta("planet", { game }, `${space.name} on Cluster`),
  };
}

export default async function PlanetPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stat?: string }>;
}) {
  const { slug } = await params;
  const { stat } = await searchParams;
  const db = await getDb();

  const [space] = await db.select().from(schema.spaces).where(eq(schema.spaces.slug, slug)).limit(1);
  if (!space || !space.isActive) notFound();

  const viewer = await getCurrentUser();
  const [game] = space.game
    ? await db.select().from(schema.games).where(eq(schema.games.name, space.game)).limit(1)
    : [];

  const gameProviders = game ? PROVIDERS.filter((p) => p.game === game.name) : [];
  const providerIds = gameProviders.map((p) => p.id);
  const cms = await getContent(["banner.games", "banner.arena"]);

  const [membership, challenges, boards, players] = await Promise.all([
    viewer
      ? db.select().from(schema.spaceMembers).where(and(
          eq(schema.spaceMembers.spaceId, space.id), eq(schema.spaceMembers.userId, viewer.id))).limit(1)
      : Promise.resolve([]),
    db.select().from(schema.challenges).where(and(
      eq(schema.challenges.spaceId, space.id), inArray(schema.challenges.status, ["active", "completed"])))
      .orderBy(desc(schema.challenges.startAt)).limit(6),
    game
      ? db.select().from(schema.leaderboards).where(and(
          eq(schema.leaderboards.game, game.name), eq(schema.leaderboards.isActive, true)))
      : Promise.resolve([]),
    providerIds.length
      ? db.selectDistinct({ user: schema.publicUserColumns, inGameName: schema.linkedGameAccounts.inGameName })
          .from(schema.linkedGameAccounts)
          .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
          .where(and(inArray(schema.linkedGameAccounts.provider, providerIds), eq(schema.users.status, "active")))
          .limit(12)
      : Promise.resolve([]),
  ]);

  const path = `/planets/${space.slug}`;
  const cover = slimImg(game?.coverUrl, 400000) ?? cms["banner.games"];
  const activeChallenges = challenges.filter((c) => c.status === "active");

  // Live standings for each challenge on this planet (its own leaderboard).
  const challengeIds = challenges.map((c) => c.id);
  const parts = challengeIds.length
    ? await db.select({
        challengeId: schema.challengeParticipants.challengeId,
        points: schema.challengeParticipants.currentPoints,
        placement: schema.challengeParticipants.finalPlacement,
        name: schema.users.displayName,
        slug: schema.users.slug,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .where(and(inArray(schema.challengeParticipants.challengeId, challengeIds),
        eq(schema.challengeParticipants.status, "active")))
      .orderBy(desc(schema.challengeParticipants.currentPoints))
      .limit(200)
    : [];
  const topByChallenge = new Map<string, typeof parts>();
  for (const p of parts) {
    const arr = topByChallenge.get(p.challengeId) ?? [];
    if (arr.length < 5) { arr.push(p); topByChallenge.set(p.challengeId, arr); }
  }

  // ===== Completed challenges, with their final standings (B12) =====
  //
  // A finished competition is the only evidence that the scoring is real: who
  // placed where, on what metric, with what figure. It used to be visible only
  // while a challenge was RUNNING — which is precisely backwards, because a
  // live board is a board that can still change and a settled one cannot.
  //
  // Its own query rather than a filter over `parts`: that one is scoped to
  // `status = "active"` participants, which is exactly the set a finished
  // challenge no longer has.
  const completedChallenges = challenges.filter((c) => c.status === "completed");
  const finalIds = completedChallenges.map((c) => c.id);
  const finals = finalIds.length
    ? await db.select({
        challengeId: schema.challengeParticipants.challengeId,
        points: schema.challengeParticipants.currentPoints,
        placement: schema.challengeParticipants.finalPlacement,
        name: schema.users.displayName,
        slug: schema.users.slug,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .where(inArray(schema.challengeParticipants.challengeId, finalIds))
      .orderBy(desc(schema.challengeParticipants.currentPoints))
      .limit(300)
    : [];
  const finalByChallenge = new Map<string, typeof finals>();
  for (const f of finals) {
    const arr = finalByChallenge.get(f.challengeId) ?? [];
    arr.push(f);
    finalByChallenge.set(f.challengeId, arr);
  }
  // Placement wins over points where staff recorded one — a podium can be
  // corrected after the fact, and the correction is the truth.
  for (const [, arr] of finalByChallenge) {
    arr.sort((a, b) => {
      if (a.placement && b.placement) return a.placement - b.placement;
      if (a.placement) return -1;
      if (b.placement) return 1;
      return b.points - a.points;
    });
  }

  // Interactive planet hero for games that have a skin (falls back to the flat
  // cover hero otherwise). Admin can force the layout per planet.
  const layout = game?.planetLayout ?? "auto";
  const hasSkin = layout === "cover" ? false : (layout === "globe" ? !!game?.planetImageUrl : !!game?.planetImageUrl);
  const pAccent = game?.accent || "#8b5cf6";
  const pAccent2 = game?.accent2 || "#22d3ee";
  const { te } = await getT(viewer?.locale);
  // Localize the current planet's name in the skinned-planets list (the hero
  // heading + toggle read from it).
  const skinnedPlanetsRaw = hasSkin ? await buildSkinnedPlanets(db) : [];
  const skinnedPlanets = skinnedPlanetsRaw.map((p) => p.slug === space.slug ? { ...p, name: te("planet", space.id, "name", p.name) } : p);
  const planetExplore = hasSkin && skinnedPlanets.length > 0 ? await getPlanetExplore(db, space.slug, te) : null;

  return (
    <div>
      {hasSkin && skinnedPlanets.length > 0 ? (
        <>
          <HeroStage planets={skinnedPlanets} initialSlug={space.slug} swap={false} explore={planetExplore} />
          <div className="mx-auto max-w-6xl px-4 -mt-2 mb-4 flex flex-wrap items-center gap-3">
            <p className="text-muted text-sm mr-auto">{te("planet", space.id, "description", space.description)}</p>
            {gameProviders.map((p) => (
              <span key={p.id} className={`text-xs rounded-full px-2.5 py-1 border ${isProviderLive(p) ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/30 text-amber-300/80"}`}>
                {p.name} {isProviderLive(p) ? "· live" : "· key ready"}
              </span>
            ))}
            {game && (
              <Link href="/profile" className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white">
                Link my {game.name} account
              </Link>
            )}
            {viewer && <JoinSpaceButton spaceId={space.id} isMember={membership.length > 0} path={path} />}
          </div>
        </>
      ) : (
      /* ===== Flat cover hero (non-skinned planets) ===== */
      <section className="relative">
        <div
          className="absolute inset-0 -z-10 bg-cover opacity-60"
          style={{
            backgroundImage: `url(${optImg(cover, 1200)})`,
            backgroundPosition: game ? `${game.coverAdjust.x}% ${game.coverAdjust.y}%` : "center",
          }}
        />
        <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(1000px 500px at 20% -10%, ${pAccent}26, transparent 60%), linear-gradient(to bottom, rgba(4,5,26,0.3), rgba(4,5,26,0.7) 60%, #04051a)` }} />
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-12 flex flex-wrap items-end gap-5">
          {game
            ? <GameLogo logoUrl={game.logoUrl} name={game.name} size={84} className="pulse-glow" />
            : <div className="flex h-20 w-20 items-center justify-center rounded-2xl border" style={{ borderColor: `${pAccent}55`, background: `linear-gradient(135deg, ${pAccent}4d, ${pAccent2}33)` }}><Icon name="planet" size={38} className="text-violet-200" /></div>}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-widest mb-1 inline-flex items-center gap-1.5" style={{ color: pAccent2 }}>
              <Icon name="planet" size={12} /> Planet
            </div>
            <h1 className="text-3xl md:text-5xl font-bold">{space.name}</h1>
            <p className="text-muted mt-2 max-w-xl">{space.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><Icon name="users" size={12} /> {space.memberCount} members</span>
              {gameProviders.map((p) => (
                <span key={p.id} className={`rounded-full px-2.5 py-1 border ${isProviderLive(p) ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/30 text-amber-300/80"}`}>
                  {p.name} {isProviderLive(p) ? "· live" : "· key ready"}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 items-stretch">
            {game && (
              <Link href="/profile" className="glow-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold text-white text-center">
                Link my {game.name} account
              </Link>
            )}
            {viewer && <JoinSpaceButton spaceId={space.id} isMember={membership.length > 0} path={path} />}
          </div>
        </div>
      </section>
      )}

      <div className="mx-auto max-w-6xl px-4">
        <AdSlot placement="games_top_banner" className="mb-10" />

        {/* Live challenge banners — with cover art + live countdown */}
        {activeChallenges.map((c) => {
          const cover = slimImg(c.coverUrl) ?? slimImg(game?.coverUrl ?? null);
          return (
            <Link
              key={c.id}
              href={`${path}/challenges/${c.id}`}
              className="card-lift mb-6 relative block overflow-hidden rounded-2xl border border-cyan-400/40"
            >
              <div className="relative min-h-[7rem] flex flex-wrap items-center gap-4 p-5">
                {cover ? (
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${optImg(cover, 1200)})` }} />
                ) : (
                  <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: "url(/assets/ambient.png)" }} />
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(4,5,26,0.92), rgba(4,5,26,0.6))" }} />
                <Icon name="zap" size={28} className="relative text-amber-300 shrink-0" />
                <div className="relative min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-cyan-300 inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live challenge · <Countdown endsAt={c.endAt.toISOString()} prefix="ends in " />
                  </div>
                  <div className="font-bold text-lg drop-shadow">{c.title}</div>
                  <div className="text-xs text-white/70 truncate">{c.prizeDescription}</div>
                </div>
                <span className="relative glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white">Compete</span>
              </div>
            </Link>
          );
        })}

        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-12">
            {/* ===== Settled challenges (B12) =====
                The hero above carries only what is LIVE. Everything that has
                finished lands here with its final placements, the metric it was
                scored on and the figure each placement reached — which is the
                only public proof that the scoring is real, and which used to be
                visible only while a challenge was still running. */}
            <section>
              <div className="flex items-center justify-between gap-3 mb-1">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Icon name="trophy" size={20} className="text-amber-300" /> Settled challenges
                </h2>
                {completedChallenges.length > 0 && (
                  <span className="text-xs text-muted shrink-0">{completedChallenges.length} finished</span>
                )}
              </div>
              <p className="text-xs text-muted mb-4">
                Every competition that has ended on this planet, with the standings it ended on. Nothing here can change.
              </p>
              {completedChallenges.length === 0 ? (
                /* An honest empty state, not a gap. A planet whose first
                   challenge has not finished yet should say so — a blank space
                   reads as a section that failed to load. */
                <div className="rounded-2xl border border-dashed border-violet-400/25 p-6 text-center">
                  <Icon name="trophy" size={22} className="text-violet-300/60 mb-2" />
                  <div className="text-sm text-muted">
                    No challenge has finished on this planet yet.
                    {activeChallenges.length > 0
                      ? " The one running now will settle here when it ends."
                      : " When one runs and ends, its final standings land here."}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {completedChallenges.map((c) => {
                    const standings = finalByChallenge.get(c.id) ?? [];
                    // What it was scored on, in the words the challenge itself
                    // used. `pointsEngine` is `{ metric: weight }`, so its keys
                    // are the metrics that earned points.
                    const metrics = Object.keys((c.pointsEngine ?? {}) as Record<string, number>);
                    return (
                      <div key={c.id} className="rounded-2xl border border-white/10 overflow-hidden">
                        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-black/20 px-4 py-3">
                          <Link href={`${path}/challenges/${c.id}`} className="font-bold hover:text-cyan-300 min-w-0 truncate">{c.title}</Link>
                          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted shrink-0">Ended</span>
                          {metrics.length > 0 && (
                            <span className="text-[11px] text-muted shrink-0">
                              Scored on <b className="text-ink">{metrics.map((m) => m.replace(/_/g, " ")).join(" + ")}</b>
                            </span>
                          )}
                          {c.prizeDescription && <span className="text-[11px] text-emerald-300 shrink-0 ml-auto">{c.prizeDescription}</span>}
                        </div>
                        {standings.length === 0 ? (
                          <div className="px-4 py-4 text-xs text-muted">No entrants were recorded for this one.</div>
                        ) : (
                          <ol className="divide-y divide-white/5">
                            {standings.slice(0, 5).map((r, i) => (
                              <li key={r.slug} className="flex items-center gap-3 px-4 py-2.5">
                                <span className={`w-6 shrink-0 text-center text-sm font-black ${i === 0 ? "text-amber-300" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-300" : "text-muted"}`}>
                                  {r.placement ?? i + 1}
                                </span>
                                <Avatar src={r.avatarUrl} name={r.name} size={26} />
                                <Link href={`/u/${r.slug}`} className="min-w-0 flex-1 truncate text-sm hover:text-cyan-300">{r.name}</Link>
                                {/* The figure, not a badge. "3rd place" without a
                                    number is a claim; "3rd, 41 points" is a result. */}
                                <span className="shrink-0 text-sm font-bold tabular-nums">{r.points.toLocaleString()}</span>
                                <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted">pts</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Standings (only if this planet has a game) */}
            {/* Leaderboard #1 — connected-account standings for this game */}
            {game && boards.length > 0 && (
              <section>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h2 className="text-xl font-bold flex items-center gap-2"><Icon name="chart" size={20} className="text-cyan-300" /> {game.name} leaderboards</h2>
                  <Link href={`/leaderboards?game=${encodeURIComponent(game.name)}`} className="text-xs text-cyan-300 hover:underline shrink-0">All leaderboards →</Link>
                </div>
                <p className="text-xs text-muted mb-4">Live standings from API-verified accounts — every metric we track, each board over the game&apos;s art.</p>
                {/* Glorified cards, one board each, over the game's cover art */}
                <div className="grid md:grid-cols-2 gap-5">
                  {boards.map((b) => {
                    const metricName = b.title.split("·")[1]?.trim() ?? b.title;
                    return (
                      <div key={b.id} className="group relative overflow-hidden rounded-2xl border border-white/10 hover:border-cyan-400/30 transition-colors" style={{ boxShadow: `0 0 0 1px ${pAccent}18` }}>
                        {slimImg(game.coverUrl) && <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-25 group-hover:opacity-35 transition-opacity" style={{ backgroundImage: `url(${optImg(slimImg(game.coverUrl), 1200)})` }} />}
                        <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(4,5,26,0.66), rgba(4,5,26,0.92)), radial-gradient(120% 80% at 100% 0%, ${pAccent2}1f, transparent 60%)` }} />
                        <div aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${pAccent}, ${pAccent2})` }} />
                        <div className="relative p-4">
                          <div className="flex items-center gap-2.5 mb-3">
                            {game.logoUrl ? <GameLogo logoUrl={slimImg(game.logoUrl, 200000)} name={game.name} size={28} rounded="rounded-lg" className="ring-1 ring-white/15" /> : <Icon name="chart" size={18} className="text-cyan-300" />}
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate">{metricName}</div>
                              <div className="text-[10px] uppercase tracking-widest text-muted">{game.name}</div>
                            </div>
                            <Link href={`/leaderboards?game=${encodeURIComponent(game.name)}&metric=${encodeURIComponent(b.metricKey)}`} className="ml-auto text-[11px] text-cyan-300 hover:underline inline-flex items-center gap-0.5 shrink-0">Full <Icon name="arrowRight" size={11} /></Link>
                          </div>
                          <LeaderboardWidget boards={[b]} basePath={path} limit={10} compact />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Leaderboard #2 — challenges, each with its own live board */}
            <section>
              <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><Icon name="zap" size={20} className="text-amber-300" /> Challenges</h2>
              <p className="text-xs text-muted mb-4">Time-based events on this planet — each with its own live leaderboard.</p>
              {challenges.length === 0 ? (
                <div className="glass p-8 text-center text-muted text-sm">No challenges here yet — watch this planet.</div>
              ) : (
                <div className="space-y-5">
                  {challenges.map((ch) => {
                    const top = topByChallenge.get(ch.id) ?? [];
                    return (
                      <div key={ch.id} className="glass overflow-hidden">
                        <Link href={`${path}/challenges/${ch.id}`} className="block relative h-32 group overflow-hidden">
                          <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                            style={{ backgroundImage: `url(${optImg(slimImg(ch.coverUrl, 400000) ?? cover, 1200)})` }} />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d26] via-[#0b0d26]/50 to-transparent" />
                          <span className={`absolute top-3 right-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest rounded-full px-2.5 py-1 border ${ch.status === "active" ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-violet-400/40 text-muted bg-black/40"}`}>
                            {ch.status === "active" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                            {ch.status === "active" ? "Live" : "Completed"}
                          </span>
                          <div className="absolute bottom-3 left-4 right-4">
                            <div className="font-bold text-lg drop-shadow">{ch.title}</div>
                            <div className="text-xs text-muted inline-flex items-center gap-1.5">
                              <Icon name="clock" size={11} /> {ch.status === "active" ? `ends ${timeAgo(ch.endAt).replace(" ago", "")}` : `ended ${timeAgo(ch.endAt)}`}
                              <span className="capitalize">· {ch.cadence}</span>
                            </div>
                          </div>
                        </Link>
                        <div className="p-4">
                          {top.length === 0 ? (
                            <div className="text-xs text-cyan-300 inline-flex items-center gap-1.5"><Icon name="crown" size={12} /> Throne unclaimed — <Link href={`${path}/challenges/${ch.id}`} className="underline">be first to compete</Link></div>
                          ) : (
                            <div className="space-y-1.5">
                              {top.map((t, i) => (
                                <ChallengePointsButton key={t.slug} challengeId={ch.id} slug={t.slug} name={t.name} title={ch.title}
                                  className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-violet-500/10 text-left">
                                  <span className={`rank-chip rank-chip-${i + 1} !h-6 !min-w-6 text-xs`}>{i + 1}</span>
                                  <Avatar name={t.name} src={t.avatarUrl} size={24} />
                                  <span className="text-sm truncate flex-1">{t.name}</span>
                                  <span className="text-cyan-200 font-bold text-sm">{t.points} pts</span>
                                </ChallengePointsButton>
                              ))}
                              <Link href={`${path}/challenges/${ch.id}`} className="block text-center text-xs text-cyan-300 hover:underline pt-1">Full standings →</Link>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Game-world directory — champions / agents+weapons / heroes with lore.
                Self-loads, capped + scrollable, renders nothing for games without a catalogue. */}
            {game && <GameDirectory game={game.name} />}

            {/* Community feed */}
            {/* B111. The Community feed — composer, posts, comments,
                reactions — is gone. The planet is a competition page: its
                challenges, its leaderboards and the people playing it. */}
          </div>

          {/* Rail */}
          <aside className="space-y-6">
            {game && (
              <div className="glass p-5">
                <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Icon name="gamepad" size={16} className="text-cyan-300" /> Players on Cluster</h3>
                {players.length === 0 ? (
                  <p className="text-xs text-muted">No linked accounts yet — be the first.</p>
                ) : (
                  <div className="space-y-2.5">
                    {players.map((p) => (
                      <Link key={p.user.id} href={`/u/${p.user.slug}`} className="flex items-center gap-2.5 hover:text-cyan-300">
                        <Avatar name={p.user.displayName} src={p.user.avatarUrl} size={30} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{p.user.displayName}</div>
                          <div className="text-[11px] text-muted truncate">{p.inGameName}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            <AdSlot placement="leaderboard_sidebar" />
          </aside>
        </div>
      </div>
    </div>
  );
}
