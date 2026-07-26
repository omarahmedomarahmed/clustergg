import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getContent } from "@/lib/cms";
import Icon from "@/components/Icon";
import { EntryAdmin, WeekBroadcast, WeekSettings, WeekStream } from "@/components/WeekAdmin";
import { announcingGuilds } from "@/lib/discord/guilds";
import {
  FREEZE_KEY, PODIUM_TROPHY_KEY, closedWeeks, weekActions, weekBoard, weekTimezone,
} from "@/lib/profile-week";
import { weekAt, weekFromKey, previousWeek, untilLabel } from "@/lib/week";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Profile of the Week" };

// Mission control for the competition that runs on every page.
//
// One screen, because the job is one job: look at the standings, fix what's
// wrong with them, and on Sunday put the stream up and call the winners. The
// week picker means last week is editable too — results get contested after the
// fact, and "we can't change it now" is not an answer when somebody cheated.

const ACTION_STYLE: Record<string, { color: string; icon: string }> = {
  adjust: { color: "#22d3ee", icon: "edit" },
  disqualify: { color: "#fb7185", icon: "shield" },
  reinstate: { color: "#34d399", icon: "check" },
};

const stamp = (d: Date, tz: string) =>
  d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });

export default async function AdminProfileWeekPage({ searchParams }: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: wanted } = await searchParams;
  const tz = await weekTimezone();
  const now = weekAt(new Date(), tz);
  const week = (wanted && weekFromKey(wanted, tz)) || now;
  const isCurrent = week.key === now.key;

  const db = await getDb();
  const [board, log, archive, settings, trophies, guilds] = await Promise.all([
    weekBoard({ weekKey: week.key, limit: 100 }),
    weekActions(week.key),
    closedWeeks(12),
    getContent([FREEZE_KEY, PODIUM_TROPHY_KEY]).catch(() => ({} as Record<string, string>)),
    db.select({ id: schema.trophies.id, name: schema.trophies.name, tier: schema.trophies.tier, value: schema.trophies.value })
      .from(schema.trophies).orderBy(desc(schema.trophies.value)).limit(200),
    announcingGuilds().catch(() => []),
  ]);

  const prev = previousWeek(week);
  const next = weekAt(new Date(week.endsAt.getTime() + 36e5), tz);
  const inRunning = board.entries.filter((e) => !e.disqualified && e.weekVotes > 0);
  const totalVotes = inRunning.reduce((n, e) => n + e.weekVotes, 0);
  const dqCount = board.entries.filter((e) => e.disqualified).length;

  const stat = (label: string, value: string, tone?: string) => (
    <div className="glass px-4 py-3">
      <div className="text-lg font-black" style={tone ? { color: tone } : undefined}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Icon name="crown" size={20} /> Profile of the Week
          </h1>
          <p className="mt-1 text-sm text-muted">
            Week of {week.key} · {stamp(week.startsAt, tz)} → {stamp(week.endsAt, tz)} ({tz})
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <a href={`/admin/profile-week?week=${prev.key}`}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/5">
            <Icon name="arrowLeft" size={13} /> {prev.key}
          </a>
          {!isCurrent && (
            <a href="/admin/profile-week" className="rounded-full border border-cyan-400/40 px-3 py-1.5 text-cyan-200 hover:bg-cyan-500/10">
              This week
            </a>
          )}
          {next.startsAt.getTime() <= Date.now() && (
            <a href={`/admin/profile-week?week=${next.key}`}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/5">
              {next.key} <Icon name="arrowRight" size={13} />
            </a>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stat("Phase", week.phase === "voting" ? "Voting" : "Announcement", week.phase === "voting" ? "#34d399" : "#fbbf24")}
        {stat(
          isCurrent ? (week.phase === "voting" ? "Voting ends in" : "Week ends in") : "Status",
          isCurrent ? untilLabel(week.phase === "voting" ? week.votingEndsAt : week.endsAt) : (board.result ? "Called" : "Finished"),
        )}
        {stat("Votes banked", totalVotes.toLocaleString())}
        {stat("In the running", inRunning.length.toLocaleString())}
        {stat("Disqualified", String(dqCount), dqCount ? "#fb7185" : undefined)}
      </div>

      {isCurrent && !board.votingOpen && (
        <div className="glass mb-6 flex items-center gap-2 border-amber-400/40 p-4 text-sm">
          <Icon name="lock" size={14} />
          <span>
            Voting is closed right now
            {board.closedReason === "frozen"
              ? " — announcement day, and the freeze is on. Turn it off below if you want Sunday votes to keep counting toward lifetime totals."
              : " — announcement day. Sunday votes count toward lifetime totals only."}
          </span>
        </div>
      )}

      <div className="mb-6 grid gap-5 xl:grid-cols-2">
        <WeekStream
          weekKey={week.key}
          url={board.stream.url ?? ""}
          live={board.stream.live}
          closed={!!board.result}
          podium={board.result?.podium ?? []}
          announcedAt={board.result?.announcedAt ? stamp(board.result.announcedAt, tz) : null}
        />
        <WeekSettings
          timezone={tz}
          frozen={settings[FREEZE_KEY] !== "0"}
          trophyId={settings[PODIUM_TROPHY_KEY] ?? ""}
          trophies={trophies.map((t) => ({ ...t, value: Number(t.value) }))}
        />
      </div>

      <div className="mb-6">
        <WeekBroadcast guilds={guilds.length} />
      </div>

      <h2 className="mb-3 flex items-center gap-2 font-bold">
        <Icon name="chart" size={15} /> Standings
        <span className="text-xs font-normal text-muted">
          — the top three are the podium. Adjustments and disqualifications apply to this week only.
        </span>
      </h2>
      <div className="mb-8 space-y-2">
        {board.entries.length === 0 && (
          <div className="glass p-6 text-center text-sm text-muted">No profiles yet this week.</div>
        )}
        {board.entries.map((e) => (
          <EntryAdmin key={e.userId} weekKey={week.key} entry={e} />
        ))}
      </div>

      <h2 className="mb-3 flex items-center gap-2 font-bold">
        <Icon name="clock" size={15} /> Audit trail
        <span className="text-xs font-normal text-muted">— every staff action on this week, newest first.</span>
      </h2>
      <div className="glass mb-8 overflow-x-auto">
        {log.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">Nothing has been changed by staff this week.</div>
        ) : (
          <table className="table-cosmic w-full min-w-[640px]">
            <thead><tr><th>When</th><th>Gamer</th><th>Action</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              {log.map((a) => {
                const s = ACTION_STYLE[a.action] ?? { color: "#94a3b8", icon: "circle" };
                return (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-xs text-muted">{stamp(a.at, tz)}</td>
                    <td className="text-sm"><a href={`/u/${a.slug}`} className="hover:text-cyan-300">{a.displayName}</a></td>
                    <td className="text-xs font-bold" style={{ color: s.color }}>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name={s.icon} size={12} />
                        {a.action}{a.action === "adjust" && a.delta !== 0 ? ` ${a.delta > 0 ? "+" : ""}${a.delta}` : ""}
                      </span>
                    </td>
                    <td className="text-xs text-muted">{a.reason || "—"}</td>
                    <td className="text-xs text-muted">{a.actor ?? "system"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mb-3 flex items-center gap-2 font-bold">
        <Icon name="trophy" size={15} /> Past winners
      </h2>
      <div className="glass overflow-x-auto">
        {archive.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">No week has been called yet.</div>
        ) : (
          <table className="table-cosmic w-full min-w-[560px]">
            <thead><tr><th>Week</th><th>Winner</th><th>Second</th><th>Third</th><th>Announced</th></tr></thead>
            <tbody>
              {archive.map((w) => (
                <tr key={w.weekKey}>
                  <td><a href={`/admin/profile-week?week=${w.weekKey}`} className="text-sm text-cyan-300 hover:underline">{w.weekKey}</a></td>
                  {[0, 1, 2].map((i) => (
                    <td key={i} className="text-sm">
                      {w.podium[i]
                        ? <a href={`/u/${w.podium[i].slug}`} className="hover:text-cyan-300">
                            {w.podium[i].displayName} <span className="text-muted">{w.podium[i].votes.toLocaleString()}</span>
                          </a>
                        : <span className="text-muted">—</span>}
                    </td>
                  ))}
                  <td className="whitespace-nowrap text-xs text-muted">{w.announcedAt ? stamp(w.announcedAt, tz) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
