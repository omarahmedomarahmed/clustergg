"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import CpIcon from "@/components/CpIcon";
import type { CpLedgerEntry } from "@/lib/quests";

function ago(iso: string): string {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24); if (dd < 30) return `${dd}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// A filterable CP history log. `quests` is the filter set (omit to hide the
// quest filter, e.g. on a single-quest page). `compact` trims chrome.
export default function CpLedger({
  entries, quests, title = "Cluster Points log",
}: {
  entries: CpLedgerEntry[];
  quests?: { key: string; name: string; color: string }[];
  title?: string;
}) {
  const [questKey, setQuestKey] = useState<string>("all");
  const [range, setRange] = useState<"all" | "7" | "30">("all");

  const filtered = useMemo(() => {
    const cutoff = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
    return entries.filter((e) =>
      (questKey === "all" || e.questKey === questKey) &&
      (range === "all" || new Date(e.at).getTime() >= cutoff));
  }, [entries, questKey, range]);

  const total = filtered.reduce((s, e) => s + e.qp, 0);

  return (
    <div className="glass p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="font-bold flex items-center gap-2"><Icon name="clock" size={16} className="text-cyan-300" /> {title}</h3>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-200"><CpIcon size={16} /> {total.toLocaleString()} <span className="text-muted font-medium text-xs">shown</span></span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {quests && quests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setQuestKey("all")} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors ${questKey === "all" ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-white/12 text-muted hover:border-white/30"}`}>All quests</button>
            {quests.map((q) => (
              <button key={q.key} onClick={() => setQuestKey(q.key)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors ${questKey === q.key ? "text-white" : "text-muted hover:text-ink"}`}
                style={questKey === q.key ? { borderColor: `${q.color}aa`, background: `${q.color}22` } : { borderColor: "rgba(255,255,255,0.12)" }}>
                {q.name}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-1.5">
          {([["all", "All time"], ["30", "30 days"], ["7", "7 days"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setRange(k)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors ${range === k ? "border-violet-400/60 bg-violet-500/15 text-violet-200" : "border-white/12 text-muted hover:border-white/30"}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Log */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted">No CP earned in this range yet — go play the Cluster.</div>
      ) : (
        <div className="divide-y divide-white/5 max-h-[28rem] overflow-y-auto -mx-1 px-1">
          {filtered.map((e) => (
            <div key={e.id} className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-white/10" style={{ background: `${e.color}22` }}>
                {e.logoUrl
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={e.logoUrl} alt="" className="h-full w-full object-cover" />
                  : <Icon name="spark" size={14} style={{ color: e.color }} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{e.label}</div>
                <div className="text-[11px] text-muted">{e.questName} · {ago(e.at)}</div>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1 text-sm font-bold" style={{ color: e.color }}>
                <CpIcon size={14} /> +{e.qp.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
