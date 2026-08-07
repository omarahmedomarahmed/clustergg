import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerBySlugOrId, portalData, serverBoard, serverCommandFeed, TIERS } from "@/lib/server-portal";
import { hasPortalSession } from "@/lib/portal-auth";
import { challengesForGuild } from "@/lib/challenges";
import { listRequests, requestableGames } from "@/lib/challenge-requests";
import { readThread, unreadCount, markThreadRead } from "@/lib/threads";
import { getProfile, PROFILE_FIELDS, REGIONS, VIBES } from "@/lib/discord/community";
import ServerProfileForm from "@/components/ServerProfileForm";
import { canAct } from "@/lib/discord/config";
import ServerMessages from "@/components/ServerMessages";
import ServerChallengeRequest from "@/components/ServerChallengeRequest";
import Tabs from "@/components/Tabs";
import Icon from "@/components/Icon";
import PortalKeyHandoff from "@/components/PortalKeyHandoff";
import { ServerBoard, TierLadder, TierBadge, FunnelPanel, ChallengeRow, CommandFeed, EarningsPanel, EarningGuide } from "@/components/ServerPortal";
import PayoutSetup from "@/components/PayoutSetup";
import { listPayouts, payoutTotals, getPayoutAccount, METHOD_OPTIONS } from "@/lib/payouts";
import { payer } from "@/lib/payments";
import { vendorBy } from "@/lib/payments/vendors";

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
  searchParams: Promise<{ key?: string; unlock?: string; left?: string; mins?: string }>;
}) {
  const { slug } = await params;
  const { key = "", unlock = "", left = "", mins = "" } = await searchParams;

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
  if (key) return <PortalKeyHandoff kind="server" slug={server.slug ?? server.guildId} portalKey={key} deep="" />;
  const unlocked = await hasPortalSession("server", server.guildId);

  const data = await portalData(server);
  if (!data) notFound();

  const base = `/servers/${server.slug ?? server.guildId}`;

  if (!unlocked) return <PublicView server={server} data={data} base={base} unlock={unlock} left={left} mins={mins} />;

  const [challenges, requests, board, feed, thread, unreadFromUs, games, community, payouts, payoutSums, account, pay] = await Promise.all([
    challengesForGuild(server.guildId),
    listRequests({ guildId: server.guildId }),
    serverBoard(),
    serverCommandFeed(server.guildId),
    readThread("server", server.guildId),
    // Counted BEFORE marking read, so a reply that arrived since their last
    // visit still announces itself on the tab they're about to open.
    unreadCount("server", server.guildId, "portal"),
    requestableGames(),
    getProfile(server.guildId),
    listPayouts({ guildId: server.guildId, limit: 24 }),
    payoutTotals(server.guildId),
    getPayoutAccount("server", server.guildId),
    payer("payout"),
  ]);
  // B35: both counts and the rule, on the owner's own screen. A rule an owner
  // cannot read is a rule they will assume is arbitrary — and the moment to
  // learn that half your members do not count toward a tier is long before the
  // payout that does not arrive.
  const { linkedCountsFor, QUALIFY_RULE, payoutHoldFor } = await import("@/lib/abuse");
  const { getDb } = await import("@/lib/db");
  const abuseDb = await getDb();
  const [counts, hold] = await Promise.all([
    linkedCountsFor(abuseDb, server.guildId),
    payoutHoldFor(abuseDb, server.guildId),
  ]);
  const payVendor = vendorBy(pay.adapter.key);

  // Opening the dashboard IS reading the thread — an unread badge that survives
  // the owner looking straight at the messages is a badge nobody trusts again.
  await markThreadRead("server", server.guildId, "portal");

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="min-h-screen">
      <PortalHeader server={server} data={data} />

      <div className="mx-auto max-w-6xl px-4 pb-20">
        {/* The gate, stated BEFORE they reach the threshold (B47).
            An owner who finds out at 500 linked members that they are earning
            nothing was misled the whole way up, so this sits above the tabs on
            every visit until the profile is finished. */}
        {!community.complete && (
          <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-500/5 p-5" data-shot="profile-incomplete">
            <div className="flex flex-wrap items-center gap-3">
              <Icon name="alert" size={18} className="text-amber-300 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-amber-100">Your server profile is incomplete</div>
                <div className="text-sm text-muted mt-0.5">
                  {community.missing.length} field{community.missing.length === 1 ? "" : "s"} left —{" "}
                  {PROFILE_FIELDS.filter((f) => community.missing.includes(f.key)).map((f) => f.label).join(", ")}.
                  {" "}Until it is finished the weekly server pool <b className="text-ink">cannot pay you</b>,
                  whatever your tier says — a server we cannot describe is one we cannot sell.
                </div>
              </div>
              <a href="#server-profile" className="glow-btn pressable rounded-full px-4 py-2 text-sm font-semibold text-white shrink-0">
                Finish it
              </a>
            </div>
          </div>
        )}

        <Tabs tabs={[
          {
            key: "overview", label: "Overview", icon: "chart",
            node: (
              <div className="space-y-6">
                <TierLadder tiers={TIERS} linked={data.stats.linked} current={data.tier.current.key} />
                {/* The profile lives on Overview rather than behind a settings
                    tab, because it is not settings — it is the switch that turns
                    the revenue share on, and it belongs beside the ladder that
                    promises the share. */}
                <ServerProfileForm
                  guildId={server.guildId}
                  portalKey=""
                  games={games.map((g) => ({ value: g.name, label: g.name }))}
                  regions={REGIONS}
                  vibes={VIBES}
                  fields={PROFILE_FIELDS}
                  profile={community.profile}
                  contactEmail={community.contactEmail}
                  missing={community.missing}
                />
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
            // Second tab, not last: an owner opens this portal to find out what
            // their community is worth, and the answer should not be three
            // clicks in.
            key: "earnings",
            label: payoutSums.open > 0 ? `Earnings ($${Math.round(payoutSums.open).toLocaleString()} in flight)` : "Earnings",
            icon: "diamond",
            node: (
              <div className="space-y-6">
              <EarningGuide
                tiers={TIERS}
                linked={data.stats.linked}
                currentKey={data.tier.current.key}
                inviteUrl={server.inviteUrl}
                slug={server.slug ?? server.guildId}
              />
              <EarningsPanel
                tier={data.tier.current}
                nextAt={data.earnings.nextAt}
                linked={data.stats.linked}
                earned={data.earnings.earned}
                pending={data.earnings.pending}
                membersWon={data.earnings.membersWon}
                winners={data.earnings.winners}
                memberWins={data.earnings.memberWins.map((w) => ({
                  userId: w.userId, name: w.name, slug: w.slug, avatarUrl: w.avatarUrl,
                  challengeId: w.challengeId, challengeTitle: w.challengeTitle, game: w.game,
                  brandName: w.brandName, place: w.place, amount: w.amount, at: w.at.toISOString(),
                }))}
                paidOut={payoutSums.paid}
                inFlight={payoutSums.open}
                payoutMethod={METHOD_OPTIONS.find((m) => m.key === account?.methodPreference)?.label.toLowerCase() ?? null}
                payoutStatus={account?.status ?? "none"}
                payouts={payouts.map((p) => ({
                  id: p.id, status: p.status, total: p.total, currency: p.currency,
                  createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null,
                  note: p.note,
                  lines: p.lines.map((l) => ({ id: l.id, label: l.label, amount: l.amount })),
                }))}
                rows={data.earnings.rows.map((r) => ({
                  challengeId: r.challengeId, title: r.title, game: r.game,
                  brandName: r.brandName, endsAt: r.endsAt.toISOString(), ended: r.ended,
                  entrants: r.entrants, totalEntrants: r.totalEntrants,
                  price: r.price, serverShare: r.serverShare, membersWon: r.membersWon,
                }))}
              />
              <PayoutSetup
                guildId={server.guildId}
                method={account?.methodPreference ?? null}
                country={account?.country ?? null}
                currency={account?.currency ?? "USD"}
                status={account?.status ?? "none"}
                providerName={payVendor?.name ?? "our payout partner"}
                providerConnected={!pay.reason}
              />
              </div>
            ),
          },
          {
            key: "challenges", label: `Challenges (${challenges.length})`, icon: "trophy",
            node: (
              <div className="space-y-4">
                <ServerChallengeRequest
                  guildId={server.guildId} keyStr=""
                  games={games.map((g) => ({ name: g.name, logoUrl: g.logoUrl }))}
                  pending={pending.length}
                />
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
                    No requests yet. Start one on the Challenges tab, or in Discord with{" "}
                    <code className="text-cyan-300">/cluster show:admin</code> — either way it lands in the same queue.
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
            key: "messages",
            label: unreadFromUs ? `Messages (${unreadFromUs})` : "Messages",
            icon: "messages",
            dot: unreadFromUs > 0,
            node: (
              <ServerMessages
                guildId={server.guildId} keyStr=""
                botLive={canAct()}
                messages={thread}
              />
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

                {/* Both numbers, and why they differ. */}
                <div className="rounded-2xl border border-white/10 p-4">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="text-sm font-semibold">
                      <b className={counts.qualified < counts.raw ? "text-amber-300" : "text-emerald-300"}>
                        {counts.qualified.toLocaleString()}
                      </b>
                      <span className="text-muted"> of {counts.raw.toLocaleString()} linked members count toward your tier</span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{QUALIFY_RULE}</p>
                  {hold.held && (
                    <p className="mt-2 rounded-xl border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                      {hold.reason}
                    </p>
                  )}
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

async function PublicView({ server, data, base, unlock, left = "", mins = "" }: {
  server: Awaited<ReturnType<typeof getServerBySlugOrId>> & object;
  data: NonNullable<Awaited<ReturnType<typeof portalData>>>;
  base: string;
  unlock?: string;
  /** Tries remaining, and minutes until a lock lifts — both from the unlock handler. */
  left?: string;
  mins?: string;
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
                className="glow-btn pressable rounded-full px-6 py-2.5 font-bold inline-block mt-4"
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
            <button className="glow-btn pressable rounded-full px-6 py-2.5 font-bold">Unlock</button>
          </form>
          {unlock === "bad" && (
            <p className="text-xs text-rose-300 mt-2">
              That key didn&apos;t match. Check for a missing dash, or run <code className="text-cyan-300">/cluster show:admin</code> in
              your server and the bot will DM it again.
              {/* Says how many tries remain, because a lockout that arrives
                  without warning reads as the product being broken. */}
              {left !== "" && (
                <> {Number(left) > 0
                  ? `${left} ${Number(left) === 1 ? "try" : "tries"} left before this portal locks.`
                  : "That was the last try — this portal is now locked."}</>
              )}
            </p>
          )}
          {unlock === "throttled" && (
            <p className="text-xs text-amber-300 mt-2">
              Locked after too many wrong keys{mins ? ` — try again in about ${mins} minute${mins === "1" ? "" : "s"}` : ""}.
              The attempt has been reported to our team; if it was you, email us and we&apos;ll lift it.
            </p>
          )}
          {alreadyIn && <p className="text-xs text-emerald-300 mt-2">You&apos;re signed in to this portal.</p>}
          <p className="text-[11px] text-muted mt-3">
            Lost it? Run <code className="text-cyan-300">/cluster show:server</code> in your Discord server and the bot will DM it again.
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
            <TierBadge tier={data.tier.current} />
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
