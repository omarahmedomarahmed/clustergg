"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

export type CustomMetric = { key: string; label: string; unit?: string; higherIsBetter?: boolean };

// Lets admin define trackable metrics for a game (so a brand-new game can be
// integrated from the UI — these flow into leaderboards). Serializes to a
// hidden JSON field the saveGame action reads.
export default function GameMetricsEditor({ name = "customMetrics", initial = [] }: { name?: string; initial?: CustomMetric[] }) {
  const [metrics, setMetrics] = useState<CustomMetric[]>(initial);
  const add = () => setMetrics((m) => [...m, { label: "", key: "", unit: "", higherIsBetter: true }]);
  const upd = (i: number, patch: Partial<CustomMetric>) => setMetrics((m) => m.map((x, j) => j === i ? { ...x, ...patch } : x));
  const del = (i: number) => setMetrics((m) => m.filter((_, j) => j !== i));

  return (
    <div className="sm:col-span-2">
      <input type="hidden" name={name} value={JSON.stringify(metrics.filter((m) => m.label.trim()))} />
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted">Trackable metrics (for leaderboards on this game)</span>
        <button type="button" onClick={add} className="text-xs text-cyan-300 hover:underline inline-flex items-center gap-1"><Icon name="plus" size={11} /> Add metric</button>
      </div>
      {metrics.length === 0 ? (
        <p className="text-[11px] text-muted">No custom metrics. Registry-integrated games already expose their own; add metrics here to structure a brand-new game.</p>
      ) : (
        <div className="space-y-2">
          {metrics.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input value={m.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="Metric name (e.g. Kills)" className="input-cosmic !py-1 text-sm flex-1 min-w-[140px]" />
              <input value={m.unit ?? ""} onChange={(e) => upd(i, { unit: e.target.value })} placeholder="Unit" className="input-cosmic !py-1 text-sm w-20" />
              <label className="flex items-center gap-1 text-[11px] text-muted">
                <input type="checkbox" checked={m.higherIsBetter !== false} onChange={(e) => upd(i, { higherIsBetter: e.target.checked })} className="accent-cyan-500" /> higher better
              </label>
              <button type="button" onClick={() => del(i)} className="text-rose-300 hover:text-rose-200"><Icon name="x" size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
