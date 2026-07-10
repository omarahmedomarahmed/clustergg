import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers/registry";
import { syncUserAccountsIfStale } from "@/lib/sync";
import { getContent } from "@/lib/cms";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
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
        <Icon name="lock" size={40} className="text-violet-300 mb-4" />
        <h1 className="text-xl font-bold">This constellation is private</h1>
        <p className="text-muted mt-2 text-sm">The owner has hidden their profile from the public galaxy.</p>
      </div>
    );
  }

  try { await syncUserAccountsIfStale(db, user.id); } catch { /* page must render regardless */ }

  const cms = await getContent(["banner.profileDefault"]);
  const [accounts, badgeRows, [followerRow], [followingRow], isFollowingRow, recentPosts, participations, allBoards] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    db.select({ badge: schema.badges })
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
      .orderBy(desc(schema.challengeParticipants.joinedAt)).limit(8),
    db.select().from(schema.leaderboards).where(eq(schema.leaderboards.isActive, true)),
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

  // Per-account leaderboard standings: rank on every active board this account appears on.
  const boardIndex = new Map(allBoards.map((b) => [`${b.game}::${b.metricKey}`, b]));
  const standingsByAccount = new Map<string, { title: string; rank: number; total: number; metricKey: string }[]>();
  let bestStanding: { title: string; rank: number; total: number } | null = null;
  for (const s of stats) {
    const board = boardIndex.get(`${s.game}::${s.metricKey}`);
    if (!board) continue;
    const [better] = await db.select({ c: count() }).from(schema.statCurrent).where(and(
      eq(schema.statCurrent.game, s.game), eq(schema.statCurrent.metricKey, s.metricKey),
      gt(schema.statCurrent.metricValue, s.metricValue)));
    const [total] = await db.select({ c: count() }).from(schema.statCurrent).where(and(
      eq(schema.statCurrent.game, s.game), eq(schema.statCurrent.metricKey, s.metricKey)));
    const rank = Number(better?.c ?? 0) + 1;
    const tot = Math.max(1, Number(total?.c ?? 1));
    const entry = { title: board.title, rank, total: tot, metricKey: s.metricKey };
    if (!standingsByAccount.has(s.linkedAccountId)) standingsByAccount.set(s.linkedAccountId, []);
    standingsByAccount.get(s.linkedAccountId)!.push(entry);
    if (!bestStanding || rank / tot < bestStanding.rank / bestStanding.total) bestStanding = entry;
  }

  // Trophy case: podium finishes in completed challenges.
  const trophyWins = participations.filter(({ p, c }) => c.status === "completed" && p.finalPlacement && p.finalPlacement <= 3);
  const trophyArt = new Map<string, string>();
  const trophyIdList = trophyWins.map(({ c }) => c.trophyId).filter((x): x is string => !!x);
  if (trophyIdList.length) {
    const rows = await db.select().from(schema.trophies).where(inArray(schema.trophies.id, trophyIdList));
    for (const t of rows) trophyArt.set(t.id, t.imageUrl);
  }

  const bannerUrl = user.bannerUrl ?? cms["banner.profileDefault"];

  return (
    <div>
      {/* ===== Cinematic header ===== */}
      <section className="relative">
        <div className="h-56 md:h-72 relative overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bannerUrl})` }} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#04051a]/30 to-[#04051a]" />
        </div>
        <div className="mx-auto max-w-5xl px-4">
          <div className="relative -mt-16 md:-mt-20 flex flex-wrap items-end gap-5">
            <div className="relative">
              <Avatar name={user.displayName} src={user.avatarUrl} size={128} className="pulse-glow !border-2 !border-violet-400/50" />
              {user.isVerified && (
                <span className="absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 border-2 border-[#04051a]" title="Verified">
                  <Icon name="check" size={14} className="text-white" strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3 flex-wrap">
                {user.displayName}
                {user.country && (
                  <span className="text-[11px] font-bold tracking-widest rounded-md border border-violet-400/30 px-2 py-0.5 text-muted">{user.country}</span>
                )}
              </h1>
              <div className="flex items-center gap-2 text-sm text-muted mt-1">
                <span className="inline-flex items-center gap-1.5"><Icon name="link" size={13} /> clustergg.com/u/{user.slug}</span>
                <CopyLinkButton path={`/u/${user.slug}`} />
              </div>
            </div>
            <div className="flex gap-3 pb-1">
              {isOwner ? (
                <Link href="/profile" className="ghost-btn pressable rounded-full px-5 py-2 text-sm inline-flex items-center gap-2">
                  <Icon name="edit" size={14} /> Edit profile
                </Link>
              ) : viewer ? (
                <>
                  <FollowButton targetUserId={user.id} isFollowing={isFollowingRow.length > 0} path={`/u/${user.slug}`} />
                  <form action={startConversation.bind(null, user.id)}>
                    <button className="ghost-btn pressable rounded-full px-5 py-2 text-sm inline-flex items-center gap-2">
                      <Icon name="message" size={14} /> Message
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/signup" className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white">
                  Join to follow
                </Link>
              )}
            </div>
          </div>

          {user.bio && <p className="text-muted mt-4 max-w-2xl">{user.bio}</p>}
          <div className="flex flex-wrap gap-6 mt-4 text-sm">
            <Link href={`/u/${user.slug}/followers`} className="hover:text-cyan-300 inline-flex items-center gap-1.5">
              <Icon name="users" size={15} className="text-muted" /><b>{Number(followerRow?.c ?? 0)}</b> <span className="text-muted">followers</span>
            </Link>
            <Link href={`/u/${user.slug}/following`} className="hover:text-cyan-300">
              <b>{Number(followingRow?.c ?? 0)}</b> <span className="text-muted">following</span>
            </Link>
            {bestStanding && (
              <span className="inline-flex items-center gap-1.5 text-amber-300">
                <Icon name="trophy" size={15} />
                Top {Math.max(1, Math.round((bestStanding.rank / bestStanding.total) * 100))}% · {bestStanding.title}
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 mt-10 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-10 min-w-0">
          {/* Connected accounts */}
          <section>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Icon name="gamepad" size={19} className="text-cyan-300" /> Connected accounts</h2>
            {accounts.length === 0 ? (
              <div className="glass p-8 text-center text-muted text-sm">
                No accounts linked yet{isOwner && <> — <Link href="/settings/connections" className="text-cyan-300 underline">link your first</Link></>}.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {accounts.map((a) => {
                  const p = getProvider(a.provider);
                  const aStats = statsByAccount.get(a.id) ?? [];
                  const standings = standingsByAccount.get(a.id) ?? [];
                  const caps = p?.capabilities ?? [];
                  return (
                    <div key={a.id} className="glass card-lift p-5 glow-sweep">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-600/25 to-cyan-600/15">
                          <Icon name="gamepad" size={20} className="text-violet-200" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold truncate">{a.inGameName}</div>
                          <div className="text-xs text-muted">{p?.name ?? a.provider}{a.region ? ` · ${a.region}` : ""}</div>
                        </div>
                        {a.verified && (
                          <span className="ml-auto inline-flex items-center gap-1 text-emerald-300 text-[11px]" title="API verified">
                            <Icon name="check" size={12} /> verified
                          </span>
                        )}
                      </div>
                      {aStats.length > 0 && (
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          {aStats.slice(0, 6).map((s) => {
                            const cap = caps.find((cp) => cp.key === s.metricKey);
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
                      {standings.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {standings.slice(0, 3).map((st) => (
                            <Link
                              key={st.metricKey}
                              href={`/leaderboards/${encodeURIComponent(p?.game ?? "")}?stat=${st.metricKey}`}
                              className="inline-flex items-center gap-1 text-[11px] rounded-full border border-amber-400/30 bg-amber-400/5 text-amber-200 px-2 py-0.5 hover:border-amber-400/60"
                            >
                              <Icon name="chart" size={10} /> #{st.rank} of {st.total} · {st.title.split("·")[1]?.trim() ?? st.metricKey}
                            </Link>
                          ))}
                        </div>
                      )}
                      {a.lastSyncedAt && (
                        <div className="mt-3 text-[10px] text-muted/70 inline-flex items-center gap-1">
                          <Icon name="wave" size={10} /> Live from {p?.name} API · {timeAgo(a.lastSyncedAt)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Trophy case */}
          {trophyWins.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Icon name="trophy" size={19} className="text-amber-300" /> Trophy case</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {trophyWins.map(({ p, c }) => {
                  const art = c.trophyId ? trophyArt.get(c.trophyId) : undefined;
                  return (
                    <div key={p.id} className="glass card-lift p-4 text-center">
                      {art ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={art} alt="" className="mx-auto h-32 object-contain float-y" />
                      ) : (
                        <Icon name="trophy" size={64} className="text-amber-300 my-6" />
                      )}
                      <div className={`mt-2 text-xs font-bold ${p.finalPlacement === 1 ? "text-amber-300" : p.finalPlacement === 2 ? "text-slate-200" : "text-orange-300"}`}>
                        {p.finalPlacement === 1 ? "CHAMPION" : `#${p.finalPlacement} PLACE`}
                      </div>
                      <div className="text-sm font-semibold mt-0.5 line-clamp-1">{c.title}</div>
                      <div className="text-[11px] text-muted">{c.game} · {p.currentPoints} pts</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Badges */}
          {badgeRows.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Icon name="medal" size={19} className="text-violet-300" /> Badge constellation</h2>
              <div className="glass p-5 flex flex-wrap gap-5">
                {badgeRows.map(({ badge }) => (
                  <div key={badge.id} className="flex flex-col items-center w-20 text-center group" title={badge.description}>
                    <div className="transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
                      <BadgeIcon icon={badge.icon} size={56} />
                    </div>
                    <span className="mt-2 text-[11px] leading-tight text-muted">{badge.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Active challenges */}
          {participations.filter(({ c }) => c.status === "active").length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Icon name="zap" size={19} className="text-amber-300" /> Competing now</h2>
              <div className="space-y-2">
                {participations.filter(({ c }) => c.status === "active").map(({ p, c }) => (
                  <div key={p.id} className="glass card-lift flex items-center gap-3 p-4">
                    <Icon name="flame" size={20} className="text-amber-300" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{c.title}</div>
                      <div className="text-xs text-muted">{c.game} · ends {timeAgo(c.endAt).replace(" ago", "")}</div>
                    </div>
                    <div className="text-cyan-300 font-bold">{p.currentPoints} pts</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Activity */}
          {recentPosts.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Icon name="message" size={19} className="text-cyan-300" /> Recent transmissions</h2>
              <div className="space-y-2">
                {recentPosts.map(({ post, space }) => (
                  <Link key={post.id} href={`/spaces/${space.slug}`} className="glass card-lift block p-4">
                    <div className="text-xs text-muted mb-1">{space.name} · {timeAgo(post.createdAt)}</div>
                    <p className="text-sm line-clamp-2">{post.body}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right rail */}
        <aside className="space-y-6">
          {bestStanding && (
            <div className="glass p-6 text-center glow-sweep">
              <div className="text-xs uppercase tracking-widest text-muted inline-flex items-center gap-1.5">
                <Icon name="chart" size={12} /> Best standing
              </div>
              <div className="text-4xl font-bold grad-text mt-2">
                Top {Math.max(1, Math.round((bestStanding.rank / bestStanding.total) * 100))}%
              </div>
              <div className="text-sm text-muted mt-1">#{bestStanding.rank} of {bestStanding.total}</div>
              <div className="text-xs text-cyan-300 mt-1">{bestStanding.title}</div>
              <Link href="/leaderboards" className="ghost-btn pressable mt-4 inline-block rounded-full px-4 py-1.5 text-xs">
                View leaderboards
              </Link>
            </div>
          )}
          <AdSlot placement="profile_sidebar" />
        </aside>
      </div>

      {/* Ad moved to the bottom of the profile per design */}
      <div className="mx-auto max-w-5xl px-4 mt-12">
        <AdSlot placement="profile_footer_banner" />
      </div>
    </div>
  );
}
