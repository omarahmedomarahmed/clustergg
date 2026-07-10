import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers/registry";
import { syncUserAccountsIfStale } from "@/lib/sync";
import Avatar from "@/components/Avatar";
import { BadgeIcon } from "@/components/BadgeChip";
import FollowButton from "@/components/FollowButton";
import AdSlot from "@/components/AdSlot";
import CopyLinkButton from "@/components/CopyLinkButton";
import { startConversation } from "@/app/actions/social";
import { fmtNum, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user) return { title: "Gamer not found" };
  return {
    title: `${user.displayName} (@${user.slug})`,
    description: user.bio ?? `${user.displayName}'s gamer profile on Cluster — every game, one identity.`,
    openGraph: { title: `${user.displayName} on Cluster`, description: user.bio ?? "Every game. One identity.", images: ["/assets/og.png"] },
  };
}

const FLAGS: Record<string, string> = { US: "🇺🇸", DE: "🇩🇪", JP: "🇯🇵", FR: "🇫🇷", BR: "🇧🇷", GB: "🇬🇧", EG: "🇪🇬", SA: "🇸🇦", AE: "🇦🇪", KR: "🇰🇷" };

export default async function ProfilePage({ params }: Props) {
  const { slug } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user || user.status === "banned") notFound();

  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === user.id;

  if (user.profileVisibility === "private" && !isOwner) {
    return (
      <div className="mx-auto max-w-md px-4 py-32 text-center glass mt-16">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold">This constellation is private</h1>
        <p className="text-muted mt-2 text-sm">The owner has hidden their profile from the public galaxy.</p>
      </div>
    );
  }

  // Refresh stale stats from live provider APIs (cooldown-guarded).
  try { await syncUserAccountsIfStale(db, user.id); } catch { /* page must render regardless */ }

  const [accounts, badgeRows, [followerRow], [followingRow], isFollowingRow, recentPosts, participations] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    db.select({ badge: schema.badges, awarded: schema.userBadges.awardedAt })
      .from(schema.userBadges)
      .innerJoin(schema.badges, eq(schema.userBadges.badgeId, schema.badges.id))
      .where(eq(schema.userBadges.userId, user.id))
      .orderBy(desc(schema.userBadges.awardedAt)),
    db.select({ c: count() }).from(schema.follows).where(eq(schema.follows.followingId, user.id)),
    db.select({ c: count() }).from(schema.follows).where(eq(schema.follows.followerId, user.id)),
    viewer
      ? db.select().from(schema.follows).where(and(
          eq(schema.follows.followerId, viewer.id), eq(schema.follows.followingId, user.id))).limit(1)
      : Promise.resolve([]),
    db.select({ post: schema.posts, space: schema.spaces })
      .from(schema.posts)
      .innerJoin(schema.spaces, eq(schema.posts.spaceId, schema.spaces.id))
      .where(and(eq(schema.posts.authorId, user.id), sql`${schema.posts.deletedAt} IS NULL`))
      .orderBy(desc(schema.posts.createdAt)).limit(5),
    db.select({ p: schema.challengeParticipants, c: schema.challenges })
      .from(schema.challengeParticipants)
      .innerJoin(schema.challenges, eq(schema.challengeParticipants.challengeId, schema.challenges.id))
      .where(eq(schema.challengeParticipants.userId, user.id))
      .orderBy(desc(schema.challengeParticipants.joinedAt)).limit(6),
  ]);

  const accountIds = accounts.map((a) => a.id);
  const stats = accountIds.length
    ? await db.select().from(schema.statCurrent).where(inArray(schema.statCurrent.linkedAccountId, accountIds))
    : [];
  const statsByAccount = new Map<string, typeof stats>();
  for (const s of stats) {
    if (!statsByAccount.has(s.linkedAccountId)) statsByAccount.set(s.linkedAccountId, []);
    statsByAccount.get(s.linkedAccountId)!.push(s);
  }

  // Leaderboard standing: best percentile across this user's metrics.
  let standing: { title: string; rank: number; total: number } | null = null;
  for (const s of stats) {
    const [lb] = await db.select().from(schema.leaderboards).where(and(
      eq(schema.leaderboards.game, s.game), eq(schema.leaderboards.metricKey, s.metricKey),
      eq(schema.leaderboards.isActive, true))).limit(1);
    if (!lb) continue;
    const [better] = await db.select({ c: count() }).from(schema.statCurrent).where(and(
      eq(schema.statCurrent.game, s.game), eq(schema.statCurrent.metricKey, s.metricKey),
      gt(schema.statCurrent.metricValue, s.metricValue)));
    const [total] = await db.select({ c: count() }).from(schema.statCurrent).where(and(
      eq(schema.statCurrent.game, s.game), eq(schema.statCurrent.metricKey, s.metricKey)));
    const rank = Number(better?.c ?? 0) + 1;
    const tot = Number(total?.c ?? 1);
    if (!standing || rank / tot < standing.rank / standing.total) {
      standing = { title: lb.title, rank, total: tot };
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <AdSlot placement="profile_top_banner" className="mb-6" />

      {/* Header */}
      <div className="glass relative overflow-hidden p-6 md:p-8">
        <div className="absolute inset-0 opacity-30 bg-cover bg-center" style={{ backgroundImage: "url(/assets/ambient.png)" }} />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar name={user.displayName} src={user.avatarUrl} size={88} className="pulse-glow" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 flex-wrap">
              {user.displayName}
              {user.country && <span title={user.country}>{FLAGS[user.country] ?? `(${user.country})`}</span>}
              {user.isVerified && <span className="text-cyan-300 text-lg" title="Verified">✦</span>}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted mt-0.5">
              <span>clustergg.com/u/{user.slug}</span>
              <CopyLinkButton path={`/u/${user.slug}`} />
            </div>
            {user.bio && <p className="text-muted mt-2 max-w-xl">{user.bio}</p>}
            <div className="flex gap-5 mt-3 text-sm">
              <Link href={`/u/${user.slug}/followers`} className="hover:text-cyan-300">
                <b>{Number(followerRow?.c ?? 0)}</b> <span className="text-muted">followers</span>
              </Link>
              <Link href={`/u/${user.slug}/following`} className="hover:text-cyan-300">
                <b>{Number(followingRow?.c ?? 0)}</b> <span className="text-muted">following</span>
              </Link>
            </div>
          </div>
          <div className="flex gap-3">
            {isOwner ? (
              <Link href="/profile" className="ghost-btn rounded-full px-5 py-2 text-sm">Edit profile</Link>
            ) : viewer ? (
              <>
                <FollowButton targetUserId={user.id} isFollowing={isFollowingRow.length > 0} path={`/u/${user.slug}`} />
                <form action={startConversation.bind(null, user.id)}>
                  <button className="ghost-btn rounded-full px-5 py-2 text-sm">Message</button>
                </form>
              </>
            ) : (
              <Link href="/signup" className="glow-btn rounded-full px-5 py-2 text-sm font-semibold text-white">
                Join to follow
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6 min-w-0">
          {/* Connected accounts + stat cards */}
          <section>
            <h2 className="text-lg font-bold mb-3">Connected accounts</h2>
            {accounts.length === 0 ? (
              <div className="glass p-6 text-center text-muted text-sm">
                No accounts linked yet{isOwner && <> — <Link href="/settings/connections" className="text-cyan-300 underline">link your first</Link></>}.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {accounts.map((a) => {
                  const p = getProvider(a.provider);
                  const aStats = statsByAccount.get(a.id) ?? [];
                  const caps = p?.capabilities ?? [];
                  return (
                    <div key={a.id} className="glass glass-hover p-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{p?.glyph ?? "🎮"}</span>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{a.inGameName}</div>
                          <div className="text-xs text-muted">{p?.name ?? a.provider}{a.region ? ` · ${a.region}` : ""}</div>
                        </div>
                        {a.verified && <span className="ml-auto text-emerald-300 text-xs" title="API verified">✓ verified</span>}
                      </div>
                      {aStats.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {aStats.slice(0, 6).map((s) => {
                            const cap = caps.find((c) => c.key === s.metricKey);
                            return (
                              <div key={s.id} className="rounded-lg border border-violet-400/15 bg-white/[0.02] px-2.5 py-1.5">
                                <div className="text-[10px] uppercase tracking-wider text-muted truncate">{cap?.label ?? s.metricKey}</div>
                                <div className="font-bold text-cyan-200">
                                  {s.rankLabel ?? fmtNum(s.metricValue)}{cap?.unit && !s.rankLabel ? <span className="text-xs font-normal text-muted"> {cap.unit}</span> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {a.lastSyncedAt && (
                        <div className="mt-2 text-[10px] text-muted/70">Live from {p?.name} API · {timeAgo(a.lastSyncedAt)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Badges shelf */}
          {badgeRows.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-3">Badge constellation</h2>
              <div className="glass p-4 flex flex-wrap gap-4">
                {badgeRows.map(({ badge }) => (
                  <div key={badge.id} className="flex flex-col items-center w-20 text-center" title={badge.description}>
                    <BadgeIcon icon={badge.icon} size={52} />
                    <span className="mt-1.5 text-[11px] leading-tight text-muted">{badge.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Challenge trophy case */}
          {participations.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-3">Challenge trophy case</h2>
              <div className="space-y-2">
                {participations.map(({ p, c }) => (
                  <Link key={p.id} href={`/spaces?challenge=${c.id}`} className="glass glass-hover flex items-center gap-3 p-3">
                    <span className="text-xl">{c.status === "completed" ? "🏆" : "⚡"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{c.title}</div>
                      <div className="text-xs text-muted">{c.game} · {c.status}</div>
                    </div>
                    <div className="text-cyan-300 font-bold">{p.currentPoints} pts</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Activity */}
          {recentPosts.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-3">Recent transmissions</h2>
              <div className="space-y-2">
                {recentPosts.map(({ post, space }) => (
                  <Link key={post.id} href={`/spaces/${space.slug}`} className="glass glass-hover block p-4">
                    <div className="text-xs text-muted mb-1">{space.coverEmoji} {space.name} · {timeAgo(post.createdAt)}</div>
                    <p className="text-sm line-clamp-2">{post.body}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right rail */}
        <aside className="space-y-6">
          {standing && (
            <div className="glass p-5 text-center">
              <div className="text-xs uppercase tracking-widest text-muted">Best standing</div>
              <div className="text-3xl font-bold grad-text mt-2">
                Top {Math.max(1, Math.round((standing.rank / standing.total) * 100))}%
              </div>
              <div className="text-sm text-muted mt-1">#{standing.rank} of {standing.total}</div>
              <div className="text-xs text-cyan-300 mt-1">{standing.title}</div>
              <Link href="/leaderboards" className="ghost-btn mt-4 inline-block rounded-full px-4 py-1.5 text-xs">
                View leaderboards
              </Link>
            </div>
          )}
          <AdSlot placement="profile_sidebar" />
        </aside>
      </div>
    </div>
  );
}
