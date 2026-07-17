import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import PostCard from "@/components/PostCard";
import AdSlot from "@/components/AdSlot";
import Avatar from "@/components/Avatar";
import GameLogo from "@/components/GameLogo";
import Icon from "@/components/Icon";
import PlanetHero from "@/components/PlanetHero";
import { buildSkinnedPlanets } from "@/lib/planets";
import { timeAgo } from "@/lib/utils";
import { slimImg } from "@/lib/img";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

export default async function FeedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();

  const [mySpaceRows, myFollowing, accounts, [cpRow], [followerRow], activeGames] = await Promise.all([
    db.select({ s: schema.spaces }).from(schema.spaceMembers)
      .innerJoin(schema.spaces, eq(schema.spaceMembers.spaceId, schema.spaces.id))
      .where(and(eq(schema.spaceMembers.userId, user.id), eq(schema.spaces.isActive, true))).limit(10),
    db.select({ id: schema.follows.followingId }).from(schema.follows).where(eq(schema.follows.followerId, user.id)),
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    db.select({ c: sql<number>`COALESCE(SUM(${schema.userQuestProgress.qp}), 0)` }).from(schema.userQuestProgress).where(eq(schema.userQuestProgress.userId, user.id)),
    db.select({ c: count() }).from(schema.follows).where(eq(schema.follows.followingId, user.id)),
    db.select({ name: schema.games.name, logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl }).from(schema.games).where(eq(schema.games.isActive, true)),
  ]);

  const mySpaceIds = mySpaceRows.map((r) => r.s.id);
  const followingIds = myFollowing.map((f) => f.id);
  const gameByName = new Map(activeGames.map((g) => [g.name, g]));

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
      .where(eq(schema.challenges.status, "active")).orderBy(desc(schema.challenges.startAt)).limit(4),
    mySpaceIds.length
      ? db.select().from(schema.spaces).where(and(eq(schema.spaces.isActive, true), notInArray(schema.spaces.id, mySpaceIds))).limit(6)
      : db.select().from(schema.spaces).where(eq(schema.spaces.isActive, true)).limit(6),
  ]);

  const skinnedPlanets = await buildSkinnedPlanets(db);
  const firstName = user.displayName.split(" ")[0];
  const stat = [
    { label: "Games linked", value: accounts.length, icon: "gamepad", href: "/profile" },
    { label: "Cluster Points", value: Number(cpRow?.c ?? 0), icon: "spark", href: "/quests" },
    { label: "Followers", value: Number(followerRow?.c ?? 0), icon: "users", href: `/u/${user.slug}/followers` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* ===== Welcome hero ===== */}
      <div className="glass relative overflow-hidden p-6 md:p-8 mb-6">
        <div className="absolute inset-0 opacity-30 bg-cover bg-center" style={{ backgroundImage: "url(/assets/ambient.png)" }} />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar name={user.displayName} src={user.avatarUrl} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold">Welcome back, <span className="grad-text">{firstName}</span></h1>
            <p className="text-muted text-sm mt-1">Your command center — connect games, jump into challenges, and explore planets.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/profile" className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white inline-flex items-center gap-1.5"><Icon name="link" size={14} /> Connect a game</Link>
            <Link href={`/u/${user.slug}`} className="ghost-btn pressable rounded-full px-5 py-2 text-sm inline-flex items-center gap-1.5"><Icon name="eye" size={14} /> My profile</Link>
          </div>
        </div>
        <div className="relative grid grid-cols-3 gap-3 mt-6">
          {stat.map((s) => (
            <Link key={s.label} href={s.href} className="rounded-xl border border-violet-400/15 bg-black/20 p-3 text-center hover:border-violet-400/40 transition-colors">
              <Icon name={s.icon} size={16} className="text-cyan-300 mx-auto mb-1" />
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted">{s.label}</div>
            </Link>
          ))}
        </div>
      </div>

      <AdSlot placement="feed_top_banner" className="mb-8" />

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* ===== Main column ===== */}
        <div className="min-w-0 space-y-8">
          {/* Explore planets — interactive globe */}
          {skinnedPlanets.length > 0 && (
            <section>
              <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Icon name="planet" size={18} className="text-cyan-300" /> Explore planets</h2>
              <div className="rounded-2xl overflow-hidden border border-violet-400/15">
                <PlanetHero planets={skinnedPlanets} initialSlug={skinnedPlanets[0].slug} swap heading="Tap a game to explore its planet" />
              </div>
            </section>
          )}

          {/* Live challenges */}
          {challenges.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold flex items-center gap-2"><Icon name="zap" size={18} className="text-amber-300" /> Live challenges</h2>
                <Link href="/planets" className="text-xs text-cyan-300 hover:underline">See all</Link>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {challenges.map(({ c, space }) => {
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
                  return (
                    <Link key={s.id} href={`/planets/${s.slug}`} className="flex items-center gap-2.5 hover:text-cyan-300">
                      {g ? <GameLogo logoUrl={slimImg(g.logoUrl)} name={s.name} size={28} rounded="rounded-lg" /> : <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-400/25"><Icon name="planet" size={14} className="text-violet-200" /></span>}
                      <span className="text-sm font-medium truncate">{s.name}</span>
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
                return (
                  <Link key={s.id} href={`/planets/${s.slug}`} className="flex items-center gap-2.5 hover:text-cyan-300">
                    {g ? <GameLogo logoUrl={slimImg(g.logoUrl)} name={s.name} size={28} rounded="rounded-lg" /> : <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-400/25"><Icon name="planet" size={14} className="text-violet-200" /></span>}
                    <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                    <Icon name="chevronRight" size={14} className="text-muted" />
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
  );
}
