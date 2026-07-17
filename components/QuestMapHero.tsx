"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import type { QuestView, QuestGamer } from "@/lib/quests";

// A text-free, treasure-map hero for a quest: the map art with the quest's
// tiers as clickable milestone pins, a "you are here" marker that travels the
// path as you progress (bronze → platinum), a per-quest space backdrop, and a
// glorified toggle to switch to another quest's map.
export default function QuestMapHero({
  quest, tierHolders, tabs,
}: {
  quest: QuestView;
  tierHolders: Record<string, QuestGamer[]>;
  tabs: { key: string; name: string; color: string; logoUrl: string | null; icon: string; mapArtUrl: string | null }[];
}) {
  const [sel, setSel] = useState<number | null>(null);
  const q = quest;
  const tiers = q.tiers;

  // "You are here" marker: interpolate along the path between the last earned
  // pin and the next one, by CP progress into the current segment.
  const cur = q.currentTierIndex; // -1 before first tier
  const from = cur >= 0 ? tiers[cur] : null;
  const to = q.nextTier;
  let youX: number, youY: number;
  if (from && to) {
    const span = to.thresholdQp - from.thresholdQp || 1;
    const f = Math.max(0, Math.min(1, (q.qp - from.thresholdQp) / span));
    youX = from.mapX + (to.mapX - from.mapX) * f;
    youY = from.mapY + (to.mapY - from.mapY) * f;
  } else if (!from && to) {
    const f = Math.max(0, Math.min(1, q.qp / (to.thresholdQp || 1)));
    youX = 8 + (to.mapX - 8) * f; youY = to.mapY;
  } else {
    const last = tiers[tiers.length - 1];
    youX = last?.mapX ?? 92; youY = last?.mapY ?? 50;
  }

  return (
    <section className="relative overflow-hidden">
      {/* Space backdrop (quest theme) */}
      <div className="absolute inset-0 -z-10" style={{ background: "#04051a" }} />
      {q.cardBgUrl ? (
        <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.45), rgba(4,5,26,0.78)), url(${q.cardBgUrl})` }} />
      ) : (
        <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(1200px 620px at 30% 10%, ${q.color}26, transparent 60%), radial-gradient(900px 500px at 90% 110%, ${q.accent2}1a, transparent 60%)` }} />
      )}

      <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
        {/* Quest toggle — glorified cards, navigate between quest maps */}
        {tabs.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 mb-5">
            {tabs.map((t) => {
              const active = t.key === q.key;
              return (
                <Link key={t.key} href={`/quests/${t.key}`}
                  className={`group inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 transition-all ${active ? "scale-105" : "opacity-70 hover:opacity-100"}`}
                  style={{ borderColor: `${t.color}${active ? "cc" : "44"}`, background: active ? `${t.color}22` : "rgba(255,255,255,0.03)" }}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg overflow-hidden shrink-0" style={{ background: `${t.color}22` }}>
                    {t.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.logoUrl} alt="" className="h-6 w-6 object-contain" /> : <Icon name={t.icon} size={14} style={{ color: t.color }} />}
                  </span>
                  <span className="text-sm font-semibold">{t.name}</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* The map */}
        <div className="relative mx-auto w-full max-w-4xl aspect-[16/9] rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
          style={{ background: q.mapArtUrl ? `url(${q.mapArtUrl}) center/cover` : `linear-gradient(120deg, ${q.color}22, ${q.accent2}18), #0a0a1c` }}>
          {/* readability veil */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,5,26,0.15), rgba(4,5,26,0.45))" }} />

          {/* Path line connecting the milestones */}
          <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              points={tiers.map((t) => `${t.mapX},${t.mapY}`).join(" ")}
              fill="none" stroke={`${q.color}`} strokeOpacity="0.5" strokeWidth="0.8"
              strokeDasharray="2 1.6" strokeLinecap="round" />
          </svg>

          {/* Milestone pins */}
          {tiers.map((t, i) => {
            const active = sel === i;
            return (
              <button key={t.id} onClick={() => setSel(active ? null : i)}
                title={`${t.name} · ${t.thresholdQp} CP`}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{ left: `${t.mapX}%`, top: `${t.mapY}%` }}>
                <span className="flex items-center justify-center rounded-full transition-transform group-hover:scale-110"
                  style={{ width: active ? 54 : 46, height: active ? 54 : 46, background: t.earned ? `${(t.color || q.color)}33` : "rgba(0,0,0,0.5)", border: `2px solid ${t.earned ? (t.color || q.color) : "rgba(255,255,255,0.25)"}`, boxShadow: t.earned ? `0 0 20px -2px ${t.color || q.color}` : "none", opacity: t.earned ? 1 : 0.75 }}>
                  {t.iconUrl
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.iconUrl} alt="" className="h-8 w-8 object-contain" style={{ filter: t.earned ? "none" : "grayscale(1)" }} />
                    : <Icon name={q.icon} size={20} style={{ color: t.earned ? (t.color || q.color) : "#8b8ba7" }} />}
                </span>
                <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: t.earned ? (t.color || q.color) : "#cbd5e1" }}>{t.name}</span>
              </button>
            );
          })}

          {/* You-are-here marker */}
          <div className="absolute -translate-x-1/2 -translate-y-1/2 z-10 float-y" style={{ left: `${youX}%`, top: `${Math.max(6, youY - 10)}%` }}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: q.accent2, boxShadow: `0 0 14px 2px ${q.accent2}` }}>
              <Icon name="rocket" size={13} />
            </span>
          </div>

          {/* Milestone detail — overlay panel on click */}
          {sel !== null && tiers[sel] && (
            <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-white/15 bg-[#04051a]/90 backdrop-blur-xl p-4 text-left">
              <div className="flex items-center justify-between">
                <div className="font-bold flex items-center gap-2" style={{ color: tiers[sel].color || q.color }}>
                  {tiers[sel].name}
                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5" style={{ background: tiers[sel].earned ? "#10b98122" : "#ffffff10", color: tiers[sel].earned ? "#34d399" : "#94a3b8" }}>
                    {tiers[sel].earned ? "✓ Unlocked" : "Locked"}
                  </span>
                </div>
                <button onClick={() => setSel(null)} className="text-muted hover:text-ink"><Icon name="x" size={14} /></button>
              </div>
              <div className="text-xs text-muted mt-1">{tiers[sel].description || `Reach ${tiers[sel].thresholdQp.toLocaleString()} Cluster Points.`}</div>
              <div className="mt-1.5 text-xs"><b style={{ color: q.accent2 }}>{tiers[sel].thresholdQp.toLocaleString()} CP</b> · {tiers[sel].holders.toLocaleString()} reached this step</div>
              {(tierHolders[tiers[sel].id]?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tierHolders[tiers[sel].id].map((g) => (
                    <Link key={g.slug} href={`/u/${g.slug}`} className="flex items-center gap-1.5 rounded-full bg-white/5 pl-1 pr-2.5 py-1 text-xs hover:bg-white/10">
                      <Avatar name={g.name} src={g.avatarUrl} size={20} /> <span className="truncate max-w-[120px]">{g.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Your quest log line */}
        <div className="mx-auto max-w-4xl mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
          <span className="font-bold text-lg grad-text">{q.name}</span>
          <span className="text-muted">{q.tagline}</span>
          <span className="inline-flex items-center gap-1.5" style={{ color: q.accent2 }}>
            <Icon name="spark" size={14} /> {q.qp.toLocaleString()} CP
          </span>
          <span className="text-muted">·</span>
          <span className="text-muted">{q.currentTierIndex >= 0 ? `${tiers[q.currentTierIndex].name} unlocked` : "Just starting"}{q.nextTier ? ` — ${(q.nextTier.thresholdQp - q.qp).toLocaleString()} CP to ${q.nextTier.name}` : " — max tier!"}</span>
        </div>
      </div>
    </section>
  );
}
