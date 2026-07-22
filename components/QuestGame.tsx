"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import CpIcon from "@/components/CpIcon";
import ZoomPan from "@/components/ZoomPan";
import { useTr } from "@/components/LocaleProvider";
import { QUEST_ASTRONAUT } from "@/lib/quest-marker";
import { smoothPathD, sampleCurve, pointAtLength, nearestLength, type Pt } from "@/lib/quest-path";
import type { QuestGamePayload } from "@/lib/quest-game";
import type { QuestView, QuestGamer } from "@/lib/quests";

// The playable space-game experience for a quest: a full-screen overlay where
// the map art is the game world, the astronaut is your character that WALKS the
// trail when you tap a milestone, and the quest's real scoring config + the
// gamer's real CP history power the in-game Rules / Log / Missions / Guide
// screens. Uses the mobile-specific trail (pathPointsMobile) when the stage is
// portrait, so the line matches the art on phones. Panel art is admin-editable
// (Admin → Card backgrounds → Quest game screens).

type Panel = "rules" | "log" | "guide" | "missions" | null;

export default function QuestGame({
  quest, holders, game, rocketUrl, initialTier, onClose,
}: {
  quest: QuestView;
  holders: Record<string, QuestGamer[]>;
  game: QuestGamePayload;
  rocketUrl?: string;
  initialTier?: number | null;
  onClose: () => void;
}) {
  const tr = useTr();
  const [mounted, setMounted] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState<"front" | "left" | "right">("front");
  const [arrived, setArrived] = useState<number | null>(null); // celebration ring
  const [fs, setFs] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => setMounted(true), []);

  const tiers = quest.tiers;
  const { rules, log, totalCp, art, missions } = game;

  // ===== Stage sizing — the world keeps the hero's aspect (pins line up with
  // the art) and is fitted as large as possible into the free screen area. =====
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);
  const portrait = area.h >= area.w;
  const ratio = portrait ? 4 / 5 : 16 / 9;
  let sw = area.w, sh = sw / ratio;
  if (sh > area.h && area.h > 0) { sh = area.h; sw = sh * ratio; }

  // ===== World geometry — same curve as the hero; portrait screens use the
  // admin's MOBILE trail (the curve differs between 4:5 and 16:9 art). =====
  const { curveD, samples, totalLen, tierLens, youLen } = useMemo(() => {
    const mobile = quest.pathPointsMobile && quest.pathPointsMobile.length >= 2 ? quest.pathPointsMobile : null;
    const desktop = quest.pathPoints && quest.pathPoints.length >= 2 ? quest.pathPoints : null;
    const trail: Pt[] = (portrait ? mobile ?? desktop : desktop) ?? tiers.map((t) => ({ x: t.mapX, y: t.mapY }));
    const s = sampleCurve(trail);
    const tl = s.length ? s[s.length - 1].len : 0;
    const lens = tiers.map((t) => nearestLength(s, { x: t.mapX, y: t.mapY }));
    const cur = quest.currentTierIndex;
    const from = cur >= 0 ? tiers[cur] : null;
    const to = quest.nextTier;
    let you: number;
    if (from && to) {
      const span = to.thresholdQp - from.thresholdQp || 1;
      const f = Math.max(0, Math.min(1, (quest.qp - from.thresholdQp) / span));
      const a = lens[cur], b = nearestLength(s, { x: to.mapX, y: to.mapY });
      you = a + (b - a) * f;
    } else if (!from && to) {
      const f = Math.max(0, Math.min(1, quest.qp / (to.thresholdQp || 1)));
      you = nearestLength(s, { x: to.mapX, y: to.mapY }) * f;
    } else {
      you = tl;
    }
    return { curveD: smoothPathD(trail), samples: s, totalLen: tl, tierLens: lens, youLen: you };
  }, [quest, tiers, portrait]);

  // ===== The character walks the trail (RAF along the sampled curve) =====
  const [markerLen, setMarkerLen] = useState(youLen);
  const markerRef = useRef(youLen);
  const anim = useRef<number | null>(null);
  const setLen = (v: number) => { markerRef.current = v; setMarkerLen(v); };
  // Re-anchor when the trail itself changes (portrait flip / quest switch).
  useEffect(() => { setLen(youLen); }, [youLen]); // eslint-disable-line react-hooks/exhaustive-deps

  const walkTo = (target: number, after?: () => void) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const start = markerRef.current;
    const dist = target - start;
    if (Math.abs(dist) < 0.5) { setLen(target); after?.(); return; }
    const dur = Math.min(2400, 450 + Math.abs(dist) * 18);
    const t0 = performance.now();
    setWalking(true);
    const step = (now: number) => {
      const f = Math.min(1, (now - t0) / dur);
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; // ease in-out
      const len = start + dist * e;
      setLen(len);
      const here = pointAtLength(samples, len);
      const ahead = pointAtLength(samples, Math.max(0, Math.min(totalLen, len + Math.sign(dist))));
      setFacing(Math.abs(ahead.x - here.x) < 0.01 ? "front" : ahead.x >= here.x ? "right" : "left");
      if (f < 1) anim.current = requestAnimationFrame(step);
      else { setWalking(false); setFacing("front"); after?.(); }
    };
    anim.current = requestAnimationFrame(step);
  };
  useEffect(() => () => { if (anim.current) cancelAnimationFrame(anim.current); }, []);

  const goTo = (i: number) => {
    setPanel(null); setSel(null);
    walkTo(tierLens[i], () => {
      setSel(i);
      setArrived(i);
      setTimeout(() => setArrived((a) => (a === i ? null : a)), 1500);
    });
  };

  // Deep-link: opened from a milestone pin → the astronaut travels there.
  useEffect(() => {
    if (initialTier != null && tiers[initialTier]) {
      const id = setTimeout(() => goTo(initialTier), 350);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Overlay chrome: scroll lock, Escape, fullscreen =====
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const canFs = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen?.();
    } catch { /* iOS Safari — the overlay already fills the screen */ }
  };
  const close = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose();
  };

  const you = pointAtLength(samples, markerLen);
  const home = pointAtLength(samples, youLen);
  const awayFromHome = Math.abs(markerLen - youLen) > 1;
  const marker = rocketUrl || QUEST_ASTRONAUT[facing];

  // Progress HUD (top bar): CP into the next milestone.
  const cur = quest.currentTierIndex;
  const from = cur >= 0 ? tiers[cur] : null;
  const to = quest.nextTier;
  const span = to ? to.thresholdQp - (from?.thresholdQp ?? 0) : 1;
  const pct = to ? Math.max(3, Math.min(100, Math.round(((quest.qp - (from?.thresholdQp ?? 0)) / span) * 100))) : 100;

  // CP history grouped by action type — full visibility of what earned what.
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; label: string; total: number; entries: typeof log }>();
    for (const e of log) {
      const g = m.get(e.actionKey) ?? { key: e.actionKey, label: e.label, total: 0, entries: [] };
      g.total += e.qp; g.entries.push(e); m.set(e.actionKey, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [log]);

  // Guided starter missions — red dots drive the gamer to their firsts.
  const missionList = useMemo(() => {
    if (!missions) return [];
    return [
      { key: "connect", icon: "link", label: tr("Connect your first game account"), href: "/profile", at: missions.connectAt },
      { key: "planet", icon: "planet", label: tr("Join your first planet"), href: "/planets", at: missions.planetAt },
      { key: "challenge", icon: "zap", label: tr("Join your first challenge"), href: "/planets", at: missions.challengeAt },
      { key: "ad", icon: "eye", label: tr("Spot your first sponsor signal (ad)"), href: "/feed", at: missions.adAt },
    ];
  }, [missions, tr]);
  const missionsOpen = missionList.filter((m) => !m.at).length;
  const rulesUnread = quest.qp === 0; // fresh questers should read the rules first
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  if (!mounted) return null;

  const sheet = "absolute inset-x-0 bottom-0 z-40 max-h-[72dvh] overflow-y-auto overscroll-contain rounded-t-3xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[420px] sm:max-h-[70dvh] sm:rounded-2xl border border-white/15 backdrop-blur-xl shadow-2xl";
  const defaultSheetBg = `linear-gradient(rgba(4,5,26,0.92), rgba(4,5,26,0.96))${quest.cardBgUrl ? `, url(${quest.cardBgUrl}) center/cover` : ""}`;
  const panelBg = (k: "rules" | "log" | "guide" | "missions") => ({ background: art?.[k] || defaultSheetBg });
  const redDot = (n?: number) => (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-[#04051a]">
      {n && n > 1 ? n : ""}
    </span>
  );
  // Game-card action buttons (bottom bar) — art background + red attention dots.
  const tabBtn = (p: Exclude<Panel, null>, icon: string, label: string, dot?: number | boolean) => (
    <button key={p} onClick={() => { setSel(null); setPanel(panel === p ? null : p); }}
      className={`relative flex flex-1 sm:flex-none sm:w-32 flex-col items-center justify-end gap-1 overflow-hidden rounded-2xl border px-2 pt-6 pb-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all active:scale-95 ${panel === p ? "text-white scale-[1.03]" : "text-white/85"}`}
      style={{ borderColor: panel === p ? `${quest.color}dd` : "rgba(255,255,255,0.14)", boxShadow: panel === p ? `0 0 22px -6px ${quest.color}` : "none" }}>
      <span aria-hidden className="absolute inset-0" style={{ background: art?.[p] || `linear-gradient(180deg, ${quest.color}30, rgba(4,5,26,0.9))` }} />
      <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,5,26,0.1), rgba(4,5,26,0.65))" }} />
      <Icon name={icon} size={17} className="relative" style={{ color: panel === p ? quest.accent2 : "#e6e6f7" }} />
      <span className="relative leading-none">{label}</span>
      {dot ? redDot(typeof dot === "number" ? dot : undefined) : null}
    </button>
  );

  const overlay = (
    <div ref={rootRef} className="fixed inset-0 z-[120] flex flex-col select-none" style={{ background: "#04051a" }} dir="ltr">
      <style>{`
        @keyframes qg-hop { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-9%) } }
        @keyframes qg-burst { 0% { transform: scale(0.4); opacity: 0.9 } 100% { transform: scale(2.1); opacity: 0 } }
      `}</style>
      {/* Space backdrop */}
      {quest.cardBgUrl
        ? <div aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.55), rgba(4,5,26,0.8)), url(${quest.cardBgUrl})` }} />
        : <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(1000px 560px at 25% 8%, ${quest.color}29, transparent 60%), radial-gradient(800px 480px at 90% 100%, ${quest.accent2}1f, transparent 60%)` }} />}

      {/* ===== HUD top bar ===== */}
      <div className="relative z-30 flex items-center gap-2.5 px-3 pt-3 sm:px-4" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border shrink-0" style={{ borderColor: `${quest.color}66`, background: `${quest.color}1f` }}>
          {quest.logoUrl
            ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={quest.logoUrl} alt="" className="h-8 w-8 object-contain" />
            : <Icon name={quest.icon} size={20} style={{ color: quest.color }} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm truncate bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${quest.color}, ${quest.accent2})` }}>{quest.name}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 border border-white/10 px-2 py-0.5 text-[11px] font-bold shrink-0" style={{ color: quest.accent2 }}>
              <CpIcon size={13} /> {quest.qp.toLocaleString()}
            </span>
          </div>
          {/* Level-up bar: progress into the next milestone */}
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 flex-1 max-w-[260px] overflow-hidden rounded-full bg-black/50 border border-white/10">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${quest.color}, ${quest.accent2})` }} />
            </div>
            <span className="text-[10px] text-muted font-semibold whitespace-nowrap">
              {to ? `${(to.thresholdQp - quest.qp).toLocaleString()} CP → ${to.name}` : tr("Max tier reached!")}
            </span>
          </div>
        </div>
        {canFs && (
          <button onClick={toggleFs} aria-label={fs ? tr("Exit full screen") : tr("Full screen")}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/50 text-muted hover:text-white shrink-0">
            <Icon name="monitor" size={17} />
          </button>
        )}
        <button onClick={close} aria-label={tr("Close")}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/50 text-white hover:border-rose-400/60 shrink-0">
          <Icon name="x" size={18} />
        </button>
      </div>

      {/* ===== Game stage ===== */}
      <div ref={areaRef} className="relative z-10 flex-1 min-h-0 flex items-center justify-center px-1 py-1">
        {sw > 0 && (
          <div className="relative" style={{ width: sw, height: sh }}>
            <ZoomPan className="h-full w-full" min={1} max={4} initial={1} wheel pan>
              {/* World art */}
              <div className="absolute inset-0" style={{ background: quest.mapArtUrl ? `url(${quest.mapArtUrl}) center/cover` : `linear-gradient(120deg, ${quest.color}22, ${quest.accent2}18), #0a0a1c` }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,5,26,0.12), rgba(4,5,26,0.4))" }} />

              {/* Trail */}
              {curveD && (
                <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d={curveD} fill="none" stroke={quest.accent2} strokeOpacity="0.22" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={curveD} fill="none" stroke={quest.color} strokeOpacity="0.65" strokeWidth="0.7" strokeDasharray="2 1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}

              {/* START marker */}
              {samples.length > 0 && (
                <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 border border-white/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-muted pointer-events-none"
                  style={{ left: `${samples[0].x}%`, top: `${samples[0].y}%` }}>
                  {tr("Start")}
                </span>
              )}

              {/* Milestone stops — tap to send your astronaut there */}
              {tiers.map((t, i) => (
                <button key={t.id} onClick={() => goTo(i)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group"
                  style={{ left: `${t.mapX}%`, top: `${t.mapY}%` }}>
                  {arrived === i && (
                    <span aria-hidden className="absolute inset-0 -m-2 rounded-full border-2 pointer-events-none"
                      style={{ borderColor: t.color || quest.color, animation: "qg-burst 1.4s ease-out forwards" }} />
                  )}
                  <span className="flex items-center justify-center rounded-full transition-transform group-hover:scale-110 group-active:scale-95"
                    style={{ width: sel === i ? 52 : 44, height: sel === i ? 52 : 44, background: t.earned ? `${(t.color || quest.color)}33` : "rgba(0,0,0,0.55)", border: `2px solid ${t.earned ? (t.color || quest.color) : "rgba(255,255,255,0.25)"}`, boxShadow: t.earned ? `0 0 20px -2px ${t.color || quest.color}` : "none" }}>
                    {t.iconUrl
                      ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.iconUrl} alt="" className="h-7 w-7 object-contain" style={{ filter: t.earned ? "none" : "grayscale(1)" }} />
                      : <Icon name={quest.icon} size={18} style={{ color: t.earned ? (t.color || quest.color) : "#8b8ba7" }} />}
                  </span>
                  <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={{ color: t.earned ? (t.color || quest.color) : "#cbd5e1" }}>{t.name}</span>
                </button>
              ))}

              {/* Your real CP position (home flag) while the astronaut scouts */}
              {awayFromHome && (
                <span className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `${home.x}%`, top: `${home.y}%` }}>
                  <span className="block h-3.5 w-3.5 rounded-full border-2 animate-ping" style={{ borderColor: quest.accent2 }} />
                </span>
              )}

              {/* Your astronaut — walks the trail (hops while travelling) */}
              <div className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none" style={{ left: `${you.x}%`, top: `${you.y}%` }}>
                {marker ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={marker} alt="" className={`h-12 w-12 sm:h-16 sm:w-16 object-contain drop-shadow-[0_0_12px_rgba(34,211,238,0.7)] ${walking ? "" : "float-y"}`}
                    style={walking ? { animation: "qg-hop 0.45s ease-in-out infinite" } : undefined} />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: quest.accent2, boxShadow: `0 0 16px 3px ${quest.accent2}` }}>
                    <Icon name="rocket" size={14} />
                  </span>
                )}
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-0.5 whitespace-nowrap rounded-full bg-black/75 px-1.5 py-0.5 text-[9px] font-bold" style={{ color: quest.accent2 }}>
                  {quest.qp.toLocaleString()} CP
                </span>
              </div>
            </ZoomPan>

            {/* Walk home — jump the astronaut back to your true CP position */}
            {awayFromHome && (
              <button onClick={() => { setSel(null); walkTo(youLen); }}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 backdrop-blur px-3.5 py-1.5 text-[11px] font-bold text-white">
                <Icon name="target" size={13} style={{ color: quest.accent2 }} /> {tr("Back to my position")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===== Milestone card (opens when the astronaut arrives) ===== */}
      {sel !== null && tiers[sel] && (
        <div className={sheet} style={{ background: defaultSheetBg }}>
          <div className="p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between">
              <div className="font-bold flex items-center gap-2" style={{ color: tiers[sel].color || quest.color }}>
                {tiers[sel].name}
                <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5" style={{ background: tiers[sel].earned ? "#10b98122" : "#ffffff10", color: tiers[sel].earned ? "#34d399" : "#94a3b8" }}>
                  {tiers[sel].earned ? `✓ ${tr("Unlocked")}` : tr("Locked")}
                </span>
              </div>
              <button onClick={() => setSel(null)} className="text-muted hover:text-ink p-1"><Icon name="x" size={15} /></button>
            </div>
            <div className="text-xs text-muted mt-1.5">{tiers[sel].description || `${tr("Reach")} ${tiers[sel].thresholdQp.toLocaleString()} CP.`}</div>
            <div className="mt-2 text-xs flex items-center gap-3">
              <span className="inline-flex items-center gap-1 font-bold" style={{ color: quest.accent2 }}><CpIcon size={13} /> {tiers[sel].thresholdQp.toLocaleString()} CP</span>
              {!tiers[sel].earned && <span className="text-amber-300 font-semibold">{(tiers[sel].thresholdQp - quest.qp).toLocaleString()} {tr("CP to go")}</span>}
              <span className="text-muted">{tiers[sel].holders.toLocaleString()} {tr("reached this step")}</span>
            </div>
            {(holders[tiers[sel].id]?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {holders[tiers[sel].id].slice(0, 8).map((g) => (
                  <span key={g.slug} className="flex items-center gap-1.5 rounded-full bg-white/5 pl-1 pr-2 py-0.5 text-[11px]">
                    <Avatar name={g.name} src={g.avatarUrl} size={18} /> <span className="truncate max-w-[90px]">{g.name}</span>
                  </span>
                ))}
              </div>
            )}
            {!tiers[sel].earned && (
              <button onClick={() => { setSel(null); setPanel("rules"); }}
                className="mt-3 w-full pressable rounded-full px-4 py-2 text-sm font-bold text-white"
                style={{ background: `linear-gradient(90deg, ${quest.color}, ${quest.accent2})`, boxShadow: `0 8px 22px -10px ${quest.color}` }}>
                {tr("How do I earn CP?")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== Rules / Log / Missions / Guide panels (admin-editable art) ===== */}
      {panel === "rules" && (
        <div className={sheet} style={panelBg("rules")}>
          <div className="p-4 space-y-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Icon name="zap" size={16} style={{ color: quest.color }} /> {tr("Game rules — how you earn CP")}</h3>
              <button onClick={() => setPanel(null)} className="text-muted hover:text-ink p-1"><Icon name="x" size={15} /></button>
            </div>
            <p className="text-xs text-muted leading-relaxed">{quest.lore || quest.tagline}</p>
            <div className="space-y-1.5">
              {rules.map((r) => (
                <div key={r.key} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                  <Icon name="zap" size={14} className="shrink-0" style={{ color: quest.accent2 }} />
                  <span className="text-sm flex-1 min-w-0 truncate">{tr(r.label)}</span>
                  {r.cap ? <span className="text-[10px] text-muted whitespace-nowrap">{tr("max")} {r.cap}/{tr("day")}</span> : null}
                  <span className="inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap" style={{ color: quest.color }}>+{r.points} <CpIcon size={13} /></span>
                </div>
              ))}
              {rules.length === 0 && <div className="text-xs text-muted">{tr("This quest has no scoring actions configured yet.")}</div>}
            </div>
            <div className="pt-1">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">{tr("Milestones")}</div>
              <div className="flex flex-wrap gap-1.5">
                {tiers.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{ borderColor: t.earned ? `${t.color || quest.color}88` : "rgba(255,255,255,0.12)", color: t.earned ? (t.color || quest.color) : "#8b8ba7" }}>
                    {t.earned ? "✓" : "○"} {t.name} · {t.thresholdQp.toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {panel === "log" && (
        <div className={sheet} style={panelBg("log")}>
          <div className="p-4 space-y-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Icon name="clock" size={16} style={{ color: quest.color }} /> {tr("My quest history")}</h3>
              <button onClick={() => setPanel(null)} className="text-muted hover:text-ink p-1"><Icon name="x" size={15} /></button>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: quest.accent2 }}><CpIcon size={15} /> {quest.qp.toLocaleString()} {tr("this cycle")}</span>
              <span className="text-muted">{quest.totalCp.toLocaleString()} {tr("lifetime in this quest")}</span>
            </div>
            {groups.length === 0 ? (
              <div className="text-xs text-muted">{tr("No CP earned here yet — open the Rules screen and make your first move.")}</div>
            ) : groups.map((g) => (
              <div key={g.key} className="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
                <button onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !o[g.key] }))}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left">
                  <Icon name="zap" size={13} className="shrink-0" style={{ color: quest.accent2 }} />
                  <span className="text-sm font-semibold flex-1 min-w-0 truncate">{tr(g.label)}</span>
                  <span className="text-[10px] text-muted">×{g.entries.length}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: quest.color }}>+{g.total.toLocaleString()} <CpIcon size={13} /></span>
                  <Icon name={openGroups[g.key] ? "arrowUp" : "chevronDown"} size={13} className="text-muted shrink-0" />
                </button>
                {openGroups[g.key] && (
                  <div className="border-t border-white/10 divide-y divide-white/5">
                    {g.entries.map((e) => (
                      <div key={e.id} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                        <span className="text-muted">{fmt(e.at)}</span>
                        <span className="font-bold" style={{ color: quest.accent2 }}>+{e.qp} CP</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {panel === "missions" && (
        <div className={sheet} style={panelBg("missions")}>
          <div className="p-4 space-y-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Icon name="rocket" size={16} style={{ color: quest.color }} /> {tr("Starter missions")}</h3>
              <button onClick={() => setPanel(null)} className="text-muted hover:text-ink p-1"><Icon name="x" size={15} /></button>
            </div>
            <p className="text-xs text-muted leading-relaxed">{tr("Your first moves in the Cluster — each one earns CP and lights up your trail. Finish all four to launch for real.")}</p>
            <div className="space-y-1.5">
              {missionList.map((m) => (
                <Link key={m.key} href={m.href} onClick={close}
                  className="relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors"
                  style={{ borderColor: m.at ? "#10b98155" : "rgba(255,255,255,0.14)", background: m.at ? "#10b9811a" : "rgba(0,0,0,0.4)" }}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: m.at ? "#10b98126" : `${quest.color}22` }}>
                    <Icon name={m.icon} size={16} style={{ color: m.at ? "#34d399" : quest.color }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{m.label}</span>
                    <span className="block text-[10px] text-muted">{m.at ? `✓ ${tr("Done")} · ${fmt(m.at)}` : tr("Tap to go do it now")}</span>
                  </span>
                  {m.at
                    ? <span className="text-emerald-300 font-black">✓</span>
                    : <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 animate-ping opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" /></span>}
                </Link>
              ))}
              {missionList.length === 0 && <div className="text-xs text-muted">{tr("Sign in to start your missions.")}</div>}
            </div>
          </div>
        </div>
      )}

      {panel === "guide" && (
        <div className={sheet} style={panelBg("guide")}>
          <div className="p-4 space-y-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Icon name="spark" size={16} style={{ color: quest.color }} /> {tr("How to play")}</h3>
              <button onClick={() => setPanel(null)} className="text-muted hover:text-ink p-1"><Icon name="x" size={15} /></button>
            </div>
            {[
              tr("Your astronaut stands at your real CP position on the trail. Tap any milestone to send it scouting."),
              tr("Earn CP by playing across the Cluster — the Rules screen lists every action and exactly how many points it grants."),
              tr("Pass a milestone's CP threshold to unlock its badge — it lights up on the map and on your profile."),
              tr("Finish the last milestone to complete the quest: you re-enroll from the start and your total CP keeps stacking forever."),
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black shrink-0 mt-0.5" style={{ background: `${quest.color}26`, color: quest.color }}>{i + 1}</span>
                <p className="text-sm text-muted leading-relaxed">{s}</p>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs text-muted pt-1">
              <CpIcon size={15} /> {tr("Total across all quests:")} <b className="text-ink">{totalCp.toLocaleString()} CP</b>
            </div>
          </div>
        </div>
      )}

      {/* ===== Bottom action bar — game cards with red attention dots ===== */}
      <div className="relative z-30 flex items-stretch gap-2 px-3 pt-2 sm:justify-center"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {tabBtn("missions", "rocket", tr("Missions"), missionsOpen > 0 ? missionsOpen : false)}
        {tabBtn("rules", "zap", tr("Rules"), rulesUnread)}
        {tabBtn("log", "clock", tr("My log"))}
        {tabBtn("guide", "spark", tr("Guide"))}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
