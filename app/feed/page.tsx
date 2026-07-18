import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUserFull } from "@/lib/auth";
import PostCard from "@/components/PostCard";
import AdSlot from "@/components/AdSlot";
import Avatar from "@/components/Avatar";
import GameLogo from "@/components/GameLogo";
import Icon from "@/components/Icon";
import HeroStage from "@/components/HeroStage";
import FeedControlPanel from "@/components/FeedControlPanel";
import FeedDashboard, { type Widget } from "@/components/FeedDashboard";
import { buildSkinnedPlanets } from "@/lib/planets";
import { getQuestHeroData } from "@/lib/quest-hero";
import { getTotalCp, getUserQuests } from "@/lib/quests";
import { getProvider } from "@/lib/providers/registry";
import { resolveTheme, themeToVars, bgLayerStyle } from "@/lib/theme";
import { timeAgo } from "@/lib/utils";
import { slimImg } from "@/lib/img";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

export default async function FeedPage() {
  const user = await getCurrentUserFull();
  if (!user) redirect("/login");
  const db = await getDb();
  // The feed adopts the gamer's own profile theme so it feels like their page.
  const theme = resolveTheme(user.theme);

  const [mySpaceRows, myFollowing, accounts, totalCp, [followerRow], [questRow], [postRow], [joinedRow], activeGames, gameSpaces, myParticipations] = await Promise.all([
    db.select({ s: schema.spaces }).from(schema.spaceMembers)
      .innerJoin(schema.spaces, eq(schema.spaceMembers.spaceId, schema.spaces.id))
      .where(and(eq(schema.spaceMembers.userId, user.id), eq(schema.spaces.isActive, true))).limit(10),
    db.select({ id: schema.follows.followingId }).from(schema.follows).where(eq(schema.follows.followerId, user.id)),
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    getTotalCp(db, user.id),
    db.select({ c: count() }).from(schema.follows).where(eq(schema.follows.followingId, user.id)),
    db.select({ c: sql<number>`COALESCE(SUM(${schema.userQuestProgress.completions}), 0)` }).from(schema.userQuestProgress).where(eq(schema.userQuestProgress.userId, user.id)),
    db.select({ c: count() }).from(schema.posts).where(and(eq(schema.posts.authorId, user.id), sql`${schema.posts.deletedAt} IS NULL`)),
    db.select({ c: count() }).from(schema.challengeParticipants).where(eq(schema.challengeParticipants.userId, user.id)),
    db.select({ name: schema.games.name, logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl }).from(schema.games).where(eq(schema.games.isActive, true)),
    db.select({ slug: schema.spaces.slug, game: schema.spaces.game }).from(schema.spaces).where(eq(schema.spaces.isActive, true)),
    db.select({ id: schema.challengeParticipants.challengeId }).from(schema.challengeParticipants).where(eq(schema.challengeParticipants.userId, user.id)),
  ]);

  const mySpaceIds = mySpaceRows.map((r) => r.s.id);
  const followingIds = myFollowing.map((f) => f.id);
  const gameByName = new Map(activeGames.map((g) => [g.name, g]));
  const slugByGame = new Map(gameSpaces.filter((s) => s.game).map((s) => [s.game as string, s.slug]));
  const joinedChallengeIds = new Set(myParticipations.map((p) => p.id));

  const filters = [];
  if (mySpaceIds.length) filters.push(inArray(schema.posts.spaceId, mySpaceIds));
  if (followingIds.length) filters.push(inArray(schema.posts.authorId, followingIds));

  const [posts, challenges, suggested] = await Promise.all([
    filters.length
      ? db.select({ post: schema.posts, author: schema.publicUserColumns, space: schema.spaces })
          .from(schema.posts)
          .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
          .innerJoin(schema.spaces, eq(schema.posts.spaceId, schema.spaces.id))
          .where(and(sql`${schema.posts.deletedAt} IS NULL`, or(...filters)))
          .orderBy(desc(schema.posts.createdAt)).limit(30)
      : Promise.resolve([]),
    db.select({ c: schema.challenges, space: schema.spaces }).from(schema.challenges)
      .innerJoin(schema.spaces, eq(schema.challenges.spaceId, schema.spaces.id))
      .where(eq(schema.challenges.status, "active")).orderBy(desc(schema.challenges.startAt)).limit(24),
    mySpaceIds.length
      ? db.select().from(schema.spaces).where(and(eq(schema.spaces.isActive, true), notInArray(schema.spaces.id, mySpaceIds))).limit(6)
      : db.select().from(schema.spaces).where(eq(schema.spaces.isActive, true)).limit(6),
  ]);
  const liveChallenges = challenges.slice(0, 4);

  const skinnedPlanets = await buildSkinnedPlanets(db);
  const questHero = await getQuestHeroData(db, user.id);

  // ===== Control-panel data =====
  const prefs = (user.feedPrefs ?? {}) as { stats?: string[]; challenges?: string[]; leaderboards?: string[]; dashboard?: unknown[] };
  const panelAccounts = accounts.map((a) => {
    const p = getProvider(a.provider);
    const gameName = p?.game ?? null;
    const g = gameName ? gameByName.get(gameName) : undefined;
    return {
      id: a.id, provider: a.provider, providerName: p?.name ?? a.provider, inGameName: a.inGameName,
      region: a.region, gameName, logoUrl: slimImg(g?.logoUrl ?? null, 300000),
      coverUrl: slimImg(g?.coverUrl ?? null, 500000),
    };
  });
  const panelChallenges = challenges.map(({ c, space }) => {
    const g = gameByName.get(c.game);
    return {
      id: c.id, title: c.title, game: c.game,
      coverUrl: slimImg(c.coverUrl, 500000) || slimImg(g?.coverUrl ?? null, 500000),
      logoUrl: slimImg(g?.logoUrl ?? null, 300000), endAt: c.endAt.toISOString(),
      planetSlug: space.slug, joined: joinedChallengeIds.has(c.id), myRank: null,
    };
  });
  const panelGames = activeGames.map((g) => ({
    name: g.name, slug: slugByGame.get(g.name) ?? null,
    logoUrl: slimImg(g.logoUrl, 300000), coverUrl: slimImg(g.coverUrl, 500000),
  }));
  const statValues: Record<string, number> = {
    cp: totalCp, quests: Number(questRow?.c ?? 0), followers: Number(followerRow?.c ?? 0),
    following: followingIds.length, views: user.profileViews ?? 0, games: accounts.length,
    challenges: Number(joinedRow?.c ?? 0), posts: Number(postRow?.c ?? 0),
  };

  // ===== Dashboard-builder sources =====
  const dashQuestViews = await getUserQuests(db, user.id);
  const dashQuests = dashQuestViews.map((q) => ({
    key: q.key, name: q.name, color: q.color, logoUrl: q.logoUrl,
    qp: q.qp, totalCp: q.totalCp, pct: q.nextTier ? Math.max(4, Math.min(100, Math.round((q.qp / q.nextTier.thresholdQp) * 100))) : 100,
    tierName: q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].name : "Just starting",
  }));
  const cpByQuest: Record<string, number> = Object.fromEntries(dashQuestViews.map((q) => [q.key, q.totalCp]));
  const boards = await db.select().from(schema.leaderboards).where(eq(schema.leaderboards.isActive, true));
  const dashLeaderboards = boards.map((b) => {
    const g = gameByName.get(b.game);
    return { game: b.game, metricKey: b.metricKey, title: b.title, slug: slugByGame.get(b.game) ?? null, logoUrl: slimImg(g?.logoUrl ?? null, 300000), coverUrl: slimImg(g?.coverUrl ?? null, 500000) };
  });
  const accIds = accounts.map((a) => a.id);
  const statCur = accIds.length ? await db.select().from(schema.statCurrent).where(inArray(schema.statCurrent.linkedAccountId, accIds)) : [];
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  const dashStats = statCur.map((s) => {
    const a = acctById.get(s.linkedAccountId);
    const gameName = a ? (getProvider(a.provider)?.game ?? null) : null;
    const g = gameName ? gameByName.get(gameName) : undefined;
    return { accountId: s.linkedAccountId, game: gameName ?? s.game, logoUrl: slimImg(g?.logoUrl ?? null, 300000), metricKey: s.metricKey, metricLabel: s.metricKey.replace(/_/g, " "), value: s.metricValue, inGameName: a?.inGameName ?? "" };
  });
  const dashboardWidgets = (Array.isArray(prefs.dashboard) ? prefs.dashboard : []) as Widget[];

  return (
    <div className="profile-root relative" style={{ ...(themeToVars(theme) as React.CSSProperties), background: theme.bgImage ? "transparent" : undefined }}>
      {/* The gamer's own profile background — feed feels like their page */}
      {theme.bgImage && <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle(theme)} />}
      <div className="mx-auto max-w-6xl px-4 py-8">
      {/* ===== Gamer control panel (themed with the gamer's profile) ===== */}
      <FeedControlPanel
        me={{ displayName: user.displayName, slug: user.slug, avatarUrl: user.avatarUrl, bannerUrl: user.bannerUrl ?? null, title: user.title ?? null }}
        accounts={panelAccounts}
        statValues={statValues}
        activeChallenges={panelChallenges}
        games={panelGames}
        prefs={{ stats: prefs.stats ?? [], challenges: prefs.challenges ?? [], leaderboards: prefs.leaderboards ?? [] }}
        theme={{ accent: theme.accent, accent2: theme.accent2, coverUrl: user.bannerUrl ?? theme.bgImage ?? null }}
      />

      {/* Drag-and-drop tracker dashboard */}
      <FeedDashboard
        sources={{ quests: dashQuests, leaderboards: dashLeaderboards, stats: dashStats, cpTotal: totalCp, cpByQuest }}
        initial={dashboardWidgets}
      />

      <AdSlot placement="feed_top_banner" className="mb-8" />

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* ===== Main column ===== */}
        <div className="min-w-0 space-y-8">
          {/* Explore planets / quests — interactive globe ⇄ quest map */}
          {skinnedPlanets.length > 0 && (
            <section>
              <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Icon name="planet" size={18} className="text-cyan-300" /> Explore planets &amp; quests</h2>
              <div className="rounded-2xl overflow-hidden border border-violet-400/15">
                <HeroStage planets={skinnedPlanets} initialSlug={skinnedPlanets[0].slug} heading="Tap a game to explore its planet" quest={questHero} />
              </div>
            </section>
          )}

          {/* Live challenges */}
          {liveChallenges.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold flex items-center gap-2"><Icon name="zap" size={18} className="text-amber-300" /> Live challenges</h2>
                <Link href="/planets" className="text-xs text-cyan-300 hover:underline">See all</Link>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {liveChallenges.map(({ c, space }) => {
                  const g = gameByName.get(c.game);
                  const cover = slimImg(c.coverUrl, 500000) || slimImg(g?.coverUrl ?? null, 500000);
                  return (
                    <Link key={c.id} href={`/planets/${space.slug}/challenges/${c.id}`}
                      className="group card-lift relative overflow-hidden rounded-2xl border border-violet-400/20 flex flex-col justify-end min-h-[150px] p-4">
                      {/* Cover art background */}
                      {cover ? (
                        <div className="absolute inset-0 -z-10 bg-cover" style={{ backgroundImage: `url(${cover})`, backgroundPosition: `${c.coverAdjust?.x ?? 50}% ${c.coverAdjust?.y ?? 50}%` }} />
                      ) : (
                        <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(120% 120% at 0% 0%, #8b5cf633, transparent 60%), #0a0a1c" }} />
                      )}
                      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#04051a] via-[#04051a]/70 to-[#04051a]/10" />
                      {/* Live + game chip */}
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        {g && <GameLogo logoUrl={slimImg(g.logoUrl, 300000)} name={c.game} size={30} rounded="rounded-lg" className="ring-1 ring-white/20 shadow-lg" />}
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                        </span>
                      </div>
                      <div className="font-bold leading-tight drop-shadow">{c.title}</div>
                      <div className="mt-1.5 flex items-center gap-3 text-xs">
                        <span className="text-muted inline-flex items-center gap-1"><Icon name="clock" size={11} /> ends {timeAgo(c.endAt).replace(" ago", "")}</span>
                        {c.prizeDescription && <span className="text-amber-300 inline-flex items-center gap-1 truncate"><Icon name="trophy" size={11} /> {c.prizeDescription}</span>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Feed */}
          <section>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Icon name="home" size={18} className="text-violet-300" /> Your feed</h2>
            {posts.length === 0 ? (
              <div className="glass p-8 text-center">
                <Icon name="rocket" size={34} className="text-cyan-300 mx-auto mb-3" />
                <h3 className="font-bold text-lg">Let&apos;s light up your galaxy</h3>
                <p className="text-muted text-sm mt-1 max-w-md mx-auto">Your feed fills up as you join planets and follow gamers. Start with a few:</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  <Link href="/planets" className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white">Explore planets</Link>
                  <Link href="/search" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">Find gamers</Link>
                  <Link href="/profile" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">Connect a game</Link>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map(({ post, author, space }, i) => (
                  <div key={post.id}>
                    <PostCard post={post} author={author} viewerId={user.id} path="/feed" spaceName={space.name} />
                    {(i + 1) % 6 === 0 && i + 1 < posts.length && <div className="mt-4"><AdSlot placement="feed_inline" /></div>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ===== Rail ===== */}
        <aside className="space-y-6">
          {/* My planets */}
          <div className="glass p-5">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Icon name="planet" size={15} className="text-cyan-300" /> My planets</h3>
            {mySpaceRows.length === 0 ? (
              <p className="text-xs text-muted">You haven&apos;t joined any planets yet.</p>
            ) : (
              <div className="space-y-2">
                {mySpaceRows.map(({ s }) => {
                  const g = s.game ? gameByName.get(s.game) : undefined;
                  const cover = slimImg(g?.coverUrl ?? null);
                  return (
                    <Link key={s.id} href={`/planets/${s.slug}`} className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-white/10 p-2 group">
                      {cover && <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-35 group-hover:opacity-50 transition-opacity" style={{ backgroundImage: `url(${cover})` }} />}
                      <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(4,5,26,0.85), rgba(4,5,26,0.55))" }} />
                      {g ? <GameLogo logoUrl={slimImg(g.logoUrl)} name={s.name} size={28} rounded="rounded-lg" className="relative ring-1 ring-white/15" /> : <span className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-violet-400/25"><Icon name="planet" size={14} className="text-violet-200" /></span>}
                      <span className="relative text-sm font-semibold truncate">{s.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Explore planets */}
          <div className="glass p-5">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Icon name="rocket" size={15} className="text-violet-300" /> Explore planets</h3>
            <div className="space-y-2">
              {suggested.map((s) => {
                const g = s.game ? gameByName.get(s.game) : undefined;
                const cover = slimImg(g?.coverUrl ?? null);
                return (
                  <Link key={s.id} href={`/planets/${s.slug}`} className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-white/10 p-2 group">
                    {cover && <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-35 group-hover:opacity-50 transition-opacity" style={{ backgroundImage: `url(${cover})` }} />}
                    <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(4,5,26,0.85), rgba(4,5,26,0.55))" }} />
                    {g ? <GameLogo logoUrl={slimImg(g.logoUrl)} name={s.name} size={28} rounded="rounded-lg" className="relative ring-1 ring-white/15" /> : <span className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-violet-400/25"><Icon name="planet" size={14} className="text-violet-200" /></span>}
                    <span className="relative text-sm font-semibold truncate flex-1">{s.name}</span>
                    <Icon name="chevronRight" size={14} className="relative text-muted" />
                  </Link>
                );
              })}
            </div>
            <Link href="/planets" className="mt-3 block text-center text-xs text-cyan-300 hover:underline">See all planets</Link>
          </div>

          <AdSlot placement="feed_sidebar" />
        </aside>
      </div>
      </div>
    </div>
  );
}
