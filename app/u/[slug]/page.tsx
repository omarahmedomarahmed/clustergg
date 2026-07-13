import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getProvider } from "@/lib/providers/registry";
import { syncUserAccountsIfStale } from "@/lib/sync";
import { resolveTheme, themeToVars, bgStyle } from "@/lib/theme";
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
    description: user.bio ?? `${user.displayName}'s gamer profile on Cluster.`,
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
  const adminView = isAdmin(viewer) && !isOwner;

  if (user.profileVisibility === "private" && !isOwner && !adminView) {
    return (
      <div className="mx-auto max-w-md px-4 py-32 text-center glass mt-16">
        <Icon name="lock" size={40} className="text-violet-300 mb-4" />
        <h1 className="text-xl font-bold">This constellation is private</h1>
      </div>
    );
  }

  try { await syncUserAccountsIfStale(db, user.id); } catch { /* render regardless */ }

  const theme = resolveTheme(user.theme);
  const vars = themeToVars(theme) as React.CSSProperties;
  const cardCls = `p-card p-card-${theme.cardStyle}`;

  const [accounts, badgeRows, [followerRow], [followingRow], isFollowingRow, recentPosts, participations, allBoards, spaceRows] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    db.select({ badge: schema.badges }).from(schema.userBadges)
      .innerJoin(schema.badges, eq(schema.userBadges.badgeId, schema.badges.id))
      .where(eq(schema.userBadges.userId, user.id)).orderBy(desc(schema.userBadges.awardedAt)),
    db.select({ c: count() }).from(schema.follows).where(eq(schema.follows.followingId, user.id)),
    db.select({ c: count() }).from(schema.follows).where(eq(schema.follows.followerId, user.id)),
    viewer ? db.select().from(schema.follows).where(and(eq(schema.follows.followerId, viewer.id), eq(schema.follows.followingId, user.id))).limit(1) : Promise.resolve([]),
    db.select({ post: schema.posts, space: schema.spaces }).from(schema.posts)
      .innerJoin(schema.spaces, eq(schema.posts.spaceId, schema.spaces.id))
      .where(and(eq(schema.posts.authorId, user.id), sql`${schema.posts.deletedAt} IS NULL`))
      .orderBy(desc(schema.posts.createdAt)).limit(5),
    db.select({ p: schema.challengeParticipants, c: schema.challenges }).from(schema.challengeParticipants)
      .innerJoin(schema.challenges, eq(schema.challengeParticipants.challengeId, schema.challenges.id))
      .where(eq(schema.challengeParticipants.userId, user.id)).orderBy(desc(schema.challengeParticipants.joinedAt)).limit(8),
    db.select().from(schema.leaderboards).where(eq(schema.leaderboards.isActive, true)),
    db.select({ s: schema.spaces }).from(schema.spaceMembers)
      .innerJoin(schema.spaces, eq(schema.spaceMembers.spaceId, schema.spaces.id))
      .where(and(eq(schema.spaceMembers.userId, user.id), eq(schema.spaces.isActive, true))).limit(12),
  ]);

  const accountIds = accounts.map((a) => a.id);
  const stats = accountIds.length ? await db.select().from(schema.statCurrent).where(inArray(schema.statCurrent.linkedAccountId, accountIds)) : [];
  const statsByAccount = new Map<string, typeof stats>();
  for (const s of stats) { if (!statsByAccount.has(s.linkedAccountId)) statsByAccount.set(s.linkedAccountId, []); statsByAccount.get(s.linkedAccountId)!.push(s); }

  const boardIndex = new Map(allBoards.map((b) => [`${b.game}::${b.metricKey}`, b]));
  const standingsByAccount = new Map<string, { title: string; rank: number; total: number; metricKey: string; game: string }[]>();
  let bestStanding: { title: string; rank: number; total: number } | null = null;
  for (const s of stats) {
    const board = boardIndex.get(`${s.game}::${s.metricKey}`);
    if (!board) continue;
    const [better] = await db.select({ c: count() }).from(schema.statCurrent).where(and(eq(schema.statCurrent.game, s.game), eq(schema.statCurrent.metricKey, s.metricKey), gt(schema.statCurrent.metricValue, s.metricValue)));
    const [total] = await db.select({ c: count() }).from(schema.statCurrent).where(and(eq(schema.statCurrent.game, s.game), eq(schema.statCurrent.metricKey, s.metricKey)));
    const rank = Number(better?.c ?? 0) + 1, tot = Math.max(1, Number(total?.c ?? 1));
    const entry = { title: board.title, rank, total: tot, metricKey: s.metricKey, game: s.game };
    if (!standingsByAccount.has(s.linkedAccountId)) standingsByAccount.set(s.linkedAccountId, []);
    standingsByAccount.get(s.linkedAccountId)!.push(entry);
    if (!bestStanding || rank / tot < bestStanding.rank / bestStanding.total) bestStanding = entry;
  }

  const trophyWins = participations.filter(({ p, c }) => c.status === "completed" && p.finalPlacement && p.finalPlacement <= 3);
  const trophyArt = new Map<string, string>();
  const trophyIds = trophyWins.map(({ c }) => c.trophyId).filter((x): x is string => !!x);
  if (trophyIds.length) { const rows = await db.select().from(schema.trophies).where(inArray(schema.trophies.id, trophyIds)); for (const t of rows) trophyArt.set(t.id, t.imageUrl); }
  const activeChallenges = participations.filter(({ c }) => c.status === "active");

  const S = theme.sections;
  const sectionNode = (key: string): React.ReactNode => {
    switch (key) {
      case "accounts":
        if (!S.accounts) return null;
        return (
          <section key={key}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: theme.text }}><Icon name="gamepad" size={19} style={{ color: theme.accent }} /> Connected accounts</h2>
            {accounts.length === 0 ? <div className={`${cardCls} text-center p-muted text-sm`}>No accounts linked yet.</div> : (
              <div className="grid sm:grid-cols-2 gap-4">
                {accounts.map((a) => {
                  const p = getProvider(a.provider); const aStats = statsByAccount.get(a.id) ?? []; const st = standingsByAccount.get(a.id) ?? []; const caps = p?.capabilities ?? [];
                  return (
                    <div key={a.id} className={cardCls}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${theme.accent} 20%, transparent)` }}><Icon name="gamepad" size={18} style={{ color: theme.accent }} /></div>
                        <div className="min-w-0"><div className="font-bold truncate" style={{ color: theme.text }}>{a.inGameName}</div><div className="text-xs p-muted">{p?.name ?? a.provider}</div></div>
                        {a.verified && <span className="ml-auto text-[11px]" style={{ color: theme.accent2 }}>✓ verified</span>}
                      </div>
                      {aStats.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {aStats.slice(0, 6).map((s) => { const cap = caps.find((c) => c.key === s.metricKey); return (
                            <div key={s.id} className="rounded-lg px-2.5 py-1.5" style={{ background: `color-mix(in srgb, ${theme.panel} 60%, transparent)` }}>
                              <div className="text-[10px] uppercase tracking-wider p-muted truncate">{cap?.label ?? s.metricKey}</div>
                              <div className="font-bold" style={{ color: theme.accent2 }}>{s.rankLabel ?? fmtNum(s.metricValue)}</div>
                            </div>); })}
                        </div>
                      )}
                      {st.length > 0 && S.standings && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {st.slice(0, 3).map((x) => (
                            <Link key={x.metricKey} href={`/leaderboards/${encodeURIComponent(x.game)}?stat=${x.metricKey}`} className="text-[11px] rounded-full px-2 py-0.5" style={{ border: `1px solid color-mix(in srgb, ${theme.accent} 35%, transparent)`, color: theme.accent }}>
                              #{x.rank} of {x.total} · {x.title.split("·")[1]?.trim() ?? x.metricKey}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      case "trophies":
        if (!S.trophies || trophyWins.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: theme.text }}><Icon name="trophy" size={19} style={{ color: theme.accent }} /> Trophy case</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {trophyWins.map(({ p, c }) => { const art = c.trophyId ? trophyArt.get(c.trophyId) : undefined; return (
                <div key={p.id} className={`${cardCls} text-center`}>
                  {art ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={art} alt="" className="mx-auto h-28 object-contain float-y" /> : <Icon name="trophy" size={56} className="mx-auto my-6" style={{ color: theme.accent }} />}
                  <div className="mt-2 text-xs font-bold" style={{ color: theme.accent2 }}>{p.finalPlacement === 1 ? "CHAMPION" : `#${p.finalPlacement} PLACE`}</div>
                  <div className="text-sm font-semibold mt-0.5 line-clamp-1" style={{ color: theme.text }}>{c.title}</div>
                </div>); })}
            </div>
          </section>
        );
      case "badges":
        if (!S.badges || badgeRows.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: theme.text }}><Icon name="medal" size={19} style={{ color: theme.accent }} /> Badges</h2>
            <div className={`${cardCls} flex flex-wrap gap-5`}>
              {badgeRows.map(({ badge }) => (
                <div key={badge.id} className="flex flex-col items-center w-20 text-center group" title={badge.description}>
                  <div className="transition-transform group-hover:scale-110"><BadgeIcon icon={badge.icon} size={52} /></div>
                  <span className="mt-1.5 text-[11px] p-muted">{badge.name}</span>
                </div>
              ))}
            </div>
          </section>
        );
      case "challenges":
        if (!S.challenges || activeChallenges.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: theme.text }}><Icon name="zap" size={19} style={{ color: theme.accent }} /> Competing now</h2>
            <div className="space-y-2">
              {activeChallenges.map(({ p, c }) => (
                <div key={p.id} className={`${cardCls} flex items-center gap-3`}>
                  <Icon name="flame" size={20} style={{ color: theme.accent }} />
                  <div className="min-w-0 flex-1"><div className="font-semibold text-sm truncate" style={{ color: theme.text }}>{c.title}</div><div className="text-xs p-muted">{c.game} · ends {timeAgo(c.endAt).replace(" ago", "")}</div></div>
                  <div className="font-bold" style={{ color: theme.accent2 }}>{p.currentPoints} pts</div>
                </div>
              ))}
            </div>
          </section>
        );
      case "activity":
        if (!S.activity || recentPosts.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: theme.text }}><Icon name="message" size={19} style={{ color: theme.accent }} /> Recent posts</h2>
            <div className="space-y-2">
              {recentPosts.map(({ post, space }) => (
                <Link key={post.id} href={`/spaces/${space.slug}`} className={`${cardCls} block`}>
                  <div className="text-xs p-muted mb-1">{space.name} · {timeAgo(post.createdAt)}</div>
                  <p className="text-sm line-clamp-2" style={{ color: theme.text }}>{post.body}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      case "spaces":
        if (!S.spaces || spaceRows.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: theme.text }}><Icon name="users" size={19} style={{ color: theme.accent }} /> My spaces</h2>
            <div className="flex flex-wrap gap-2">
              {spaceRows.map(({ s }) => (
                <Link key={s.id} href={`/spaces/${s.slug}`} className="text-sm rounded-full px-3 py-1.5" style={{ border: `1px solid color-mix(in srgb, ${theme.accent} 30%, transparent)`, color: theme.text }}>{s.name}</Link>
              ))}
            </div>
          </section>
        );
      default: return null;
    }
  };

  return (
    <div
      className={`profile-root ${theme.bgImage ? "has-bg-image" : ""}`}
      style={{ ...vars, ...bgStyle(theme) }}
    >
      {adminView && (
        <div className="bg-amber-500/15 border-b border-amber-400/40 text-amber-200 text-sm text-center py-2 px-4">
          <Icon name="shield" size={14} className="inline mr-1.5" /> Admin view — <Link href={`/admin/users/${user.id}`} className="underline">manage this user in Mission Control</Link>
        </div>
      )}

      {/* Cover */}
      <div className="relative">
        <div className="h-52 md:h-64 bg-cover bg-center" style={{ backgroundImage: user.bannerUrl ? `url("${user.bannerUrl}")` : `linear-gradient(92deg, ${theme.accent}, ${theme.accent2})` }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent, ${theme.bg})` }} />
      </div>

      <div className="mx-auto max-w-5xl px-4 relative -mt-16">
        <div className="flex flex-wrap items-end gap-5">
          <div className={`p-avatar-${theme.avatarShape} overflow-hidden border-2`} style={{ borderColor: theme.accent, width: 120, height: 120 }}>
            <Avatar name={user.displayName} src={user.avatarUrl} size={120} className="!rounded-none" />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2 flex-wrap" style={{ color: theme.text }}>
              {user.displayName}
              {user.isVerified && <Icon name="check" size={20} strokeWidth={3} style={{ color: theme.accent2 }} />}
            </h1>
            {user.title && <div className="text-lg font-semibold p-grad">{user.title}</div>}
            <div className="flex items-center gap-2 text-sm p-muted mt-1">
              <span>clustergg.com/u/{user.slug}</span><CopyLinkButton path={`/u/${user.slug}`} />
            </div>
          </div>
          <div className="flex gap-3 pb-1">
            {isOwner ? (
              <Link href="/profile" className={`p-btn p-btn-${theme.buttonStyle}`}><Icon name="edit" size={14} /> Customize</Link>
            ) : viewer ? (
              <>
                <FollowButton targetUserId={user.id} isFollowing={isFollowingRow.length > 0} path={`/u/${user.slug}`} />
                <form action={startConversation.bind(null, user.id)}><button className={`p-btn p-btn-${theme.buttonStyle === "neon" ? "glass" : "outline"}`}><Icon name="message" size={14} /> Message</button></form>
              </>
            ) : (
              <Link href="/signup" className={`p-btn p-btn-${theme.buttonStyle}`}>Join to follow</Link>
            )}
          </div>
        </div>

        {user.bio && <p className="mt-4 max-w-2xl" style={{ color: theme.muted }}>{user.bio}</p>}
        <div className="flex flex-wrap gap-6 mt-4 text-sm">
          <Link href={`/u/${user.slug}/followers`} style={{ color: theme.text }}><b>{Number(followerRow?.c ?? 0)}</b> <span className="p-muted">followers</span></Link>
          <Link href={`/u/${user.slug}/following`} style={{ color: theme.text }}><b>{Number(followingRow?.c ?? 0)}</b> <span className="p-muted">following</span></Link>
          {bestStanding && S.standings && <span style={{ color: theme.accent }}><Icon name="chart" size={14} className="inline mr-1" /> Top {Math.max(1, Math.round((bestStanding.rank / bestStanding.total) * 100))}% · {bestStanding.title}</span>}
        </div>

        <div className="mt-8 space-y-10 pb-16">
          {theme.order.map((key) => sectionNode(key))}
        </div>
      </div>

      {/* Platform ad — kept subtle at the very bottom, outside themed content */}
      <div className="mx-auto max-w-5xl px-4 pb-10"><AdSlot placement="profile_footer_banner" /></div>
    </div>
  );
}
