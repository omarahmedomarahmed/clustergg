import Link from "next/link";
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
import PostCard from "@/components/PostCard";
import JoinSpaceButton from "@/components/JoinSpaceButton";
import HeroStage from "@/components/HeroStage";
import { createPost } from "@/app/actions/social";
import { getContent } from "@/lib/cms";
import { timeAgo } from "@/lib/utils";
import { slimImg } from "@/lib/img";
import { buildSkinnedPlanets } from "@/lib/planets";
import { getQuestHeroData } from "@/lib/quest-hero";
import OAuthButtons from "@/components/OAuthButtons";

export const dynamic = "force-dynamic";

// A "planet" is a community (space) — and, when it's tied to a game, it also
// surfaces that game's cover, standings and players. One page for everything
// about a game: the merge of the old game hub + community space.
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

  const [posts, membership, challenges, boards, players, expertRows] = await Promise.all([
    db.select({ post: schema.posts, author: schema.publicUserColumns })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
      .where(and(eq(schema.posts.spaceId, space.id), sql`${schema.posts.deletedAt} IS NULL`))
      .orderBy(desc(schema.posts.isPinned), desc(schema.posts.createdAt))
      .limit(30),
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
    db.select().from(schema.spaceExpertScores).where(eq(schema.spaceExpertScores.spaceId, space.id)),
  ]);

  const tierByUser = new Map(expertRows.map((r) => [r.userId, r.tier]));
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

  // Interactive planet hero for games that have a skin (falls back to the flat
  // cover hero otherwise).
  const hasSkin = !!game?.planetImageUrl;
  const skinnedPlanets = hasSkin ? await buildSkinnedPlanets(db) : [];
  const questHero = hasSkin && skinnedPlanets.length > 0 ? await getQuestHeroData(db, viewer?.id ?? null) : null;

  return (
    <div>
      {hasSkin && skinnedPlanets.length > 0 ? (
        <>
          <HeroStage planets={skinnedPlanets} initialSlug={space.slug} quest={questHero} swap={false} />
          <div className="mx-auto max-w-6xl px-4 -mt-2 mb-4 flex flex-wrap items-center gap-3">
            <p className="text-muted text-sm mr-auto">{space.description}</p>
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
            backgroundImage: `url(${cover})`,
            backgroundPosition: game ? `${game.coverAdjust.x}% ${game.coverAdjust.y}%` : "center",
          }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#04051a]/30 via-[#04051a]/70 to-[#04051a]" />
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-12 flex flex-wrap items-end gap-5">
          {game
            ? <GameLogo logoUrl={game.logoUrl} name={game.name} size={84} className="pulse-glow" />
            : <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-600/30 to-cyan-600/20"><Icon name="planet" size={38} className="text-violet-200" /></div>}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-widest text-cyan-300 mb-1 inline-flex items-center gap-1.5">
              <Icon name="planet" size={12} /> Planet
            </div>
            <h1 className="text-3xl md:text-5xl font-bold">{space.name}</h1>
            <p className="text-muted mt-2 max-w-xl">{space.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><Icon name="users" size={12} /> {space.memberCount} members</span>
              <span className="inline-flex items-center gap-1.5"><Icon name="message" size={12} /> {space.postCount} posts</span>
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

        {/* Live challenge banners */}
        {activeChallenges.map((c) => (
          <Link
            key={c.id}
            href={`${path}/challenges/${c.id}`}
            className="glass card-lift mb-6 flex flex-wrap items-center gap-4 p-5 !border-cyan-400/40"
          >
            <Icon name="zap" size={28} className="text-amber-300 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest text-cyan-300">Live challenge · ends {timeAgo(c.endAt).replace(" ago", "")}</div>
              <div className="font-bold">{c.title}</div>
              <div className="text-xs text-muted truncate">{c.prizeDescription}</div>
            </div>
            <span className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white">Compete</span>
          </Link>
        ))}

        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-12">
            {/* Standings (only if this planet has a game) */}
            {/* Leaderboard #1 — connected-account standings for this game */}
            {game && boards.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><Icon name="chart" size={20} className="text-cyan-300" /> {game.name} leaderboard</h2>
                <p className="text-xs text-muted mb-4">Live standings from API-verified accounts. Switch stats below.</p>
                <LeaderboardWidget boards={boards} activeMetric={stat} basePath={path} limit={25} />
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
                            style={{ backgroundImage: `url(${slimImg(ch.coverUrl, 400000) ?? cover})` }} />
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
                                <Link key={t.slug} href={`/u/${t.slug}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-violet-500/10">
                                  <span className={`rank-chip rank-chip-${i + 1} !h-6 !min-w-6 text-xs`}>{i + 1}</span>
                                  <Avatar name={t.name} src={t.avatarUrl} size={24} />
                                  <span className="text-sm truncate flex-1">{t.name}</span>
                                  <span className="text-cyan-200 font-bold text-sm">{t.points} pts</span>
                                </Link>
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

            {/* Community feed */}
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Icon name="users" size={20} className="text-violet-300" /> Community</h2>
              {viewer ? (
                <form action={createPost.bind(null, space.id, space.slug)} className="glass p-4 mb-6">
                  <textarea name="body" rows={3} required maxLength={5000} placeholder={`Transmit to ${space.name}…`} className="input-cosmic resize-none" />
                  <div className="mt-3 flex justify-end">
                    <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Post</button>
                  </div>
                </form>
              ) : (
                <div className="glass p-5 mb-6 text-center">
                  <div className="text-sm text-muted mb-3">Sign in with Discord to join {space.name} and post on this planet.</div>
                  <div className="mx-auto max-w-xs"><OAuthButtons next={path} /></div>
                </div>
              )}
              <div className="space-y-4">
                {posts.length === 0 && (
                  <div className="glass p-10 text-center text-muted">Silence in this sector… be the first to transmit.</div>
                )}
                {posts.map(({ post, author }, i) => (
                  <div key={post.id}>
                    <PostCard post={post} author={author} viewerId={viewer?.id ?? null} path={path} expertTier={tierByUser.get(author.id)} />
                    {(i + 1) % 6 === 0 && i + 1 < posts.length && <div className="mt-4"><AdSlot placement="feed_inline" /></div>}
                  </div>
                ))}
              </div>
            </section>
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
