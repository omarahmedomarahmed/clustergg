import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import Avatar from "@/components/Avatar";
import { BadgeIcon } from "@/components/BadgeChip";
import { adminUnlinkAccount, adminResyncAccount, setUserStatus } from "@/app/actions/admin";
import { getProvider } from "@/lib/providers/registry";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!user) notFound();

  const [accounts, badges, participations] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, id)),
    db.select({ b: schema.badges, ub: schema.userBadges })
      .from(schema.userBadges)
      .innerJoin(schema.badges, eq(schema.userBadges.badgeId, schema.badges.id))
      .where(eq(schema.userBadges.userId, id)),
    db.select({ p: schema.challengeParticipants, c: schema.challenges })
      .from(schema.challengeParticipants)
      .innerJoin(schema.challenges, eq(schema.challengeParticipants.challengeId, schema.challenges.id))
      .where(eq(schema.challengeParticipants.userId, id))
      .orderBy(desc(schema.challengeParticipants.joinedAt)),
  ]);

  return (
    <div className="space-y-6">
      <div className="glass p-6 flex flex-wrap items-center gap-4">
        <Avatar name={user.displayName} src={user.avatarUrl} size={64} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">{user.displayName} <span className="text-muted font-normal text-sm">@{user.slug}</span></h1>
          <div className="text-sm text-muted">{user.email} · {user.role} · joined {timeAgo(user.createdAt)}</div>
          <div className={`text-xs mt-1 ${user.status === "active" ? "text-emerald-300" : "text-rose-300"}`}>● {user.status}</div>
        </div>
        <Link href={`/u/${user.slug}`} className="ghost-btn rounded-full px-4 py-1.5 text-sm">Public profile →</Link>
        {user.role !== "superadmin" && (
          user.status === "active" ? (
            <form action={setUserStatus.bind(null, user.id, "suspended")}>
              <button className="rounded-full px-4 py-1.5 text-sm border border-amber-400/40 text-amber-300">Suspend</button>
            </form>
          ) : (
            <form action={setUserStatus.bind(null, user.id, "active")}>
              <button className="ghost-btn rounded-full px-4 py-1.5 text-sm">Restore</button>
            </form>
          )
        )}
      </div>

      <section className="glass p-6">
        <h2 className="font-bold mb-4">Linked accounts ({accounts.length})</h2>
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 border border-violet-400/15 rounded-lg p-3">
              <span className="text-xs font-bold text-violet-300 border border-violet-400/25 rounded-lg px-2 py-1">{(getProvider(a.provider)?.name ?? a.provider).slice(0, 3).toUpperCase()}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{a.inGameName} · {getProvider(a.provider)?.name ?? a.provider}</div>
                <div className="text-xs text-muted">
                  status: {a.syncStatus}{a.syncError ? ` — ${a.syncError}` : ""}{a.lastSyncedAt ? ` · synced ${timeAgo(a.lastSyncedAt)}` : ""}
                </div>
              </div>
              <form action={adminResyncAccount.bind(null, a.id)}>
                <button className="text-xs ghost-btn rounded-full px-3 py-1">Re-sync</button>
              </form>
              <form action={adminUnlinkAccount.bind(null, a.id)}>
                <button className="text-xs rounded-full px-3 py-1 border border-rose-400/40 text-rose-300">Force unlink</button>
              </form>
            </div>
          ))}
          {accounts.length === 0 && <p className="text-sm text-muted">No linked accounts.</p>}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="glass p-6">
          <h2 className="font-bold mb-4">Badges ({badges.length})</h2>
          <div className="flex flex-wrap gap-3">
            {badges.map(({ b }) => (
              <div key={b.id} className="flex items-center gap-2 border border-violet-400/15 rounded-full px-3 py-1.5">
                <BadgeIcon icon={b.icon} size={22} />
                <span className="text-xs">{b.name}</span>
              </div>
            ))}
            {badges.length === 0 && <p className="text-sm text-muted">None earned yet.</p>}
          </div>
        </section>
        <section className="glass p-6">
          <h2 className="font-bold mb-4">Challenge history</h2>
          <div className="space-y-2">
            {participations.map(({ p, c }) => (
              <div key={p.id} className="text-sm flex justify-between gap-2">
                <span className="truncate">{c.title}</span>
                <span className="text-cyan-300 shrink-0">{p.currentPoints} pts · {p.status}</span>
              </div>
            ))}
            {participations.length === 0 && <p className="text-sm text-muted">No challenges joined.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
