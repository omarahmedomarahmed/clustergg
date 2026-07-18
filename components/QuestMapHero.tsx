"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import TopBannerAd from "@/components/TopBannerAd";
import ZoomPan from "@/components/ZoomPan";
import CpIcon from "@/components/CpIcon";
import type { QuestView, QuestGamer } from "@/lib/quests";

// A text-free, treasure-map hero for a quest: the map art with the quest's
// tiers as clickable milestone pins, a "you are here" marker that travels the
// path as you progress (bronze → platinum), a per-quest space backdrop, and a
// glorified toggle to switch to another quest's map.
export default function QuestMapHero({
  quest, tierHolders, tabs, toggle, backHref, variants, totalCp,
}: {
  quest: QuestView;
  tierHolders: Record<string, QuestGamer[]>;
  tabs: { key: string; name: string; color: string; logoUrl: string | null; icon: string; mapArtUrl: string | null }[];
  toggle?: React.ReactNode;
  backHref?: string;
  totalCp?: number;
  // When provided, the quest tabs switch the map IN-FRAME (feed/home) instead
  // of navigating to the quest page.
  variants?: { key: string; quest: QuestView; tierHolders: Record<string, QuestGamer[]> }[];
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [howto, setHowto] = useState(false);
  const [activeKey, setActiveKey] = useState(quest.key);
  const inFrame = !!variants && variants.length > 0;
  const active = inFrame ? (variants!.find((v) => v.key === activeKey) ?? variants![0]) : null;
  const q = active ? active.quest : quest;
  const holders = active ? active.tierHolders : tierHolders;
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

      {/* Sponsor strip — over the quest backdrop, not the plain site backdrop */}
      <TopBannerAd className="pt-3 pb-1" />

      {/* Back to all quests — live ON the hero art */}
      {backHref && (
        <div className="mx-auto max-w-6xl px-4 pt-3">
          <Link href={backHref} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 backdrop-blur px-3.5 py-1.5 text-xs font-semibold text-white hover:border-cyan-400/50 transition-colors">
            <Icon name="arrowLeft" size={13} /> All quests
          </Link>
        </div>
      )}

      {/* In-hero planet⇄quest toggle */}
      {toggle && <div className="pt-3">{toggle}</div>}

      <div className="mx-auto max-w-6xl px-4 pt-4 pb-8 md:pb-10">
        {/* Quest toggle — glorified cards, navigate between quest maps */}
        {tabs.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 mb-5">
            {tabs.map((t) => {
              const on = t.key === q.key;
              const inner = (
                <>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg overflow-hidden shrink-0" style={{ background: `${t.color}22` }}>
                    {t.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.logoUrl} alt="" className="h-6 w-6 object-contain" /> : <Icon name={t.icon} size={14} style={{ color: t.color }} />}
                  </span>
                  <span className="text-sm font-semibold">{t.name}</span>
                </>
              );
              const cls = `group inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 transition-all ${on ? "scale-105" : "opacity-70 hover:opacity-100"}`;
              const style = { borderColor: `${t.color}${on ? "cc" : "44"}`, background: on ? `${t.color}22` : "rgba(255,255,255,0.03)" };
              return inFrame
                ? <button key={t.key} onClick={() => { setActiveKey(t.key); setSel(null); }} className={cls} style={style}>{inner}</button>
                : <Link key={t.key} href={`/quests/${t.key}`} className={cls} style={style}>{inner}</Link>;
            })}
          </div>
        )}

        {/* Total CP — BELOW the toggle */}
        {totalCp !== undefined && (
          <div className="flex justify-center mb-4">
            <Link href="/quests" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 backdrop-blur px-4 py-1.5 text-sm font-bold text-white hover:border-cyan-400/40">
              <CpIcon size={20} /> {totalCp.toLocaleString()} <span className="text-muted font-semibold">total CP</span>
            </Link>
          </div>
        )}

        {/* Quest identity — description now lives in the "How to play" overlay */}
        <div className="relative z-20 mx-auto max-w-3xl text-center mb-5">
          <h1 className="text-3xl md:text-5xl font-bold grad-text">{q.name}</h1>
          <p className="text-muted mt-1.5">{q.tagline}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-base" style={{ color: q.accent2 }}>
              <CpIcon size={22} /> {q.qp.toLocaleString()} CP earned
            </span>
            <span className="text-muted">·</span>
            <span className="text-muted">
              {q.currentTierIndex >= 0 ? `${tiers[q.currentTierIndex].name} unlocked` : "Just starting"}
              {q.nextTier ? ` — ${(q.nextTier.thresholdQp - q.qp).toLocaleString()} CP to ${q.nextTier.name}` : " — max tier reached!"}
            </span>
          </div>
        </div>

        {/* Glorified milestone ladder — the 4 tiers with their art + CP, ON TOP of the map */}
        <div className="relative z-20 mx-auto max-w-4xl mb-4 grid grid-cols-4 gap-2 md:gap-3">
          {tiers.map((t, i) => (
            <button key={t.id} onClick={() => setSel(sel === i ? null : i)}
              className={`group relative flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition-all ${t.earned ? "" : "opacity-70"}`}
              style={{ borderColor: t.earned ? `${(t.color || q.color)}88` : "rgba(255,255,255,0.12)", background: t.earned ? `${(t.color || q.color)}14` : "rgba(4,5,26,0.5)" }}>
              <span className="flex items-center justify-center rounded-xl" style={{ width: 48, height: 48, background: t.earned ? `${(t.color || q.color)}26` : "rgba(255,255,255,0.05)", boxShadow: t.earned ? `0 0 18px -4px ${t.color || q.color}` : "none" }}>
                {t.iconUrl
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.iconUrl} alt="" className="h-9 w-9 object-contain" style={{ filter: t.earned ? "none" : "grayscale(1)" }} />
                  : <Icon name={q.icon} size={22} style={{ color: t.earned ? (t.color || q.color) : "#6b7280" }} />}
              </span>
              <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide truncate w-full text-center" style={{ color: t.earned ? (t.color || q.color) : "#8b8ba7" }}>{t.name}</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted"><CpIcon size={10} /> {t.thresholdQp.toLocaleString()}</span>
              {t.earned && <span className="absolute top-1 right-1 text-emerald-300 text-[10px]">✓</span>}
            </button>
          ))}
        </div>

        {/* The map — fit (zoomed out) by default; zoom ONLY via the on-map
            controls (no scroll-zoom, no drag). Sits BEHIND the surrounding text
            (z-0) and gently bobs up/down like a planet. */}
        <div className="relative z-0 mx-auto w-full max-w-4xl aspect-[16/9] float-y">
          <ZoomPan className="h-full w-full" max={4} initial={1} wheel={false} pan={false}>
          {/* map art */}
          <div className="absolute inset-0" style={{ background: q.mapArtUrl ? `url(${q.mapArtUrl}) center/cover` : `linear-gradient(120deg, ${q.color}22, ${q.accent2}18), #0a0a1c` }} />
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

          {/* You-are-here rocket — rides the trail at the exact CP position */}
          <div className="absolute -translate-x-1/2 -translate-y-1/2 z-10" style={{ left: `${youX}%`, top: `${youY}%` }}>
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full text-white float-y" style={{ background: q.accent2, boxShadow: `0 0 16px 3px ${q.accent2}` }}>
              <Icon name="rocket" size={14} />
              <span className="absolute inset-0 rounded-full animate-ping" style={{ background: `${q.accent2}66` }} />
            </span>
            <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold" style={{ color: q.accent2 }}>
              {q.qp.toLocaleString()} CP
            </span>
          </div>
          </ZoomPan>

          {/* How-to-play button — opens an overlay with the quest description */}
          <button type="button" onClick={() => setHowto((v) => !v)}
            className="absolute top-3 right-3 z-30 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 backdrop-blur px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white hover:border-cyan-400/50 transition-colors">
            <Icon name="spark" size={12} style={{ color: q.accent2 }} /> How to play
          </button>
          {howto && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4" onClick={() => setHowto(false)}>
              <div onClick={(e) => e.stopPropagation()} className="max-w-lg w-full rounded-2xl border border-white/15 backdrop-blur-xl p-5 bg-cover bg-center shadow-2xl"
                style={{ background: (q.mapArtUrl || q.cardBgUrl) ? `linear-gradient(rgba(4,5,26,0.88), rgba(4,5,26,0.94)), url(${q.mapArtUrl || q.cardBgUrl}) center/cover` : "rgba(4,5,26,0.94)" }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-lg grad-text">{q.name} — How to play</h3>
                  <button onClick={() => setHowto(false)} className="text-muted hover:text-ink"><Icon name="x" size={16} /></button>
                </div>
                <p className="text-sm text-muted leading-relaxed">{q.lore || q.tagline}</p>
                <div className="mt-3 text-xs text-muted">Earn Cluster Points by playing across the Cluster — pass each milestone to level up this quest.</div>
              </div>
            </div>
          )}

          {/* Milestone detail — overlay panel on click (over the quest art) */}
          {sel !== null && tiers[sel] && (
            <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-white/15 backdrop-blur-xl p-4 text-left bg-cover bg-center"
              style={{ background: (q.mapArtUrl || q.cardBgUrl) ? `linear-gradient(rgba(4,5,26,0.84), rgba(4,5,26,0.92)), url(${q.mapArtUrl || q.cardBgUrl}) center/cover` : "rgba(4,5,26,0.9)" }}>
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
              {(holders[tiers[sel].id]?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {holders[tiers[sel].id].map((g) => (
                    <Link key={g.slug} href={`/u/${g.slug}`} className="flex items-center gap-1.5 rounded-full bg-white/5 pl-1 pr-2.5 py-1 text-xs hover:bg-white/10">
                      <Avatar name={g.name} src={g.avatarUrl} size={20} /> <span className="truncate max-w-[120px]">{g.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tier legend under the map — quick milestone ladder (above the art) */}
        <div className="relative z-20 mx-auto max-w-4xl mt-4 flex flex-wrap items-center justify-center gap-2">
          {tiers.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              style={{ borderColor: t.earned ? `${t.color || q.color}88` : "rgba(255,255,255,0.12)", color: t.earned ? (t.color || q.color) : "#8b8ba7", background: t.earned ? `${t.color || q.color}14` : "transparent" }}>
              {t.earned ? "✓" : "○"} {t.name} · {t.thresholdQp.toLocaleString()} CP
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
