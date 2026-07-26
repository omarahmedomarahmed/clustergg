import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { METRICS, metricsWithWindow, type MetricDef } from "@/lib/admin-metrics";
import { AdminHeader, AdminSection } from "@/components/AdminPage";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Product analytics" };

const WINDOWS = [7, 14, 30, 90];
const GROUPS: { key: MetricDef["group"]; label: string; blurb: string }[] = [
  { key: "discord", label: "Distribution", blurb: "The bot and the servers running it — how many people we can reach at all." },
  { key: "growth", label: "Growth", blurb: "Gamers, and whether they linked a game. Linking is the conversion that matters." },
  { key: "competition", label: "Competition", blurb: "What they compete in, and what we owe the winners." },
  { key: "revenue", label: "Revenue", blurb: "Brands, creatives and what those creatives did." },
  { key: "content", label: "Content", blurb: "The catalogue underneath everything else." },
];

// Product analytics.
//
// Every number the platform tracks, with its definition next to it, because a
// metric whose definition lives in someone's head is a rumour. Filter by window
// and by area; each metric links to the console where you can act on it and to
// a one-page report you can print or save as PDF.
export default async function ProductAnalyticsPage({ searchParams }: {
  searchParams: Promise<{ days?: string; group?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const group = GROUPS.some((g) => g.key === sp.group) ? sp.group : "";

  const { total, window } = await metricsWithWindow(days);
  const shown = GROUPS.filter((g) => !group || g.key === group);

  const qs = (over: { days?: number; group?: string }) => {
    const p = new URLSearchParams();
    p.set("days", String(over.days ?? days));
    const g = over.group ?? group;
    if (g) p.set("group", g);
    return `?${p}`;
  };

  return (
    <div>
      <AdminHeader
        title="Product analytics"
        subtitle="Every metric we track, what each one actually counts, and where to act on it."
        back={{ href: "/admin", label: "Command centre" }}
        stats={[
          { label: "Reach", value: total.guildMembers, tone: "accent" },
          { label: "Gamers", value: total.users },
          { label: "Linked accounts", value: total.linkedAccounts, tone: "accent" },
          { label: `Bot interactions · ${days}d`, value: window.botCommands },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2 mb-7">
        <span className="text-xs text-muted">Window</span>
        {WINDOWS.map((d) => (
          <Link key={d} href={qs({ days: d })} className={chip(d === days)}>{d}d</Link>
        ))}
        <span className="text-xs text-muted ml-3">Area</span>
        <Link href={qs({ group: "" })} className={chip(!group)}>All</Link>
        {GROUPS.map((g) => (
          <Link key={g.key} href={qs({ group: g.key })} className={chip(group === g.key)}>{g.label}</Link>
        ))}
      </div>

      {/* Windowed metrics are the ones where "in the last N days" is meaningful.
          A stock count — how many games exist — has no window, and pretending
          otherwise would be a made-up number. */}
      <AdminSection
        title={`Activity in the last ${days} days`}
        hint="Only event-shaped metrics have a window. Everything else is a running total and is shown as such below."
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Windowed label="Bot interactions" value={window.botCommands} total={total.botCommands} days={days} />
          <Windowed label="Ad impressions" value={window.adImpressions} total={total.adImpressions} days={days} />
          <Windowed label="Ad clicks" value={window.adClicks} total={total.adClicks} days={days} />
          <Windowed label="Posts" value={window.posts} total={total.posts} days={days} />
        </div>
      </AdminSection>

      {shown.map((g) => {
        const rows = METRICS.filter((m) => m.group === g.key);
        if (!rows.length) return null;
        return (
          <AdminSection key={g.key} title={g.label} hint={g.blurb}>
            <div className="grid sm:grid-cols-2 gap-3">
              {rows.map((m) => (
                <div key={m.key} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-sm">{m.label}</span>
                    <span className="text-xl font-black tabular-nums text-cyan-300">{total[m.key].toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted leading-snug mt-1.5">{m.definition}</p>
                  <div className="flex flex-wrap gap-3 mt-3 text-xs">
                    {m.href && (
                      <Link href={m.href} className="text-cyan-300 hover:underline inline-flex items-center gap-1">
                        Open console <Icon name="arrowRight" size={11} />
                      </Link>
                    )}
                    <Link href={`/admin/analytics/${m.key}?days=${days}`} className="text-muted hover:text-ink inline-flex items-center gap-1">
                      <Icon name="copy" size={11} /> One-page report
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </AdminSection>
        );
      })}
    </div>
  );
}

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs transition ${
    on ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200 font-semibold" : "border-white/12 text-muted hover:text-ink"
  }`;

function Windowed({ label, value, total, days }: { label: string; value: number; total: number; days: number }) {
  // Share of all time that happened inside the window — the cheapest honest
  // read on whether something is accelerating.
  const share = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-2xl font-black">{value.toLocaleString()}</div>
      <div className="text-[11px] uppercase tracking-widest text-muted mt-1">{label}</div>
      <div className="text-[10px] text-muted/80 mt-1">
        {total.toLocaleString()} all time · {share}% of it in the last {days}d
      </div>
    </div>
  );
}
