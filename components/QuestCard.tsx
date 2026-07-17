"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import type { QuestView, QuestGamer } from "@/lib/quests";

// One Quest as a gamified, themed card: emblem + tier badges + progress bar,
// with an in-card toggle between "Progress" and the quest's CP leaderboard.
// The whole header links to the quest's standalone map page.
export default function QuestCard({ quest, top = [], href }: { quest: QuestView; top?: QuestGamer[]; href?: string }) {
  const [tab, setTab] = useState<"progress" | "leaders">("progress");
  const q = quest;
  const link = href ?? `/quests/${q.key}`;
  const done = q.nextTier === null;
  const prevThreshold = q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].thresholdQp : 0;
  const span = q.nextTier ? q.nextTier.thresholdQp - prevThreshold : 1;
  const into = q.nextTier ? q.qp - prevThreshold : 1;
  const pct = done ? 100 : Math.max(4, Math.min(100, Math.round((into / span) * 100)));
  const earnedCount = q.tiers.filter((t) => t.earned).length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 p-5"
      style={{
        background: q.cardBgUrl
          ? `linear-gradient(180deg, ${q.color}14, rgba(4,5,26,0.72)), url(${q.cardBgUrl}) center/cover`
          : `radial-gradient(120% 120% at 0% 0%, ${q.color}22, transparent 60%), radial-gradient(120% 120% at 100% 100%, ${q.accent2}1a, transparent 60%), rgba(10,10,28,0.6)`,
      }}>
      {/* Header → standalone quest page */}
      <Link href={link} className="flex items-center gap-3 group">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
          style={{ background: `${q.color}22`, border: `1px solid ${q.color}55`, boxShadow: `0 0 20px -6px ${q.color}` }}>
          {q.logoUrl
            ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-8 w-8 object-contain" />
            : <Icon name={q.icon} size={24} style={{ color: q.color }} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg truncate group-hover:underline">{q.name}</h3>
            {q.currentTierIndex >= 0 && (
              <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5" style={{ background: `${q.color}26`, color: q.color }}>{q.tiers[q.currentTierIndex].name}</span>
            )}
            <Icon name="arrowRight" size={14} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
          </div>
          <p className="text-xs text-muted truncate">{q.tagline}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold" style={{ color: q.accent2 }}>{q.qp.toLocaleString()}</div>
          <div className="text-[10px] text-muted">CP · {earnedCount}/{q.tiers.length}</div>
        </div>
      </Link>

      {/* Tier badges */}
      <div className="mt-4 flex items-end justify-between gap-1.5">
        {q.tiers.map((t) => (
          <div key={t.id} className="flex flex-col items-center gap-1 flex-1 min-w-0" title={`${t.name} · ${t.thresholdQp} CP — ${t.description}`}>
            <div className="flex items-center justify-center rounded-full transition-all"
              style={{ width: 40, height: 40, background: t.earned ? `${(t.color || q.color)}2a` : "rgba(255,255,255,0.04)", border: `2px solid ${t.earned ? (t.color || q.color) : "rgba(255,255,255,0.12)"}`, boxShadow: t.earned ? `0 0 16px -3px ${t.color || q.color}` : "none", opacity: t.earned ? 1 : 0.5 }}>
              {t.iconUrl
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.iconUrl} alt="" className="h-7 w-7 object-contain" style={{ filter: t.earned ? "none" : "grayscale(1)" }} />
                : <Icon name={q.icon} size={18} style={{ color: t.earned ? (t.color || q.color) : "#6b7280" }} />}
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide truncate w-full text-center" style={{ color: t.earned ? (t.color || q.color) : "#8b8ba7" }}>{t.name}</span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="h-2 rounded-full bg-black/40 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${q.color}, ${q.accent2})` }} />
        </div>
      </div>

      {/* Tabbed panel: my progress / leaderboard */}
      <div className="mt-3">
        <div className="flex gap-1 mb-2">
          {(["progress", "leaders"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[11px] font-semibold rounded-full px-2.5 py-1 transition-colors ${tab === t ? "text-white" : "text-muted hover:text-ink"}`}
              style={tab === t ? { background: `${q.color}33` } : undefined}>
              {t === "progress" ? "My progress" : "Leaderboard"}
            </button>
          ))}
        </div>
        {tab === "progress" ? (
          <div className="text-[11px] text-muted">
            {done ? <span style={{ color: q.color }}>★ Max tier reached — legend status.</span>
              : <>{into.toLocaleString()} / {span.toLocaleString()} CP to <b style={{ color: q.color }}>{q.nextTier!.name}</b></>}
          </div>
        ) : (
          <div className="space-y-1">
            {top.length === 0 && <div className="text-[11px] text-muted">No questers yet.</div>}
            {top.slice(0, 4).map((g, i) => (
              <Link key={g.slug} href={`/u/${g.slug}`} className="flex items-center gap-2 text-xs hover:text-cyan-300">
                <span className="w-4 text-center font-bold" style={{ color: q.color }}>{i + 1}</span>
                <Avatar name={g.name} src={g.avatarUrl} size={18} />
                <span className="flex-1 truncate">{g.name}</span>
                <span className="text-muted shrink-0">{(g.qp ?? 0).toLocaleString()} CP</span>
              </Link>
            ))}
            <Link href={link} className="block text-[11px] hover:underline pt-1" style={{ color: q.color }}>Full leaderboard →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
