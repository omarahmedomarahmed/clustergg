import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { guildDetail } from "@/lib/discord/guilds";
import { challengesForGuild } from "@/lib/challenges";
import { listRequests } from "@/lib/challenge-requests";
import { readThread, markThreadRead } from "@/lib/threads";
import ServerThread from "@/components/ServerThread";
import { BotUsage } from "@/components/DiscordAnalytics";
import { ChallengeControls } from "@/components/ChallengeRequestReview";
import { PortalAdmin, DeliveryAdmin } from "@/components/ServerAdmin";
import { AdminSettings } from "@/components/AdminPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Server" };

// One server, in full: who it brought us, what they do with the bot, what it's
// running, and how close it is to earning. The server list answers "how are we
// doing"; this answers "what is happening in THIS community".
export default async function GuildDetailPage({ params }: { params: Promise<{ guildId: string }> }) {
  await requireAdmin();
  const { guildId } = await params;

  const detail = await guildDetail(guildId, 30);
  if (!detail) notFound();

  const [challenges, requests, thread] = await Promise.all([
    challengesForGuild(guildId),
    listRequests({ guildId }),
    readThread("server", guildId),
  ]);
  // Opening the server IS reading its thread — the inbox badge has to clear
  // when staff actually look at it, not when they remember to press something.
  await markThreadRead("server", guildId, "admin");
  const { stats, row, members, challengeJoins, adPosts, adImpressions, commands } = detail;

  return (
    <div className="max-w-5xl">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          {row?.iconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.iconUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
          )}
          <div>
            <h1 className="text-2xl font-bold">{stats.name}</h1>
            <div className="text-[11px] text-muted font-mono">{guildId}</div>
          </div>
        </div>
        <Link href="/admin/discord" className="text-sm text-cyan-300 hover:underline">← All servers</Link>
      </div>

      <ServerThread
        guildId={guildId}
        ownerKnown={!!row?.ownerDiscordId}
        messages={thread}
      />

      <section className="glass p-6 mb-6">
        <h2 className="font-bold mb-4">Growth toward revenue</h2>
        <div className="h-3 rounded-full bg-white/10 overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Discord members" value={stats.memberCount.toLocaleString()} />
          <Stat label="On Cluster" value={stats.joined.toLocaleString()} />
          <Stat label="Linked a game" value={stats.linked.toLocaleString()} accent />
          <Stat
            label={stats.unlocked ? "Sponsored challenges" : "To unlock"}
            value={stats.unlocked ? "Unlocked" : `${stats.remaining.toLocaleString()} more`}
          />
        </div>
        <p className="text-xs text-muted mt-3">
          Only members who joined Cluster <em>and</em> linked a game count — that&apos;s what advertisers pay for.
        </p>
      </section>

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <Stat label="Challenge entries" value={challengeJoins.toLocaleString()} />
        <Stat label="Ad posts delivered" value={adPosts.toLocaleString()} />
        <Stat label="Ad impressions" value={adImpressions.toLocaleString()} />
      </div>

      <section className="glass p-6 mb-6">
        <h2 className="font-bold mb-1">Challenges</h2>
        <p className="text-xs text-muted mb-4">
          Pause, resume or end any of them. Ending freezes the standings and awards the trophies immediately.
        </p>
        {challenges.length === 0 ? (
          <p className="text-sm text-muted">
            None yet. This server can request one from their dashboard, or with{" "}
            <code className="text-cyan-300">/cluster show:admin</code>.
          </p>
        ) : (
          <div className="space-y-4">
            {challenges.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/10 p-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold">{c.title}</div>
                    <div className="text-xs text-muted">
                      {c.game} · {c.status}
                      {c.guildId === guildId ? " · belongs to this server" : " · also running here"}
                      {c.accessKey ? ` · key ${c.accessKey}` : ""}
                    </div>
                  </div>
                  <Link href={`/admin/challenges/${c.id}`} className="text-xs text-cyan-300 hover:underline">
                    Open in builder →
                  </Link>
                </div>
                {c.status !== "completed" && <ChallengeControls challengeId={c.id} status={c.status} />}
              </div>
            ))}
          </div>
        )}
      </section>

      {requests.length > 0 && (
        <section className="glass p-6 mb-6">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-bold">Requests from this server</h2>
            <Link href="/admin/discord/requests" className="text-xs text-cyan-300 hover:underline">Review →</Link>
          </div>
          <div className="space-y-1.5">
            {requests.map((r) => (
              <div key={r.id} className="flex items-baseline justify-between gap-3 text-sm border-t border-white/5 pt-1.5">
                <span>{r.title} <span className="text-muted">· {r.game}</span></span>
                <span className={r.status === "pending" ? "text-amber-300 text-xs" : "text-muted text-xs"}>{r.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mb-6"><BotUsage a={commands} days={30} title="Bot usage in this server" /></div>

      <section className="glass p-6">
        <h2 className="font-bold mb-1">Members we can attribute to this server</h2>
        <p className="text-xs text-muted mb-4">
          Most recent linkers first. Someone appears here the first time they use the bot in this server.
        </p>
        {members.length === 0 ? (
          <p className="text-sm text-muted">Nobody yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="text-left">
                  <th className="py-2 pr-4">Gamer</th>
                  <th className="py-2 pr-4">Linked a game</th>
                  <th className="py-2">Via</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId} className="border-t border-white/5">
                    <td className="py-2 pr-4">
                      <Link href={`/u/${m.slug}`} className="hover:text-cyan-300">{m.displayName}</Link>
                    </td>
                    <td className="py-2 pr-4">
                      {m.firstLinkedAt
                        ? <span className="text-emerald-300">{m.firstLinkedAt.toLocaleDateString()}</span>
                        : <span className="text-muted">not yet</span>}
                    </td>
                    <td className="py-2 text-muted text-xs">{m.attributedVia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Staff control over this server. Below the numbers, because looking is
          the common visit and changing something is the rare one — and every
          control here has a real consequence for a community we don't own. */}
      <AdminSettings title="Manage this server">
        <section className="glass p-6">
          <h2 className="font-bold text-sm mb-1">Owner&apos;s portal</h2>
          <p className="text-xs text-muted mb-4">
            The portal key opens this server&apos;s whole dashboard — growth, challenges, traffic, every
            member&apos;s progress. We never display an existing key; rotating is the only way to change it.
          </p>
          <PortalAdmin guildId={guildId} slug={row?.slug ?? null} hasKey={!!row?.portalKey} />
        </section>

        <section className="glass p-6">
          <h2 className="font-bold text-sm mb-4">Delivery &amp; revenue</h2>
          <DeliveryAdmin
            guildId={guildId}
            announcements={row?.announcementsEnabled ?? true}
            ads={row?.adOptIn ?? false}
            unlocked={stats.unlocked}
            linked={stats.linked}
            threshold={stats.threshold}
          />
        </section>
      </AdminSettings>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`text-xl font-black ${accent ? "text-cyan-300" : ""}`}>{value}</div>
    </div>
  );
}
