"use client";

import { useCallback, useState } from "react";
import AdChart, { type DayPoint } from "@/components/AdChart";
import Icon from "@/components/Icon";

type Placement = { key: string; pageScope: string; impressions: number; clicks: number };
type Data = { impressions: number; clicks: number; ctr: number; byDay: DayPoint[]; byPlacement: Placement[] };

// Brand-portal analytics: interactive chart on top, placement table below, both
// refreshing IN PLACE via the key-gated endpoint (no page reload).
export default function BrandAnalyticsPanel({
  brandId, keyStr, campaignId, initial, title = "Impressions & clicks", filename = "brand-analytics",
}: {
  brandId: string;
  keyStr: string;
  campaignId?: string;
  initial: Data;
  title?: string;
  filename?: string;
}) {
  const [data, setData] = useState<Data>(initial);
  const [busy, setBusy] = useState(false);
  const num = (n: number) => n.toLocaleString();

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ brand: brandId, key: keyStr, days: "90" });
      if (campaignId) qs.set("campaign", campaignId);
      const res = await fetch(`/api/brands/analytics?${qs.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setData({ impressions: j.impressions, clicks: j.clicks, ctr: j.ctr, byDay: j.byDay ?? [], byPlacement: j.byPlacement ?? [] });
      }
    } catch { /* keep old */ }
    setBusy(false);
  }, [brandId, keyStr, campaignId]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="chart" size={18} className="text-cyan-300" /> {title}</h2>
        <button onClick={refresh} disabled={busy} className="ghost-btn pressable rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
          <Icon name="satellite" size={13} className={busy ? "animate-spin" : ""} /> {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <AdChart data={data.byDay} filename={filename} />

      {/* Placement table BELOW the chart, refreshed in place with it */}
      <div className="glass overflow-x-auto mt-3">
        <table className="w-full table-cosmic min-w-[520px]">
          <thead><tr><th>Placement</th><th>Page</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead>
          <tbody>
            {data.byPlacement.length === 0 && <tr><td colSpan={5} className="text-sm text-muted p-4">No impressions yet.</td></tr>}
            {data.byPlacement.map((r) => (
              <tr key={r.key} className="hover:bg-white/5">
                <td className="font-semibold text-sm">{r.key}</td>
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
