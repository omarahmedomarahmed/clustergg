import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { providerInfoList } from "@/lib/providers/serialize";
import { getProvider } from "@/lib/providers/registry";
import ProfileBuilder from "@/components/ProfileBuilder";
import LinkAccountForm from "@/components/LinkAccountForm";
import Icon from "@/components/Icon";
import { unlinkGameAccount, resyncGameAccount } from "@/app/actions/connections";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customize profile" };

const STATUS_STYLE: Record<string, string> = {
  ok: "text-emerald-300", pending: "text-amber-300", rate_limited: "text-amber-300",
  error: "text-rose-300", revoked: "text-rose-300", needs_key: "text-amber-300",
  needs_reconnect: "text-amber-300",
};
const STATUS_LABEL: Record<string, string> = { needs_reconnect: "reconnect needed" };

export default async function OwnProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const accounts = await db.select().from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.userId, user.id));

  // Compact, real data so the builder preview shows the actual profile — real
  // accounts, challenges, badges, planets — not placeholder cards.
  const [badgeRows, participations, spaceRows, postCountRow] = await Promise.all([
    db.select({ badge: schema.badges }).from(schema.userBadges)
      .innerJoin(schema.badges, eq(schema.userBadges.badgeId, schema.badges.id))
      .where(eq(schema.userBadges.userId, user.id)).orderBy(desc(schema.userBadges.awardedAt)).limit(12),
    db.select({ p: schema.challengeParticipants, c: schema.challenges }).from(schema.challengeParticipants)
      .innerJoin(schema.challenges, eq(schema.challengeParticipants.challengeId, schema.challenges.id))
      .where(eq(schema.challengeParticipants.userId, user.id)).orderBy(desc(schema.challengeParticipants.joinedAt)).limit(8),
    db.select({ s: schema.spaces }).from(schema.spaceMembers)
      .innerJoin(schema.spaces, eq(schema.spaceMembers.spaceId, schema.spaces.id))
      .where(and(eq(schema.spaceMembers.userId, user.id), eq(schema.spaces.isActive, true))).limit(12),
    db.select({ c: sql<number>`count(*)` }).from(schema.posts)
      .where(and(eq(schema.posts.authorId, user.id), sql`${schema.posts.deletedAt} IS NULL`)),
  ]);

  const previewData = {
    accounts: accounts.map((a) => ({ name: a.inGameName, provider: getProvider(a.provider)?.name ?? a.provider })),
    trophies: participations.filter(({ p, c }) => c.status === "completed" && p.finalPlacement && p.finalPlacement <= 3)
      .map(({ c }) => ({ title: c.title, game: c.game })),
    badges: badgeRows.map(({ badge }) => ({ name: badge.name })),
    challenges: participations.filter(({ c }) => c.status === "active").map(({ c }) => ({ title: c.title, game: c.game })),
    spaces: spaceRows.map(({ s }) => ({ name: s.name })),
    postsCount: Number(postCountRow[0]?.c ?? 0),
    standingsCount: accounts.length,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Your <span className="grad-text">profile</span></h1>
          <p className="text-sm text-muted mt-1">Connect your games and make this page yours. Everything saves to clustergg.com/u/{user.slug}.</p>
        </div>
        <Link href={`/u/${user.slug}`} className="ghost-btn pressable rounded-full px-4 py-1.5 text-sm inline-flex items-center gap-2">
          <Icon name="eye" size={14} /> View live profile
        </Link>
      </div>

      {/* ===== Game accounts (linking lives here now, not in settings) ===== */}
      <section className="glass p-5 md:p-6 mb-8">
        <h2 className="font-bold flex items-center gap-2 mb-1"><Icon name="link" size={18} className="text-cyan-300" /> Your game accounts</h2>
        <p className="text-sm text-muted mb-5">Connect a game to pull your live stats onto your profile and leaderboards. Your progress stays even if a token expires.</p>

        {accounts.length > 0 && (
          <div className="space-y-3 mb-6">
            {accounts.map((a) => {
              const p = getProvider(a.provider);
              return (
                <div key={a.id} className="rounded-xl border border-violet-400/15 bg-black/20 flex flex-wrap items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-600/25 to-cyan-600/15 shrink-0"><Icon name="gamepad" size={18} className="text-violet-200" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{a.inGameName} <span className="text-muted font-normal text-sm">· {p?.name ?? a.provider}</span></div>
                    <div className="text-xs text-muted">
                      <span className={STATUS_STYLE[a.syncStatus] ?? "text-muted"}>● {STATUS_LABEL[a.syncStatus] ?? a.syncStatus}</span>
                      {a.lastSyncedAt && <> · synced {timeAgo(a.lastSyncedAt)}</>}
                      {a.syncError && a.syncStatus !== "needs_reconnect" && <> · {a.syncError}</>}
                    </div>
                    {a.syncStatus === "needs_reconnect" && (
                      <div className="text-[11px] text-amber-300/90 mt-1">
                        Session expired — your stats are safe. Re-link below with a fresh in-game code to resume syncing.
                      </div>
                    )}
                  </div>
                  {a.provider !== "mobile-legends" && (
                    <form action={resyncGameAccount.bind(null, a.id, "/profile")}>
                      <button className="ghost-btn rounded-full px-4 py-1.5 text-xs">Re-sync</button>
                    </form>
                  )}
                  <form action={unlinkGameAccount.bind(null, a.id)}>
                    <button className="rounded-full px-4 py-1.5 text-xs border border-rose-400/40 text-rose-300 hover:bg-rose-500/10">Unlink</button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-sm font-semibold mb-3 text-muted">Add a game</div>
        <LinkAccountForm providers={providerInfoList()} />
      </section>

      {/* ===== Builder ===== */}
      <ProfileBuilder
        slug={user.slug}
        displayName={user.displayName}
        initialTheme={user.theme}
        initialTitle={user.title ?? ""}
        initialBio={user.bio ?? ""}
        initialAvatar={user.avatarUrl ?? ""}
        initialBanner={user.bannerUrl ?? ""}
        previewData={previewData}
      />
    </div>
  );
}
