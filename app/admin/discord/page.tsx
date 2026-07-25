import { headers } from "next/headers";
import {
  publicKeyShape, canAct, appId, installUrl, discordConfigured, siteUrl, botApiSecret, CLUSTER_CHANNEL,
} from "@/lib/discord/config";
import { RegisterCommands, GuideTools, JobRunner, Broadcast } from "@/components/DiscordBotPanel";
import { listGuilds } from "@/lib/discord/guilds";
import { JOBS } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Discord bot" };

// Bot status and operations, in a browser. Every step of turning the bot on is
// either a value to copy or a button to press — no terminal anywhere.
export default async function AdminDiscordPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  const liveOrigin = host ? `${proto}://${host}` : siteUrl();

  const key = publicKeyShape();
  const ready = discordConfigured();
  const install = installUrl();

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
      detail: appId()
        ? `Using ${appId()}.`
        : "Neither DISCORD_APP_ID nor DISCORD_CLIENT_ID is set — the bot can't deliver replies.",
    },
    {
      label: "BOT_API_SECRET",
      ok: !!botApiSecret(),
      detail: botApiSecret() ? "Set." : "Not set. Only needed for the API endpoints; the buttons on this page work without it.",
    },
  ];

  const allGood = checks.every((c) => c.ok);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Discord bot</h1>
      <p className="text-muted text-sm mb-8">
        ClusterBot runs inside this app — no separate server. This page is everything you need to
        turn it on and keep it running.
      </p>

      <section className={`glass p-6 mb-6 border ${allGood ? "border-emerald-400/30" : "border-amber-400/30"}`}>
        <h2 className="font-bold mb-4">
          {allGood ? "Configuration looks correct" : "Configuration needs attention"}
        </h2>
        <div className="space-y-3">
          {checks.map((c) => (
            <div key={c.label} className="flex gap-3 items-start">
              <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full grid place-items-center text-xs font-bold ${c.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                {c.ok ? "✓" : "!"}
              </span>
              <div>
                <div className="font-bold text-sm">{c.label}</div>
                <div className="text-xs text-muted">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass p-6 mb-6">
        <h2 className="font-bold mb-1">Paste these into the Discord developer portal</h2>
        <p className="text-xs text-muted mb-4">
          These are built from the domain you are on right now, so they are always correct for this
          deployment. Copy them exactly — <strong>no trailing slash</strong>.
        </p>
        <Field label="General Information → Interactions Endpoint URL" value={`${liveOrigin}/api/discord/interactions`} />
        <Field label="OAuth2 → Redirects (add this one)" value={`${liveOrigin}/api/discord/installed`} />
        <Field label="OAuth2 → Redirects (sign-in, likely already there)" value={`${liveOrigin}/api/auth/discord/callback`} />
        <Field label="Installation → Install Link → Custom URL" value={`${liveOrigin}/api/discord/install`} />
        <p className="text-xs text-muted mt-4">
          Set the Interactions Endpoint URL <strong>last</strong>. Saving it makes Discord send a
          signed test request — if the public key above isn&apos;t green yet, Discord will refuse it.
          You can check what Discord sees at{" "}
          <a href={`${liveOrigin}/api/discord/interactions`} target="_blank" rel="noreferrer" className="text-cyan-300 underline">
            /api/discord/interactions
          </a>.
        </p>
      </section>

      <div className="mb-6">
        <RegisterCommands ready={ready} />
      </div>

      <section className="glass p-6 mb-6">
        <h2 className="font-bold mb-1">Add the bot to a server</h2>
        <p className="text-xs text-muted mb-4">
          This link requests exactly the permissions the bot uses — including <strong>Manage
          Messages</strong>, without which the how-to guides post but silently fail to pin.
        </p>
        {install ? (
          <a href={install} target="_blank" rel="noreferrer" className="grad-btn pressable rounded-full px-6 py-2.5 font-bold inline-block">
            Add ClusterBot to a server
          </a>
        ) : (
          <span className="text-sm text-amber-200">Set the Application ID first.</span>
        )}
        <p className="text-xs text-muted mt-3">
          On authorising, the bot creates <code className="text-cyan-300">#{CLUSTER_CHANNEL}</code>,
          posts and pins a how-to guide for every topic and every quest, and DMs the server owner.
        </p>
      </section>

      <GuideTools ready={ready} />

      <div className="mt-6"><JobRunner jobs={JOBS} /></div>
      <div className="mt-6"><Broadcast ready={ready} /></div>

      <section className="mt-6">
        <h2 className="font-bold mb-3">Servers</h2>
        <ServerTable />
      </section>
    </div>
  );
}

// Every server with the bot, and how close each is to unlocking ad revenue —
// the number a server owner cares about, visible to staff without asking them.
async function ServerTable() {
  const rows = await listGuilds();
  if (!rows.length) {
    return (
      <div className="glass p-6 text-sm text-muted">
        No servers yet. They appear here the moment someone adds the bot.
      </div>
    );
  }
  return (
    <div className="glass overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="text-left">
            <th className="px-4 py-3">Server</th>
            <th className="px-4 py-3">Members</th>
            <th className="px-4 py-3">On Cluster</th>
            <th className="px-4 py-3">Linked a game</th>
            <th className="px-4 py-3">To unlock</th>
            <th className="px-4 py-3">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.guildId} className="border-t border-white/5">
              <td className="px-4 py-3">
                <div className="font-bold">{g.name || g.guildId}</div>
                <div className="text-[11px] text-muted font-mono">{g.guildId}</div>
              </td>
              <td className="px-4 py-3">{g.memberCount.toLocaleString()}</td>
              <td className="px-4 py-3">{g.joined.toLocaleString()}</td>
              <td className="px-4 py-3 font-bold text-cyan-300">{g.linked.toLocaleString()}</td>
              <td className="px-4 py-3">
                {g.unlocked ? <span className="text-emerald-300">—</span> : `${g.remaining.toLocaleString()} more`}
              </td>
              <td className="px-4 py-3">
                {g.unlocked
                  ? <span className="text-emerald-300 font-bold">{g.revenueSharePct}% unlocked</span>
                  : <span className="text-muted">{g.pct}%</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
