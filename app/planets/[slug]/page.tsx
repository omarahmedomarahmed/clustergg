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
import { createPost } from "@/app/actions/social";
import { getContent } from "@/lib/cms";
import { timeAgo } from "@/lib/utils";

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
    db.select({ post: schema.posts, author: schema.users })
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
      ? db.selectDistinct({ user: schema.users, inGameName: schema.linkedGameAccounts.inGameName })
          .from(schema.linkedGameAccounts)
          .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
          .where(and(inArray(schema.linkedGameAccounts.provider, providerIds), eq(schema.users.status, "active")))
          .limit(12)
      : Promise.resolve([]),
    db.select().from(schema.spaceExpertScores).where(eq(schema.spaceExpertScores.spaceId, space.id)),
  ]);

  const tierByUser = new Map(expertRows.map((r) => [r.userId, r.tier]));
  const path = `/planets/${space.slug}`;
  const cover = game?.coverUrl ?? cms["banner.games"];
  const activeChallenges = challenges.filter((c) => c.status === "active");

  return (
    <div>
      {/* ===== Hero ===== */}
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
            {game && boards.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Icon name="chart" size={20} className="text-cyan-300" /> Standings</h2>
                <LeaderboardWidget boards={boards} activeMetric={stat} basePath={path} limit={25} />
              </section>
            )}

            {/* Challenges */}
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Icon name="zap" size={20} className="text-amber-300" /> Challenges</h2>
              {challenges.length === 0 ? (
                <div className="glass p-8 text-center text-muted text-sm">No challenges here yet — watch this planet.</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {challenges.map((ch) => (
                    <Link key={ch.id} href={`${path}/challenges/${ch.id}`} className="glass card-lift overflow-hidden group">
                      <div className="h-24 relative overflow-hidden">
                        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                          style={{ backgroundImage: `url(${ch.coverUrl ?? cover})` }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d26] to-transparent" />
                        <span className={`absolute top-2 right-2 text-[10px] uppercase tracking-widest rounded-full px-2 py-0.5 border ${ch.status === "active" ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-violet-400/40 text-muted bg-black/40"}`}>
                          {ch.status === "active" ? "Live" : "Completed"}
                        </span>
                      </div>
                      <div className="p-4">
                        <div className="font-bold text-sm">{ch.title}</div>
                        <div className="text-xs text-muted mt-1 flex items-center gap-1.5">
                          <Icon name="clock" size={12} /> {ch.status === "active" ? `ends ${timeAgo(ch.endAt).replace(" ago", "")}` : `ended ${timeAgo(ch.endAt)}`}
                          <span className="capitalize">· {ch.cadence}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
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
                <div className="glass p-4 mb-6 text-center text-sm text-muted">
                  <Link href="/login" className="text-cyan-300 underline">Log in</Link> to post on this planet.
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
