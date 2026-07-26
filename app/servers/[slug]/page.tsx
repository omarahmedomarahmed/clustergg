import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerBySlugOrId, portalData, serverBoard, serverCommandFeed, TIERS } from "@/lib/server-portal";
import { hasPortalSession } from "@/lib/portal-auth";
import { challengesForGuild } from "@/lib/challenges";
import { listRequests } from "@/lib/challenge-requests";
import Tabs from "@/components/Tabs";
import Icon from "@/components/Icon";
import PortalKeyHandoff from "@/components/PortalKeyHandoff";
import { ServerBoard, TierLadder, FunnelPanel, ChallengeRow, CommandFeed } from "@/components/ServerPortal";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const server = await getServerBySlugOrId(slug);
  return { title: server ? `${server.name} · Server portal` : "Server portal" };
}

// The server-owner portal.
//
// Two audiences on one route. The owner, holding the key, gets the whole
// dashboard: growth, tiers, challenges, requests, funnel, command activity.
// Everyone else gets the PUBLIC view — badges, tier, challenges and an invite —
// because a server's standing is something they should be able to show off,
// and it's how one owner discovers what another is doing.
export default async function ServerPortalPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ key?: string; unlock?: string }>;
}) {
  const { slug } = await params;
  const { key = "", unlock = "" } = await searchParams;

  const server = await getServerBySlugOrId(slug);
  if (!server) notFound();

  // A shared `?key=` link hands off to the unlock handler rather than doing the
  // exchange here. Setting a cookie during a Server Component render throws in
  // Next, so this page used to crash on a CORRECT key while a wrong one showed
  // the locked view — the failure only appeared on success. The handler sets
  // the session and sends the reader back here with no key in the URL, which is
  // also what keeps it out of browser history, logs and the Referer of every
  // outbound link on the page.
  // Hand a shared `?key=` link to the unlock route with a real form
  // submission. The page can't do the exchange itself (a Server Component
  // render may not write cookies) and can't `redirect()` there either — App
  // Router redirects go through the client router, which doesn't reliably
  // follow a route handler's 307.
  if (key) return <PortalKeyHandoff kind="server" slug={server.slug ?? server.guildId} portalKey={key} />;
  const unlocked = await hasPortalSession("server", server.guildId);

  const data = await portalData(server);
  if (!data) notFound();

  const base = `/servers/${server.slug ?? server.guildId}`;

  if (!unlocked) return <PublicView server={server} data={data} base={base} unlock={unlock} />;

  const [challenges, requests, board, feed] = await Promise.all([
    challengesForGuild(server.guildId),
    listRequests({ guildId: server.guildId }),
    serverBoard(),
    serverCommandFeed(server.guildId),
  ]);

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="min-h-screen">
      <PortalHeader server={server} data={data} />

      <div className="mx-auto max-w-6xl px-4 pb-20">
        <Tabs tabs={[
          {
            key: "overview", label: "Overview", icon: "chart",
            node: (
              <div className="space-y-6">
                <TierLadder tiers={TIERS} linked={data.stats.linked} current={data.tier.current.key} />
                <div className="grid md:grid-cols-2 gap-6">
                  <FunnelPanel funnel={data.funnel.totals} />
                  <div className="glass p-6">
                    <h2 className="font-bold mb-4">Badges</h2>
                    <div className="flex flex-wrap gap-2">
                      {data.badges.map((b) => (
                        <span
                          key={b.name}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                            b.earned
                              ? "border-amber-400/50 bg-amber-500/10 text-amber-100"
                              : "border-white/10 text-muted opacity-50"
                          }`}
                        >
                          <Icon name={b.icon} size={14} />{b.name}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted mt-4">
                      Your badges and tier are public at{" "}
                      <Link href={base} className="text-cyan-300 hover:underline">{base}</Link> — anyone can see them,
                      only you can see this dashboard.
                    </p>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: "challenges", label: `Challenges (${challenges.length})`, icon: "trophy",
            node: (
              <div className="space-y-4">
                <div className="glass p-6">
                  <h2 className="font-bold mb-1">Run a challenge for your community</h2>
                  <p className="text-sm text-muted">
                    Build it in Discord with <code className="text-cyan-300">/cluster admin</code> → Request a challenge.
                    We review it, then post it in your server with an entry key only your members have.
                  </p>
                </div>
                {challenges.length === 0
                  ? <p className="text-sm text-muted">Nothing running yet.</p>
                  : challenges.map((c) => (
                    <ChallengeRow
                      key={c.id}
                      challenge={{
                        id: c.id, title: c.title, game: c.game, status: c.status,
                        accessKey: c.guildId === server.guildId ? c.accessKey : null,
                        endAt: c.endAt.toISOString(), owned: c.guildId === server.guildId,
                      }}
                      funnel={data.funnel.byChallenge.find((f) => f.challengeId === c.id) ?? null}
                    />
                  ))}
              </div>
            ),
          },
          {
            key: "requests", label: pending.length ? `Requests (${pending.length})` : "Requests", icon: "clock",
            node: (
              <div className="space-y-3">
                {requests.length === 0 ? (
                  <p className="text-sm text-muted">
                    No requests yet. Start one in Discord with <code className="text-cyan-300">/cluster admin</code>.
                  </p>
                ) : requests.map((r) => (
                  <div key={r.id} className="glass p-5 flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-bold">{r.title}</div>
                      <div className="text-xs text-muted">
                        {r.game} · {r.days} days
                        {r.prizeValue > 0 ? ` · ${r.prizeValue.toLocaleString()} ${r.prizeCurrency} prize` : ""}
                      </div>
                      {r.reviewNote && <p className="text-xs text-muted mt-2">Note from Cluster: {r.reviewNote}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-widest ${
                      r.status === "approved" ? "border-emerald-400/40 text-emerald-300 bg-emerald-500/10"
                        : r.status === "rejected" ? "border-white/15 text-muted"
                          : "border-amber-400/50 text-amber-200 bg-amber-500/10"}`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: "activity", label: "Activity", icon: "users",
            node: (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Metric label="Discord members" value={data.stats.memberCount} />
                  <Metric label="On Cluster" value={data.stats.joined} />
                  <Metric label="Linked a game" value={data.stats.linked} accent />
                  <Metric label="Left" value={data.stats.left} />
                </div>
                <CommandFeed
                  rows={feed.map((f) => ({
                    command: f.command, screen: f.screen, arg: f.arg,
                    who: f.displayName ?? "someone", slug: f.slug,
                    at: f.createdAt.toISOString(),
                  }))}
                />
              </div>
            ),
          },
          {
            key: "board", label: "Server board", icon: "trophy",
            node: (
              <ServerBoard
                rows={board.map((b) => ({
                  guildId: b.guildId, slug: b.slug, name: b.name, iconUrl: b.iconUrl,
                  linked: b.linked, challenges: b.challenges,
                  tier: b.tier.name, icon: b.tier.icon, rank: b.rank,
                }))}
                highlight={server.guildId}
              />
            ),
          },
        ]} />
      </div>
    </div>
  );
}

// ===== Locked / public =====

async function PublicView({ server, data, base, unlock }: {
  server: Awaited<ReturnType<typeof getServerBySlugOrId>> & object;
  data: NonNullable<Awaited<ReturnType<typeof portalData>>>;
  base: string;
  unlock?: string;
}) {
  const challenges = await challengesForGuild(server.guildId);
  const live = challenges.filter((c) => c.status === "active");
  const alreadyIn = await hasPortalSession("server", server.guildId);

  return (
    <div className="min-h-screen">
      <PortalHeader server={server} data={data} publicView />

      <div className="mx-auto max-w-5xl px-4 pb-20 space-y-6">
        <div className="glass p-6">
          <h2 className="font-bold mb-4">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {data.badges.filter((b) => b.earned).map((b) => (
              <span key={b.name} className="inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
                <Icon name={b.icon} size={14} />{b.name}
              </span>
            ))}
            {data.badges.every((b) => !b.earned) && <span className="text-sm text-muted">No badges yet.</span>}
          </div>
        </div>

        {live.length > 0 && (
          <div className="glass p-6">
            <h2 className="font-bold mb-1">Challenges running here</h2>
            <p className="text-xs text-muted mb-4">
              Anyone can follow these. Entering needs the key — join the server to get it.
            </p>
            <div className="space-y-2">
              {live.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 border-t border-white/5 pt-2 text-sm">
                  <span>{c.title} <span className="text-muted">· {c.game}</span></span>
                  <span className="text-xs text-muted">{new Date(c.endAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
            {server.inviteUrl && (
              <a
                href={server.inviteUrl} target="_blank" rel="noreferrer"
                className="grad-btn pressable rounded-full px-6 py-2.5 font-bold inline-block mt-4"
              >
                Join {server.name} for the key
              </a>
            )}
          </div>
        )}

        <div className="glass p-6">
          <h2 className="font-bold mb-1">Are you this server&apos;s owner?</h2>
          <p className="text-sm text-muted mb-4">
            Enter the portal key we DM&apos;d you when you added ClusterBot. It unlocks your growth
            numbers, your challenges, and what your members do with the bot.
          </p>
          {/* POSTs to the handler, so the key never enters a URL at all — not
              the address bar, not history, not a server log. */}
          <form method="POST" action="/api/portal/unlock" className="flex flex-wrap gap-2">
            <input type="hidden" name="kind" value="server" />
            <input type="hidden" name="slug" value={server.slug ?? server.guildId} />
            <input
              name="key" required autoComplete="off" spellCheck={false}
              placeholder="Portal key"
              className="input-cosmic w-full sm:w-72 uppercase tracking-widest"
            />
            <button className="grad-btn pressable rounded-full px-6 py-2.5 font-bold">Unlock</button>
          </form>
          {unlock === "bad" && (
            <p className="text-xs text-rose-300 mt-2">
              That key didn&apos;t match. Check for a missing dash, or run <code className="text-cyan-300">/cluster admin</code> in
              your server and the bot will DM it again.
            </p>
          )}
          {unlock === "throttled" && (
            <p className="text-xs text-amber-300 mt-2">
              Too many attempts. Wait a few minutes and try again — this protects your portal from being guessed at.
            </p>
          )}
          {alreadyIn && <p className="text-xs text-emerald-300 mt-2">You&apos;re signed in to this portal.</p>}
          <p className="text-[11px] text-muted mt-3">
            Lost it? Run <code className="text-cyan-300">/cluster server</code> in your Discord server and the bot will DM it again.
          </p>
        </div>
      </div>
    </div>
  );
}

function PortalHeader({ server, data, publicView }: {
  server: { name: string; iconUrl: string | null; guildId: string; inviteUrl: string | null };
  data: NonNullable<Awaited<ReturnType<typeof portalData>>>;
  publicView?: boolean;
}) {
  return (
    <div className="relative border-b border-white/10 mb-8">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 via-transparent to-cyan-500/10" />
      <div className="relative mx-auto max-w-6xl px-4 py-10 flex items-center gap-5 flex-wrap">
        {server.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={server.iconUrl} alt="" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/20" />
        ) : (
          <div className="h-20 w-20 rounded-2xl grid place-items-center bg-violet-500/20 text-3xl"><Icon name="satellite" size={20} className="text-violet-200" /></div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-black">{server.name}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-100">
              <Icon name={data.tier.current.icon} size={13} />{data.tier.current.name}
            </span>
          </div>
          <p className="text-sm text-muted mt-1">
            <b className="text-cyan-300">{data.stats.linked.toLocaleString()}</b> gamers brought to Cluster
            {" · "}#{data.rank} of {data.totalServers} servers
            {!publicView && <> · Server ID <code className="text-[11px]">{server.guildId}</code></>}
          </p>
        </div>
        {publicView && server.inviteUrl && (
          <a
            href={server.inviteUrl} target="_blank" rel="noreferrer"
            className="ml-auto ghost-btn pressable rounded-full px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2"
          >
            <Icon name="link" size={15} /> Join server
          </a>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="glass rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`text-xl font-black ${accent ? "text-cyan-300" : ""}`}>{value.toLocaleString()}</div>
    </div>
  );
}
