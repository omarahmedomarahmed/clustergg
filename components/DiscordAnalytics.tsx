import type { CommandAnalytics, UsageRow } from "@/lib/discord/guilds";

// Command analytics, read-only. `discord_command_logs` has been written since
// the bot went live; this is what finally reads it.
//
// Latency is shown next to every command on purpose: Discord kills an
// interaction that isn't acknowledged in 3 seconds, so a command drifting
// upward here is an outage forming, not a statistic.

export function BotUsage({ a, days, title }: { a: CommandAnalytics; days: number; title?: string }) {
  if (!a.total) {
    return (
      <section className="glass p-6">
        <h2 className="font-bold mb-1">{title ?? "Bot usage"}</h2>
        <p className="text-sm text-muted">
          Nothing in the last {days} days. Every slash command and button press lands here.
        </p>
      </section>
    );
  }

  const slow = a.slowest >= 2500;

  return (
    <section className="glass p-6">
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-bold">{title ?? "Bot usage"}</h2>
        <span className="text-xs text-muted">last {days} days</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Interactions" value={a.total.toLocaleString()} />
        <Stat label="Gamers" value={a.gamers.toLocaleString()} />
        <Stat label="Avg response" value={`${a.avgMs} ms`} />
        <Stat
          label="Slowest"
          value={`${a.slowest} ms`}
          tone={slow ? "warn" : undefined}
          note={slow ? "Discord cuts off at 3000 ms" : undefined}
        />
      </div>

      <Sparkline days={a.byDay} />

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <UsageTable heading="By command" rows={a.byCommand} />
        <UsageTable heading="By screen" rows={a.byScreen} empty="Buttons record the screen they opened." />
      </div>
    </section>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${tone === "warn" ? "border-amber-400/40 bg-amber-500/5" : "border-white/10 bg-black/30"}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`text-lg font-black ${tone === "warn" ? "text-amber-200" : ""}`}>{value}</div>
      {note && <div className="text-[10px] text-amber-200/80 mt-0.5">{note}</div>}
    </div>
  );
}

// A bar per day. Deliberately CSS-only — this page is staff-facing and adding a
// chart library to it would be the heaviest thing on the route.
function Sparkline({ days }: { days: { day: string; uses: number }[] }) {
  if (days.length < 2) return null;
  const peak = Math.max(...days.map((d) => d.uses), 1);
  return (
    <div>
      <div className="flex items-end gap-1 h-24">
        {days.map((d) => (
          <div key={d.day} className="flex-1 min-w-[4px] group relative">
            <div
              className="w-full rounded-t bg-gradient-to-t from-violet-500/40 to-cyan-400/80"
              style={{ height: `${Math.max(3, (d.uses / peak) * 96)}px` }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded bg-black/90 px-2 py-1 text-[10px] border border-white/10">
              {d.day} · {d.uses.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted mt-1">
        <span>{days[0]?.day}</span>
        <span>{days[days.length - 1]?.day}</span>
      </div>
    </div>
  );
}

function UsageTable({ heading, rows, empty }: { heading: string; rows: UsageRow[]; empty?: string }) {
  const peak = Math.max(...rows.map((r) => r.uses), 1);
  return (
    <div>
      <h3 className="text-xs uppercase tracking-widest text-muted mb-2">{heading}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty ?? "Nothing yet."}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="relative rounded-lg border border-white/5 px-3 py-2 overflow-hidden">
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 bg-violet-500/15"
                style={{ width: `${(r.uses / peak) * 100}%` }}
              />
              <div className="relative flex items-center justify-between gap-3 text-sm">
                <span className="font-mono text-xs truncate">{r.label}</span>
                <span className="shrink-0 text-xs">
                  <b>{r.uses.toLocaleString()}</b>
                  <span className={`ml-2 ${r.avgMs >= 2500 ? "text-amber-300" : "text-muted"}`}>{r.avgMs} ms</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
