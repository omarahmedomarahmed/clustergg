"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import CpIcon from "@/components/CpIcon";
import GameLogo from "@/components/GameLogo";
import { saveFeedPrefs } from "@/app/actions/social";
import LolCard from "@/components/LolCard";
import { useTr } from "@/components/LocaleProvider";

export type DashQuest = { key: string; name: string; color: string; logoUrl: string | null; qp: number; totalCp: number; pct: number; tierName: string };
export type DashLeaderboard = { game: string; metricKey: string; title: string; slug: string | null; logoUrl: string | null; coverUrl: string | null };
export type DashStat = { accountId: string; game: string; logoUrl: string | null; metricKey: string; metricLabel: string; value: number; inGameName: string };
export type DashLolAccount = { accountId: string; tag: string; region: string | null };
export type Widget = { id: string; type: "quest" | "cp" | "stat" | "leaderboard" | "lolaccount"; w: number; config: Record<string, string> };

type Sources = { quests: DashQuest[]; leaderboards: DashLeaderboard[]; stats: DashStat[]; cpTotal: number; cpByQuest: Record<string, number>; lolAccounts: DashLolAccount[] };

const LOL_COLORS = { accent: "#22d3ee", accent2: "#a78bfa", text: "#e8eaf6", muted: "#9aa0c3", panel: "#0b0d26" };

const TYPES: { type: Widget["type"]; label: string; icon: string }[] = [
  { type: "quest", label: "Quest tracker", icon: "trophy" },
  { type: "cp", label: "CP total / quest", icon: "spark" },
  { type: "stat", label: "Game stat", icon: "gamepad" },
  { type: "leaderboard", label: "Leaderboard", icon: "chart" },
  { type: "lolaccount", label: "League account", icon: "gamepad" },
];

const rid = () => Math.random().toString(36).slice(2, 10);

export default function FeedDashboard({ sources, initial }: { sources: Sources; initial: Widget[] }) {
  const tr = useTr();
  const [editing, setEditing] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>(initial);
  const [drag, setDrag] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const defaultConfig = (type: Widget["type"]): Record<string, string> => {
    if (type === "quest") return { questKey: sources.quests[0]?.key ?? "" };
    if (type === "cp") return { scope: "total" };
    if (type === "stat") return sources.stats[0] ? { accountId: sources.stats[0].accountId, metricKey: sources.stats[0].metricKey } : {};
    if (type === "lolaccount") return { accountId: sources.lolAccounts[0]?.accountId ?? "" };
    return sources.leaderboards[0] ? { game: sources.leaderboards[0].game, metricKey: sources.leaderboards[0].metricKey } : {};
  };
  const addWidget = (type: Widget["type"]) => setWidgets((w) => [...w, { id: rid(), type, w: 1, config: defaultConfig(type) }]);
  const update = (id: string, patch: Partial<Widget>) => setWidgets((w) => w.map((x) => x.id === id ? { ...x, ...patch } : x));
  const setCfg = (id: string, patch: Record<string, string>) => setWidgets((w) => w.map((x) => x.id === id ? { ...x, config: { ...x.config, ...patch } } : x));
  const remove = (id: string) => setWidgets((w) => w.filter((x) => x.id !== id));

  const reorder = (from: number, to: number) => setWidgets((w) => { const a = [...w]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; });

  const save = () => start(async () => { await saveFeedPrefs(JSON.stringify({ dashboard: widgets })); setEditing(false); });

  const colSpan = (n: number) => ["", "sm:col-span-1", "sm:col-span-2", "sm:col-span-3", "sm:col-span-4"][Math.max(1, Math.min(4, n))];

  if (widgets.length === 0 && !editing) {
    return (
      <div className="glass p-5 mb-6 flex items-center justify-between gap-3">
        <div className="text-sm text-muted"><b className="text-ink">{tr("Build your dashboard")}</b> — {tr("drop quest trackers, CP history, game stats and leaderboards onto a canvas.")}</div>
        <button onClick={() => setEditing(true)} className="glow-btn pressable rounded-full px-4 py-2 text-xs font-semibold text-white inline-flex items-center gap-1.5 shrink-0"><Icon name="plus" size={13} /> {tr("Build")}</button>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2"><Icon name="grid" size={18} className="text-cyan-300" /> {tr("My dashboard")}</h2>
        <div className="flex gap-2">
          {editing && <button onClick={save} disabled={pending} className="glow-btn pressable rounded-full px-4 py-1.5 text-xs font-semibold text-white inline-flex items-center gap-1.5"><Icon name="check" size={13} /> {pending ? tr("Saving…") : tr("Save")}</button>}
          <button onClick={() => setEditing((v) => !v)} className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs inline-flex items-center gap-1.5"><Icon name={editing ? "x" : "edit"} size={13} /> {editing ? tr("Done") : tr("Customize")}</button>
        </div>
      </div>

      {/* Palette */}
      {editing && (
        <div className="glass p-3 mb-3">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-2">{tr("Drag or tap to add a widget")}</div>
          <div className="flex flex-wrap gap-2">
            {TYPES.filter((t) => t.type !== "lolaccount" || sources.lolAccounts.length > 0).map((t) => (
              <button key={t.type} draggable onDragStart={(e) => e.dataTransfer.setData("wtype", t.type)}
                onClick={() => addWidget(t.type)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-xs font-semibold hover:border-cyan-400/50 cursor-grab active:cursor-grabbing">
                <Icon name={t.icon} size={13} className="text-cyan-300" /> {tr(t.label)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div
        onDragOver={(e) => { if (editing) e.preventDefault(); }}
        onDrop={(e) => { const t = e.dataTransfer.getData("wtype") as Widget["type"]; if (t) addWidget(t); }}
        className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${editing ? "min-h-[120px] rounded-2xl border border-dashed border-white/15 p-3" : ""}`}
      >
        {widgets.map((wg, i) => (
          <div key={wg.id} className={`${colSpan(wg.w)} ${editing ? "cursor-move" : ""}`}
            draggable={editing}
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => { if (editing && drag !== null) e.preventDefault(); }}
            onDrop={(e) => { if (editing && drag !== null && drag !== i) { e.stopPropagation(); reorder(drag, i); setDrag(null); } }}
          >
            <WidgetCard widget={wg} sources={sources} editing={editing} onWidth={(n) => update(wg.id, { w: n })} onCfg={(p) => setCfg(wg.id, p)} onRemove={() => remove(wg.id)} />
          </div>
        ))}
        {editing && widgets.length === 0 && <div className="col-span-full text-center text-sm text-muted py-6">{tr("Drop widgets here.")}</div>}
      </div>
    </div>
  );
}

function WidgetCard({ widget, sources, editing, onWidth, onCfg, onRemove }: {
  widget: Widget; sources: Sources; editing: boolean;
  onWidth: (n: number) => void; onCfg: (p: Record<string, string>) => void; onRemove: () => void;
}) {
  const tr = useTr();
  const c = widget.config;
  const [exp, setExp] = useState(false);

  const { compact, expanded, fullHref } = useMemo(() => {
    if (widget.type === "quest") {
      const q = sources.quests.find((x) => x.key === c.questKey) ?? sources.quests[0];
      if (!q) return { compact: <Empty label={tr("No quests")} />, expanded: null, fullHref: "/quests" };
      return {
        fullHref: `/quests/${q.key}`,
        compact: (
          <>
            <div className="flex items-center gap-2">
              {q.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-7 w-7 object-contain" /> : <Icon name="trophy" size={16} style={{ color: q.color }} />}
              <div className="min-w-0"><div className="text-sm font-bold truncate">{q.name}</div><div className="text-[10px] text-muted">{q.tierName}</div></div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${q.pct}%`, background: q.color }} /></div>
            <div className="mt-1.5 flex items-center gap-1 text-xs font-bold" style={{ color: q.color }}><CpIcon size={12} /> {q.qp.toLocaleString()} CP</div>
          </>
        ),
        expanded: (
          <div className="text-xs text-muted space-y-1">
            <div>Current tier: <b className="text-ink">{q.tierName}</b></div>
            <div className="flex items-center gap-1">Total earned: <CpIcon size={11} /> <b className="text-ink">{q.totalCp.toLocaleString()} CP</b></div>
            <div>Progress to next tier: <b className="text-ink">{q.pct}%</b></div>
          </div>
        ),
      };
    }
    if (widget.type === "cp") {
      const isTotal = (c.scope ?? "total") === "total";
      const val = isTotal ? sources.cpTotal : (sources.cpByQuest[c.scope] ?? 0);
      const q = sources.quests.find((x) => x.key === c.scope);
      return {
        fullHref: "/quests",
        compact: (
          <div className="text-center py-1">
            <div className="flex items-center justify-center gap-2"><CpIcon size={26} /><span className="text-3xl font-bold grad-text">{val.toLocaleString()}</span></div>
            <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{isTotal ? "Total Cluster Points" : `${q?.name ?? "Quest"} CP`}</div>
          </div>
        ),
        expanded: isTotal ? (
          <div className="space-y-1">
            {sources.quests.map((qq) => (
              <div key={qq.key} className="flex items-center justify-between text-xs">
                <span className="truncate" style={{ color: qq.color }}>{qq.name}</span>
                <span className="font-bold inline-flex items-center gap-1"><CpIcon size={10} /> {qq.totalCp.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : <div className="text-xs text-muted">{q?.name ?? "Quest"} lifetime CP.</div>,
      };
    }
    if (widget.type === "stat") {
      const s = sources.stats.find((x) => x.accountId === c.accountId && x.metricKey === c.metricKey) ?? sources.stats[0];
      if (!s) return { compact: <Empty label={tr("No connected stats")} />, expanded: null, fullHref: "/profile" };
      return {
        fullHref: "/profile",
        compact: (
          <div className="flex items-center gap-3">
            <GameLogo logoUrl={s.logoUrl} name={s.game} size={38} rounded="rounded-lg" className="ring-1 ring-white/15" />
            <div className="min-w-0">
              <div className="text-2xl font-bold">{s.value.toLocaleString()}</div>
              <div className="text-[10px] text-muted truncate">{s.metricLabel} · {s.inGameName}</div>
            </div>
          </div>
        ),
        expanded: (
          <div className="text-xs text-muted space-y-1">
            <div>Game: <b className="text-ink">{s.game}</b></div>
            <div>Account: <b className="text-ink">{s.inGameName}</b></div>
            <div>Metric: <b className="text-ink">{s.metricLabel}</b> — {s.value.toLocaleString()}</div>
          </div>
        ),
      };
    }
    if (widget.type === "lolaccount") {
      const la = sources.lolAccounts.find((x) => x.accountId === c.accountId) ?? sources.lolAccounts[0];
      if (!la) return { compact: <Empty label={tr("No League account linked")} />, expanded: null, fullHref: "/profile" };
      const numbers = sources.stats.filter((s) => s.accountId === la.accountId).map((s) => ({ label: s.metricLabel, value: s.value.toLocaleString() }));
      return {
        fullHref: "/profile",
        compact: (
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-9 w-9 rounded-lg bg-[#c89b3c]/20 text-[#c89b3c] font-bold">⚡</span>
            <div className="min-w-0"><div className="text-sm font-bold truncate">{la.tag}</div><div className="text-[10px] text-muted">League of Legends · tap for full snapshot</div></div>
          </div>
        ),
        expanded: <LolCard accountId={la.accountId} colors={LOL_COLORS} statNumbers={numbers} />,
      };
    }
    // leaderboard
    const lb = sources.leaderboards.find((x) => x.game === c.game && x.metricKey === c.metricKey) ?? sources.leaderboards.find((x) => x.game === c.game) ?? sources.leaderboards[0];
    if (!lb) return { compact: <Empty label={tr("No leaderboards")} />, expanded: null, fullHref: "/leaderboards" };
    return {
      fullHref: lb.slug ? `/planets/${lb.slug}?stat=${encodeURIComponent(lb.metricKey)}` : `/leaderboards?game=${encodeURIComponent(lb.game)}`,
      compact: (
        <div className="flex items-center gap-3">
          <GameLogo logoUrl={lb.logoUrl} name={lb.game} size={38} rounded="rounded-lg" className="ring-1 ring-white/15" />
          <div className="min-w-0"><div className="text-sm font-bold truncate">{lb.title}</div><div className="text-[10px] text-muted">Tap to preview</div></div>
        </div>
      ),
      expanded: <LeaderboardLive game={lb.game} metric={lb.metricKey} />,
    };
  }, [widget, sources, c, tr]);

  return (
    <div className="glass p-3.5 h-full relative">
      {editing && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10">
          <div className="flex rounded-lg border border-white/12 overflow-hidden">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} onClick={() => onWidth(n)} className={`px-1.5 text-[10px] font-bold ${widget.w === n ? "bg-cyan-500/25 text-cyan-200" : "text-muted hover:text-ink"}`}>{n}</button>
            ))}
          </div>
          <button onClick={onRemove} className="text-rose-300 hover:text-rose-200"><Icon name="x" size={13} /></button>
        </div>
      )}
      {/* Click expands in place — no navigation */}
      <button type="button" onClick={() => !editing && setExp((v) => !v)} className="block w-full text-left" disabled={editing}>
        {compact}
      </button>
      {exp && !editing && expanded && (
        <div className="mt-3 border-t border-white/10 pt-3">
          {expanded}
          <Link href={fullHref} className="mt-2 inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline"><Icon name="arrowRight" size={11} /> {tr("Open full page")}</Link>
        </div>
      )}
      {editing && <WidgetConfig widget={widget} sources={sources} onCfg={onCfg} />}
    </div>
  );
}

function WidgetConfig({ widget, sources, onCfg }: { widget: Widget; sources: Sources; onCfg: (p: Record<string, string>) => void }) {
  const tr = useTr();
  const c = widget.config;
  const sel = "mt-2 w-full rounded-lg border border-white/12 bg-black/30 px-2 py-1 text-[11px] outline-none focus:border-cyan-400/50";
  if (widget.type === "quest") return (
    <select value={c.questKey ?? ""} onChange={(e) => onCfg({ questKey: e.target.value })} className={sel}>
      {sources.quests.map((q) => <option key={q.key} value={q.key}>{q.name}</option>)}
    </select>
  );
  if (widget.type === "cp") return (
    <select value={c.scope ?? "total"} onChange={(e) => onCfg({ scope: e.target.value })} className={sel}>
      <option value="total">{tr("Total CP")}</option>
      {sources.quests.map((q) => <option key={q.key} value={q.key}>{q.name} {tr("CP")}</option>)}
    </select>
  );
  if (widget.type === "stat") return (
    <select value={`${c.accountId}::${c.metricKey}`} onChange={(e) => { const [accountId, metricKey] = e.target.value.split("::"); onCfg({ accountId, metricKey }); }} className={sel}>
      {sources.stats.map((s) => <option key={`${s.accountId}::${s.metricKey}`} value={`${s.accountId}::${s.metricKey}`}>{s.game} · {s.metricLabel}</option>)}
    </select>
  );
  if (widget.type === "lolaccount") return (
    <select value={c.accountId ?? ""} onChange={(e) => onCfg({ accountId: e.target.value })} className={sel}>
      {sources.lolAccounts.map((l) => <option key={l.accountId} value={l.accountId}>{l.tag}</option>)}
    </select>
  );
  return (
    <select value={`${c.game}::${c.metricKey}`} onChange={(e) => { const [game, metricKey] = e.target.value.split("::"); onCfg({ game, metricKey }); }} className={sel}>
      {sources.leaderboards.map((l) => <option key={`${l.game}::${l.metricKey}`} value={`${l.game}::${l.metricKey}`}>{l.title}</option>)}
    </select>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-xs text-muted py-3 text-center">{label}</div>;
}

type LbEntry = { rank: number; name: string; slug: string; avatarUrl: string | null; inGameName: string; value: number; rankLabel: string | null };
type LbData = { unit: string | null; total: number; entries: LbEntry[]; me: { rank: number; value: number; rankLabel: string | null } | null };

// Live leaderboard inside a dashboard widget: real top entries for the selected
// game + metric, plus the gamer's own standing pinned below.
function LeaderboardLive({ game, metric }: { game: string; metric: string }) {
  const tr = useTr();
  const [data, setData] = useState<LbData | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/leaderboard?game=${encodeURIComponent(game)}&metric=${encodeURIComponent(metric)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { if (d?.entries) setData(d); else setErr(true); } })
      .catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [game, metric]);

  if (err) return <div className="text-xs text-muted py-2">{tr("Couldn't load the leaderboard.")}</div>;
  if (!data) return <div className="text-xs text-muted py-2">{tr("Loading standings…")}</div>;
  const fmt = (v: number, rl: string | null) => rl ?? (v.toLocaleString() + (data.unit ? ` ${data.unit}` : ""));

  return (
    <div className="space-y-1.5">
      {data.entries.length === 0 && <div className="text-xs text-muted">{tr("No ranked players yet.")}</div>}
      {data.entries.map((e) => (
        <Link key={e.slug} href={`/u/${e.slug}`} className="flex items-center gap-2 text-xs hover:text-cyan-300">
          <span className="w-4 text-center font-bold text-muted">{e.rank}</span>
          <GameLogo logoUrl={e.avatarUrl} name={e.name} size={20} rounded="rounded-full" />
          <span className="min-w-0 flex-1 truncate">{e.name}</span>
          <span className="font-bold text-cyan-200 shrink-0">{fmt(e.value, e.rankLabel)}</span>
        </Link>
      ))}
      {data.me && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/[0.08] px-2 py-1.5 text-xs">
          <span className="w-4 text-center font-bold text-cyan-300">{data.me.rank}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{tr("You")}{data.me.rank <= data.total ? ` · ${tr("of")} ${data.total}` : ""}</span>
          <span className="font-bold text-cyan-200 shrink-0">{fmt(data.me.value, data.me.rankLabel)}</span>
        </div>
      )}
    </div>
  );
}
