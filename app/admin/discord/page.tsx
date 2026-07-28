import Link from "next/link";
import { headers } from "next/headers";
import {
  publicKeyShape, canAct, appId, installUrl, discordConfigured, siteUrl, botApiSecret, CLUSTER_CHANNEL,
} from "@/lib/discord/config";
import { RegisterCommands, GuideTools, JobRunner } from "@/components/DiscordBotPanel";
import { listGuilds } from "@/lib/discord/guilds";
import { countPendingRequests } from "@/lib/challenge-requests";
import { hqStatus } from "@/lib/discord/hq";
import { tierFor } from "@/lib/server-portal";
import { AdminHeader, AdminSection, AdminSettings, EmptyState } from "@/components/AdminPage";
import { JOBS } from "@/lib/jobs";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Servers & bot status" };

// Servers first, setup last.
//
// This page opened with four environment-variable checks and a wall of URLs to
// paste into Discord — which is exactly right on day one and pure noise every
// day after. Once the bot is configured that whole section collapses to a
// single green line, and the page becomes what staff actually come here for:
// every server running the bot, what it's worth, and a way into it.
export default async function AdminDiscordPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  const liveOrigin = host ? `${proto}://${host}` : siteUrl();

  const key = publicKeyShape();
  const ready = discordConfigured();
  const install = installUrl();

  const [guilds, pending, hq] = await Promise.all([listGuilds(), countPendingRequests(), hqStatus()]);

  const checks: { label: string; ok: boolean; detail: string }[] = [
    {
      label: "DISCORD_PUBLIC_KEY",
      ok: key.looksValid,
      detail: !key.present
        ? "Not set on this deployment. Add it in Vercel → Settings → Environment Variables, then redeploy."
        : key.looksValid
          ? "Set and correctly shaped (64 hex characters)."
          : `Set, but it's ${key.length} characters — it must be exactly 64 hex characters. Copy the "Public Key" from the General Information tab (not the Application ID, not the client secret, not the bot token).`,
    },
    {
      label: "DISCORD_BOT_TOKEN",
      ok: canAct(),
      detail: canAct()
        ? "Set — the bot can create channels, post and pin."
        : "Not set. Interactions can still verify, but the bot can't post anything.",
    },
    {
      label: "Application ID",
      ok: !!appId(),
      detail: appId() ? `Using ${appId()}.` : "Neither DISCORD_APP_ID nor DISCORD_CLIENT_ID is set — the bot can't deliver replies.",
    },
    {
      label: "BOT_API_SECRET",
      ok: !!botApiSecret(),
      detail: botApiSecret() ? "Set." : "Not set. Only needed for the API endpoints; the buttons on this page work without it.",
    },
  ];
  const allGood = checks.every((c) => c.ok);

  const reach = guilds.reduce((n, g) => n + g.memberCount, 0);
  const linked = guilds.reduce((n, g) => n + g.linked, 0);
  const unlocked = guilds.filter((g) => g.unlocked).length;

  return (
    <div>
      <AdminHeader
        title="Servers & bot status"
        subtitle="Every Discord community running ClusterBot, what it's worth, and the state of the bot itself."
        stats={[
          { label: "Servers", value: guilds.length, tone: "accent" },
          { label: "Reach", value: reach, tone: "accent" },
          { label: "Linked a game", value: linked },
          { label: "Earning", value: unlocked },
        ]}
        actions={
          <>
            <Link href="/admin/discord/analytics" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">Bot analytics</Link>
            {install && (
              <a href={install} target="_blank" rel="noreferrer" className="grad-btn pressable rounded-full px-5 py-2 text-sm font-bold">
                Add to a server
              </a>
            )}
          </>
        }
      />

      {pending > 0 && (
        <Link
          href="/admin/discord/requests"
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-5 py-4 mb-6 hover:bg-amber-500/15"
        >
          <span className="text-sm">
            <b className="text-amber-200">{pending} challenge request{pending === 1 ? "" : "s"} waiting.</b>{" "}
            A server owner is blocked until we review it.
          </span>
          <Icon name="arrowRight" size={16} className="text-amber-200 shrink-0" />
        </Link>
      )}

      <AdminSection
        title="Servers"
        hint="Sorted by linked members — the number that decides revenue share, and the only one advertisers pay for. Open a server to manage its portal, its challenges and what we send it."
      >
        {guilds.length === 0 ? (
          <EmptyState
            title="No servers yet"
            hint="They appear the moment someone adds the bot. Use the button above to add it to your own first."
          />
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-xs text-muted">
                <tr className="text-left">
                  <th className="px-3 py-2">Server</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2 text-right">Members</th>
                  <th className="px-3 py-2 text-right">On Cluster</th>
                  <th className="px-3 py-2 text-right">Linked</th>
                  <th className="px-3 py-2">Progress</th>
                  <th className="px-3 py-2">Portal</th>
                </tr>
              </thead>
              <tbody>
                {guilds.map((g) => {
                  const { current } = tierFor(g.linked);
                  return (
                    <tr key={g.guildId} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/discord/${g.guildId}`} className="font-bold hover:text-cyan-300">
                          {g.name || g.guildId}
                        </Link>
                        <div className="text-[10px] text-muted font-mono">{g.guildId}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{current.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{g.memberCount.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{g.joined.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-cyan-300">{g.linked.toLocaleString()}</td>
                      <td className="px-3 py-2.5 w-40">
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${g.unlocked ? "bg-emerald-400" : "bg-gradient-to-r from-violet-500 to-cyan-400"}`}
                            style={{ width: `${Math.max(2, g.pct)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted mt-1">
                          {g.unlocked ? "Sponsored challenges live" : `${g.remaining.toLocaleString()} more to unlock`}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/discord/${g.guildId}`} className="text-xs text-cyan-300 hover:underline">
                          Manage →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      <AdminSection title="Operations" hint="The jobs the cron runs, on demand. Vercel's plan allows one daily run, so these are how a job happens now rather than tomorrow.">
        <JobRunner jobs={JOBS} />
        <div className="mt-5"><GuideTools ready={ready} /></div>
      </AdminSection>

      <AdminSettings title="Setup">
        {/* Configured and done: one line, not a wall. Setup instructions that
            never go away train people to scroll past this page. */}
        {allGood ? (
          <details className="glass p-5">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-300 flex items-center gap-2">
              <Icon name="check" size={15} /> The bot is configured. Setup details
            </summary>
            <div className="mt-5 space-y-5">
              <SetupBody liveOrigin={liveOrigin} checks={checks} ready={ready} install={install} />
            </div>
          </details>
        ) : (
          <div className="glass p-6 border border-amber-400/30">
            <h3 className="font-bold mb-1">Configuration needs attention</h3>
            <p className="text-xs text-muted mb-5">
              Until these are green the bot can&apos;t verify Discord&apos;s requests. Nothing else on this page will fill in.
            </p>
            <SetupBody liveOrigin={liveOrigin} checks={checks} ready={ready} install={install} />
          </div>
        )}

        <div className="glass p-5">
          <h3 className="font-bold text-sm mb-1">HQ — our own server</h3>
          <p className="text-xs text-muted mb-3">
            {hq.setupDone
              ? "Built. Reports from every server land there."
              : hq.guildId
                ? "Server id saved, not built yet."
                : "Not set. The bot can build our whole Discord in one pass."}
          </p>
          <Link href="/admin/discord/hq" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">
            {hq.setupDone ? "Open HQ" : "Set up HQ"}
          </Link>
        </div>
      </AdminSettings>
    </div>
  );
}

function SetupBody({ liveOrigin, checks, ready, install }: {
  liveOrigin: string;
  checks: { label: string; ok: boolean; detail: string }[];
  ready: boolean;
  install: string | null;
}) {
  return (
    <>
      <div className="space-y-3">
        {checks.map((c) => (
          <div key={c.label} className="flex gap-3 items-start">
            <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full grid place-items-center text-xs font-bold ${c.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
              <Icon name={c.ok ? "check" : "alert"} size={12} />
            </span>
            <div>
              <div className="font-bold text-sm">{c.label}</div>
              <div className="text-xs text-muted">{c.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h4 className="font-bold text-sm mb-1">Paste these into the Discord developer portal</h4>
        <p className="text-xs text-muted mb-3">
          Built from the domain you are on right now, so they are always correct for this deployment.
          Copy them exactly — <strong>no trailing slash</strong>.
        </p>
        <Field label="General Information → Interactions Endpoint URL" value={`${liveOrigin}/api/discord/interactions`} />
        <Field label="OAuth2 → Redirects (add this one)" value={`${liveOrigin}/api/discord/installed`} />
        <Field label="OAuth2 → Redirects (sign-in, likely already there)" value={`${liveOrigin}/api/auth/discord/callback`} />
        <Field label="Installation → Install Link → Custom URL" value={`${liveOrigin}/api/discord/install`} />
        <p className="text-xs text-muted mt-3">
          Set the Interactions Endpoint URL <strong>last</strong>. Saving it makes Discord send a signed
          test request — if the public key isn&apos;t green yet, Discord refuses it. Check what Discord
          sees at{" "}
          <a href={`${liveOrigin}/api/discord/interactions`} target="_blank" rel="noreferrer" className="text-cyan-300 underline">
            /api/discord/interactions
          </a>.
        </p>
      </div>

      <RegisterCommands ready={ready} />

      <div>
        <h4 className="font-bold text-sm mb-1">Invite link</h4>
        <p className="text-xs text-muted mb-3">
          Requests exactly the permissions the bot uses — including <strong>Manage Messages</strong>,
          without which the guides post but silently fail to pin. On authorising, the bot creates{" "}
          <code className="text-cyan-300">#{CLUSTER_CHANNEL}</code>, posts and pins a how-to guide for
          every topic and every quest, and DMs the owner.
        </p>
        {install
          ? <a href={install} target="_blank" rel="noreferrer" className="ghost-btn pressable rounded-full px-5 py-2 text-sm inline-block">Add ClusterBot to a server</a>
          : <span className="text-sm text-amber-200">Set the Application ID first.</span>}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="font-mono text-sm bg-black/40 border border-white/10 rounded-lg px-3 py-2 break-all select-all">
        {value}
      </div>
    </div>
  );
}
