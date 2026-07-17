"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import type { QuestView, QuestGamer } from "@/lib/quests";

// One Quest as a gamified, themed card. The whole card navigates to the quest's
// map page; tapping a milestone opens a helper card with that milestone's story.
export default function QuestCard({ quest, top = [], href }: { quest: QuestView; top?: QuestGamer[]; href?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"progress" | "leaders">("progress");
  const [sel, setSel] = useState<number | null>(null);
  const q = quest;
  const link = href ?? `/quests/${q.key}`;
  const done = q.nextTier === null;
  const prevThreshold = q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].thresholdQp : 0;
  const span = q.nextTier ? q.nextTier.thresholdQp - prevThreshold : 1;
  const into = q.nextTier ? q.qp - prevThreshold : 1;
  const pct = done ? 100 : Math.max(4, Math.min(100, Math.round((into / span) * 100)));
  const earnedCount = q.tiers.filter((t) => t.earned).length;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const helperBg = q.cardBgUrl || q.mapArtUrl;

  return (
    <div role="link" tabIndex={0} onClick={() => router.push(link)}
      onKeyDown={(e) => { if (e.key === "Enter") router.push(link); }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 p-5 cursor-pointer hover:border-white/25 transition-colors"
      style={{
        background: q.cardBgUrl
          ? `linear-gradient(180deg, ${q.color}14, rgba(4,5,26,0.72)), url(${q.cardBgUrl}) center/cover`
          : `radial-gradient(120% 120% at 0% 0%, ${q.color}22, transparent 60%), radial-gradient(120% 120% at 100% 100%, ${q.accent2}1a, transparent 60%), rgba(10,10,28,0.6)`,
      }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
          style={{ background: `${q.color}22`, border: `1px solid ${q.color}55`, boxShadow: `0 0 20px -6px ${q.color}` }}>
          {q.logoUrl
            ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-8 w-8 object-contain" />
            : <Icon name={q.icon} size={24} style={{ color: q.color }} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg truncate group-hover:underline">{q.name}</h3>
            {q.completions > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: `${q.color}33`, color: q.color, border: `1px solid ${q.color}66` }} title={`Completed ${q.completions}×`}>
                {q.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-3.5 w-3.5 object-contain" /> : <Icon name="trophy" size={11} />} ×{q.completions}
              </span>
            )}
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
      </div>

      {/* Tier badges — tap for the milestone story */}
      <div className="mt-4 flex items-end justify-between gap-1.5">
        {q.tiers.map((t, i) => (
          <button key={t.id} onClick={(e) => { stop(e); setSel(sel === i ? null : i); }}
            className="flex flex-col items-center gap-1 flex-1 min-w-0" title={`${t.name} · ${t.thresholdQp} CP`}>
            <div className="flex items-center justify-center rounded-full transition-all"
              style={{ width: 40, height: 40, background: t.earned ? `${(t.color || q.color)}2a` : "rgba(255,255,255,0.04)", border: `2px solid ${sel === i ? "#fff" : t.earned ? (t.color || q.color) : "rgba(255,255,255,0.12)"}`, boxShadow: t.earned ? `0 0 16px -3px ${t.color || q.color}` : "none", opacity: t.earned ? 1 : 0.5 }}>
              {t.iconUrl
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.iconUrl} alt="" className="h-7 w-7 object-contain" style={{ filter: t.earned ? "none" : "grayscale(1)" }} />
                : <Icon name={q.icon} size={18} style={{ color: t.earned ? (t.color || q.color) : "#6b7280" }} />}
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide truncate w-full text-center" style={{ color: t.earned ? (t.color || q.color) : "#8b8ba7" }}>{t.name}</span>
          </button>
        ))}
      </div>

      {/* Milestone story helper card (editable art bg via the quest card art) */}
      {sel !== null && q.tiers[sel] && (
        <div onClick={stop} className="mt-3 rounded-xl border border-white/15 p-3 text-left bg-cover bg-center"
          style={{ background: helperBg ? `linear-gradient(rgba(4,5,26,0.82), rgba(4,5,26,0.9)), url(${helperBg}) center/cover` : "rgba(4,5,26,0.6)" }}>
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm flex items-center gap-2" style={{ color: q.tiers[sel].color || q.color }}>
              {q.tiers[sel].name}
              <span className="text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5" style={{ background: q.tiers[sel].earned ? "#10b98122" : "#ffffff10", color: q.tiers[sel].earned ? "#34d399" : "#94a3b8" }}>
                {q.tiers[sel].earned ? "✓ Unlocked" : "How to reach"}
              </span>
            </div>
            <button onClick={(e) => { stop(e); setSel(null); }} className="text-muted hover:text-ink"><Icon name="x" size={13} /></button>
          </div>
          <p className="text-[11px] text-muted mt-1 leading-relaxed">{q.tiers[sel].description || `Reach ${q.tiers[sel].thresholdQp.toLocaleString()} Cluster Points to unlock ${q.tiers[sel].name}.`}</p>
          <div className="mt-1.5 text-[11px]"><b style={{ color: q.accent2 }}>{q.tiers[sel].thresholdQp.toLocaleString()} CP</b> · {q.tiers[sel].holders.toLocaleString()} reached this step</div>
        </div>
      )}

      {/* Progress bar */}
      <div className="mt-4">
        <div className="h-2 rounded-full bg-black/40 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${q.color}, ${q.accent2})` }} />
        </div>
      </div>

      {/* Tabbed panel: my progress / leaderboard */}
      <div className="mt-3" onClick={stop}>
        <div className="flex gap-1 mb-2">
          {(["progress", "leaders"] as const).map((t) => (
            <button key={t} onClick={(e) => { stop(e); setTab(t); }}
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
              <Link key={g.slug} href={`/u/${g.slug}`} onClick={stop} className="flex items-center gap-2 text-xs hover:text-cyan-300">
                <span className="w-4 text-center font-bold" style={{ color: q.color }}>{i + 1}</span>
                <Avatar name={g.name} src={g.avatarUrl} size={18} />
                <span className="flex-1 truncate">{g.name}</span>
                <span className="text-muted shrink-0">{(g.qp ?? 0).toLocaleString()} CP</span>
              </Link>
            ))}
            <Link href={link} onClick={stop} className="block text-[11px] hover:underline pt-1" style={{ color: q.color }}>Full leaderboard →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
