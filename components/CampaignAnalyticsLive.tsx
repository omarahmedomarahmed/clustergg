"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";

type PlacementRow = { key: string; pageScope: string; impressions: number; clicks: number };
type Analytics = { impressions: number; clicks: number; ctr: number; filled: number; total: number; byPlacement: PlacementRow[] };

// Renders the campaign analytics (stat cards + placement table) and refreshes
// them in place via the admin JSON endpoint — no full-page reload. Placement
// rows still link to a page where the ad shows.
export default function CampaignAnalyticsLive({
  campaignId, initial, pageForPlacement,
}: {
  campaignId: string;
  initial: Analytics;
  pageForPlacement: Record<string, string>;
}) {
  const [data, setData] = useState<Analytics>(initial);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [flash, setFlash] = useState(false);

  const num = (n: number) => n.toLocaleString();

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/campaign-analytics/${campaignId}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData({ impressions: json.impressions, clicks: json.clicks, ctr: json.ctr, filled: json.filled, total: json.total, byPlacement: json.byPlacement ?? [] });
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      }
    } catch { /* keep old data */ }
    setBusy(false);
  }, [campaignId]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [auto, refresh]);

  const pageFor = (key: string) => pageForPlacement[key] ?? "/";

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="chart" size={18} className="text-cyan-300" /> Analytics (30 days)</h2>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-cyan-400" /> Auto (10s)
          </label>
          <button onClick={refresh} disabled={busy} className="ghost-btn pressable rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Icon name="satellite" size={13} className={busy ? "animate-spin" : ""} /> {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 transition ${flash ? "opacity-60" : ""}`}>
        <Stat label="Impressions" value={num(data.impressions)} />
        <Stat label="Clicks" value={num(data.clicks)} />
        <Stat label="CTR" value={`${(data.ctr * 100).toFixed(2)}%`} />
        <Stat label="Placements live" value={`${data.filled}/${data.total}`} />
      </div>
      <div className={`glass overflow-x-auto transition ${flash ? "ring-1 ring-cyan-400/40" : ""}`}>
        <table className="w-full table-cosmic min-w-[560px]">
          <thead><tr><th>Placement</th><th>Page</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead>
          <tbody>
            {data.byPlacement.length === 0 && <tr><td colSpan={5} className="text-sm text-muted p-4">No impressions yet.</td></tr>}
            {data.byPlacement.map((r) => (
              <tr key={r.key} className="hover:bg-white/5">
                <td><Link href={pageFor(r.key)} target="_blank" className="font-semibold text-sm text-cyan-300 hover:underline inline-flex items-center gap-1.5"><Icon name="link" size={12} /> {r.key}</Link></td>
                <td className="text-xs text-muted">{r.pageScope}</td>
                <td className="text-cyan-200 font-bold">{num(r.impressions)}</td>
                <td>{num(r.clicks)}</td>
                <td className="text-xs">{r.impressions ? ((r.clicks / r.impressions) * 100).toFixed(1) : "0.0"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass p-4 text-center">
      <div className="text-2xl font-bold text-cyan-200">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{label}</div>
    </div>
  );
}
