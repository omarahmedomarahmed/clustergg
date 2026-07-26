import Link from "next/link";
import Icon from "@/components/Icon";
import { requireAdmin } from "@/lib/auth";
import { commandAnalytics, listGuilds } from "@/lib/discord/guilds";
import { BotUsage } from "@/components/DiscordAnalytics";
import { AdminHeader, AdminSection, EmptyState } from "@/components/AdminPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Bot analytics" };

const WINDOWS = [7, 14, 30, 90];

// How the bot itself is doing, separate from how the platform is doing.
//
// These numbers answer operational questions — is a command getting slower, is
// a screen never opened, is one server carrying all the usage — and they were
// buried at the bottom of the setup page where nobody scrolled to them.
//
// Latency leads for a reason: Discord kills an interaction that isn't
// acknowledged within 3 seconds, so a command drifting upward here is an outage
// forming, not a statistic.
export default async function BotAnalyticsPage({ searchParams }: {
  searchParams: Promise<{ days?: string; guild?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 14;
  const guild = sp.guild || "";

  const [all, guilds] = await Promise.all([
    commandAnalytics(guild || null, days),
    listGuilds(),
  ]);

  // Which servers actually use it. A server with the bot installed and no
  // interactions is a churn risk, and it doesn't show up in a total.
  const perGuild = await Promise.all(
    guilds.slice(0, 25).map(async (g) => ({
      guildId: g.guildId,
      name: g.name || g.guildId,
      members: g.memberCount,
      a: await commandAnalytics(g.guildId, days),
    })),
  );
  const ranked = [...perGuild].sort((x, y) => y.a.total - x.a.total);
  const silent = ranked.filter((r) => r.a.total === 0);

  const qs = (over: { days?: number; guild?: string }) => {
    const p = new URLSearchParams();
    p.set("days", String(over.days ?? days));
    const g = over.guild ?? guild;
    if (g) p.set("guild", g);
    return `?${p}`;
  };

  return (
    <div>
      <AdminHeader
        title="Bot analytics"
        subtitle="Every slash command and button press, with the latency behind it. Platform-wide numbers live on product analytics."
        back={{ href: "/admin/discord", label: "Servers & bot status" }}
        stats={[
          { label: "Interactions", value: all.total, tone: "accent" },
          { label: "Gamers using it", value: all.gamers },
          { label: "Avg response", value: `${all.avgMs} ms` },
          { label: "Slowest", value: `${all.slowest} ms`, tone: all.slowest >= 2500 ? "warn" : undefined },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-xs text-muted">Window</span>
        {WINDOWS.map((d) => (
          <Link
            key={d}
            href={qs({ days: d })}
            className={`rounded-full border px-3 py-1 text-xs ${
              d === days ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200 font-semibold" : "border-white/12 text-muted hover:text-ink"
            }`}
          >
            {d}d
          </Link>
        ))}
        {guild && (
          <>
            <span className="text-xs text-muted ml-2">Filtered to</span>
            <Link href={qs({ guild: "" })} className="rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1 text-xs">
              {guilds.find((g) => g.guildId === guild)?.name || guild} <Icon name="x" size={11} className="inline" />
            </Link>
          </>
        )}
      </div>

      <div className="mb-6">
        <BotUsage a={all} days={days} title={guild ? "This server" : "All servers"} />
      </div>

      <AdminSection
        title="By server"
        hint="Who is actually using it. A server with the bot installed and no interactions is a churn risk that never shows up in a total."
      >
        {ranked.length === 0 ? (
          <EmptyState title="No servers yet" hint="They appear the moment someone adds the bot." />
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="text-xs text-muted">
                <tr className="text-left">
                  <th className="px-3 py-2">Server</th>
                  <th className="px-3 py-2 text-right">Members</th>
                  <th className="px-3 py-2 text-right">Interactions</th>
                  <th className="px-3 py-2 text-right">Gamers</th>
                  <th className="px-3 py-2 text-right">Avg ms</th>
                  <th className="px-3 py-2">Top command</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.guildId} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-3 py-2.5">
                      <Link href={qs({ guild: r.guildId })} className="font-semibold hover:text-cyan-300">{r.name}</Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.members.toLocaleString()}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${r.a.total ? "text-cyan-300" : "text-muted"}`}>
                      {r.a.total.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.a.gamers.toLocaleString()}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${r.a.avgMs >= 2500 ? "text-amber-300" : ""}`}>
                      {r.a.total ? r.a.avgMs : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-muted truncate">{r.a.byCommand[0]?.label ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {silent.length > 0 && (
          <p className="text-xs text-amber-200/90 mt-4">
            <b>{silent.length} server{silent.length === 1 ? "" : "s"}</b> installed the bot and used it zero times in {days} days:{" "}
            {silent.slice(0, 6).map((s) => s.name).join(", ")}
            {silent.length > 6 ? ` and ${silent.length - 6} more` : ""}. Worth a re-post of the guides, or a broadcast.
          </p>
        )}
      </AdminSection>
    </div>
  );
}
