"use client";

import { useMemo, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import AdChart, { type DayPoint } from "@/components/AdChart";
import AnimatedNumber from "@/components/AnimatedNumber";
import {
  BRAND_WIDGET_META, defaultBrandCharts, normalizeBrandCharts,
  type BrandChartPrefs, type BrandChartWidget, type BrandWidgetType,
} from "@/lib/brand-charts";
import { portalSaveCharts } from "@/app/actions/brand-portal";
import { adminSaveBrandCharts } from "@/app/actions/admin";

export type ChartData = {
  impressions: number; clicks: number; ctr: number; active: number;
  byDay: DayPoint[];
  byPlacement: { key: string; pageScope: string; impressions: number; clicks: number }[];
};

const PALETTE = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#f87171", "#c084fc"];
const rid = () => "w-" + Math.random().toString(36).slice(2, 9);

// A dashboard builder for the brand portal charts — same feel as the gamer feed
// dashboard builder: a palette of chart types, drag-to-reorder, per-widget width
// (1..4 columns) and config, all saved to brands.chart_prefs. Works in "brand"
// mode (key-gated self-service) or "admin" mode (staff seeding/override).
export default function BrandChartBuilder({
  mode, brandId, keyStr, data, initial,
}: {
  mode: "brand" | "admin";
  brandId: string;
  keyStr?: string;
  data: ChartData;
  initial: unknown;
}) {
  const [widgets, setWidgets] = useState<BrandChartWidget[]>(() => normalizeBrandCharts(initial).widgets);
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = (type: BrandWidgetType) => {
    const meta = BRAND_WIDGET_META.find((m) => m.type === type)!;
    const cfg: Record<string, string> = {};
    if (type === "stat") cfg.metric = "impressions";
    if (type === "placementBars") cfg.metric = "impressions";
    setWidgets((w) => [...w, { id: rid(), type, w: meta.defaultW, config: cfg }]);
  };
  const setW = (id: string, n: number) => setWidgets((w) => w.map((x) => x.id === id ? { ...x, w: n } : x));
  const setCfg = (id: string, patch: Record<string, string>) => setWidgets((w) => w.map((x) => x.id === id ? { ...x, config: { ...x.config, ...patch } } : x));
  const remove = (id: string) => setWidgets((w) => w.filter((x) => x.id !== id));
  const reorder = (from: number, to: number) => setWidgets((w) => { const a = [...w]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; });

  const save = () => start(async () => {
    setMsg(null);
    const json = JSON.stringify({ widgets } satisfies BrandChartPrefs);
    const r = mode === "admin" ? await adminSaveBrandCharts(brandId, json) : await portalSaveCharts(brandId, keyStr ?? "", json);
    setMsg(r && "error" in r && r.error ? r.error : "Saved ✓");
    if (!(r && "error" in r && r.error)) setEditing(false);
  });
  const reset = () => setWidgets(defaultBrandCharts().widgets);

  const colSpan = (n: number) => ["", "sm:col-span-1", "sm:col-span-2", "sm:col-span-3", "sm:col-span-4"][Math.max(1, Math.min(4, n))];

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="chart" size={18} className="text-cyan-300" /> {mode === "admin" ? "Portal charts (admin)" : "Your charts"}</h2>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-cyan-300">{msg}</span>}
          {editing && <button onClick={reset} className="ghost-btn pressable rounded-full px-3 py-1.5 text-xs">Reset</button>}
          {editing && <button onClick={save} disabled={pending} className="glow-btn pressable rounded-full px-4 py-1.5 text-xs font-semibold text-white inline-flex items-center gap-1.5"><Icon name="check" size={13} /> {pending ? "Saving…" : "Save"}</button>}
          <button onClick={() => { setEditing((v) => !v); setMsg(null); }} className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs inline-flex items-center gap-1.5"><Icon name={editing ? "x" : "edit"} size={13} /> {editing ? "Done" : "Customize"}</button>
        </div>
      </div>

      {editing && (
        <div className="glass p-3 mb-3">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Add a chart</div>
          <div className="flex flex-wrap gap-2">
            {BRAND_WIDGET_META.map((m) => (
              <button key={m.type} onClick={() => add(m.type)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-xs font-semibold hover:border-cyan-400/50">
                <Icon name={m.icon} size={13} className="text-cyan-300" /> {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${editing ? "min-h-[120px] rounded-2xl border border-dashed border-white/15 p-3" : ""}`}
      >
        {widgets.length === 0 && <div className="col-span-full text-center text-sm text-muted py-6">No charts yet. {editing ? "Add one above." : "Tap Customize to build your dashboard."}</div>}
        {widgets.map((wg, i) => (
          <div key={wg.id} className={`${colSpan(wg.w)} ${editing ? "cursor-move" : ""}`}
            draggable={editing}
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => { if (editing && drag !== null) e.preventDefault(); }}
            onDrop={(e) => { if (editing && drag !== null && drag !== i) { e.stopPropagation(); reorder(drag, i); setDrag(null); } }}
          >
            <div className="glass p-3.5 h-full relative">
              {editing && (
                <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
                  <div className="flex rounded-lg border border-white/12 overflow-hidden bg-black/40">
                    {[1, 2, 3, 4].map((n) => (
                      <button key={n} onClick={() => setW(wg.id, n)} className={`px-1.5 text-[10px] font-bold ${wg.w === n ? "bg-cyan-500/25 text-cyan-200" : "text-muted hover:text-ink"}`}>{n}</button>
                    ))}
                  </div>
                  <button onClick={() => remove(wg.id)} className="text-rose-300 hover:text-rose-200"><Icon name="x" size={13} /></button>
                </div>
              )}
              <WidgetView widget={wg} data={data} />
              {editing && <WidgetConfig widget={wg} onCfg={(p) => setCfg(wg.id, p)} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WidgetView({ widget, data }: { widget: BrandChartWidget; data: ChartData }) {
  const c = widget.config;
  if (widget.type === "timeseries") return <AdChart data={data.byDay} filename="brand-charts" />;

  if (widget.type === "stat") {
    const metric = c.metric ?? "impressions";
    const map: Record<string, { label: string; value: number; suffix?: string; decimals?: number; color: string }> = {
      impressions: { label: "Impressions (30d)", value: data.impressions, color: "text-cyan-200" },
      clicks: { label: "Clicks (30d)", value: data.clicks, color: "text-violet-200" },
      ctr: { label: "CTR", value: data.ctr * 100, suffix: "%", decimals: 2, color: "text-emerald-200" },
      active: { label: "Live campaigns", value: data.active, color: "text-amber-200" },
    };
    const s = map[metric] ?? map.impressions;
    return (
      <div className="text-center py-2">
        <AnimatedNumber value={s.value} suffix={s.suffix ?? ""} decimals={s.decimals ?? 0} className={`text-3xl font-bold ${s.color}`} />
        <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{s.label}</div>
      </div>
    );
  }

  if (widget.type === "placementBars") {
    const metric = (c.metric === "clicks" ? "clicks" : "impressions") as "impressions" | "clicks";
    const rows = [...data.byPlacement].sort((a, b) => b[metric] - a[metric]).slice(0, 8);
    const max = Math.max(1, ...rows.map((r) => r[metric]));
    return (
      <div>
        <div className="text-xs font-semibold text-muted mb-2">Top placements · {metric}</div>
        {rows.length === 0 && <div className="text-xs text-muted py-3">No impressions yet.</div>}
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={r.key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-[11px] text-muted" title={r.key}>{r.key}</span>
              <span className="flex-1 h-3 rounded-full bg-black/40 overflow-hidden">
                <span className="block h-full rounded-full transition-all" style={{ width: `${(r[metric] / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
              </span>
              <span className="w-12 shrink-0 text-right text-[11px] font-bold text-cyan-100">{r[metric].toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (widget.type === "donut") {
    const rows = [...data.byPlacement].sort((a, b) => b.impressions - a.impressions).slice(0, 6);
    const total = rows.reduce((s, r) => s + r.impressions, 0);
    return <Donut rows={rows} total={total} />;
  }

  // placementTable
  const rows = [...data.byPlacement].sort((a, b) => b.impressions - a.impressions);
  return (
    <div className="overflow-x-auto -mx-1">
      <div className="text-xs font-semibold text-muted mb-2 px-1">Placement breakdown</div>
      <table className="w-full table-cosmic min-w-[420px]">
        <thead><tr><th>Placement</th><th>Page</th><th>Impr.</th><th>Clicks</th><th>CTR</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="text-sm text-muted p-3">No impressions yet.</td></tr>}
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-white/5">
              <td className="font-semibold text-sm">{r.key}</td>
              <td className="text-xs text-muted">{r.pageScope}</td>
              <td className="text-cyan-200 font-bold">{r.impressions.toLocaleString()}</td>
              <td>{r.clicks.toLocaleString()}</td>
              <td className="text-xs">{r.impressions ? ((r.clicks / r.impressions) * 100).toFixed(1) : "0.0"}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Donut({ rows, total }: { rows: { key: string; impressions: number }[]; total: number }) {
  const R = 42, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
        {total > 0 && rows.map((r, i) => {
          const frac = r.impressions / total;
          const dash = `${frac * C} ${C - frac * C}`;
          const off = -acc * C; acc += frac;
          return <circle key={r.key} cx="50" cy="50" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="12" strokeDasharray={dash} strokeDashoffset={off} />;
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-xs font-semibold text-muted mb-1">Impression share</div>
        {rows.length === 0 && <div className="text-xs text-muted">No impressions yet.</div>}
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center gap-2 text-[11px]">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="min-w-0 flex-1 truncate" title={r.key}>{r.key}</span>
            <span className="font-bold text-cyan-100">{total ? Math.round((r.impressions / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetConfig({ widget, onCfg }: { widget: BrandChartWidget; onCfg: (p: Record<string, string>) => void }) {
  const c = widget.config;
  const sel = "mt-3 w-full rounded-lg border border-white/12 bg-black/30 px-2 py-1 text-[11px] outline-none focus:border-cyan-400/50";
  if (widget.type === "stat") return (
    <select value={c.metric ?? "impressions"} onChange={(e) => onCfg({ metric: e.target.value })} className={sel}>
      <option value="impressions">Impressions</option>
      <option value="clicks">Clicks</option>
      <option value="ctr">CTR</option>
      <option value="active">Live campaigns</option>
    </select>
  );
  if (widget.type === "placementBars") return (
    <select value={c.metric ?? "impressions"} onChange={(e) => onCfg({ metric: e.target.value })} className={sel}>
      <option value="impressions">By impressions</option>
      <option value="clicks">By clicks</option>
    </select>
  );
  return null;
}
