"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import CpIcon from "@/components/CpIcon";

export type OrbQuest = {
  key: string; name: string; color: string; accent2: string; icon: string;
  qp: number; currentTierName: string | null; nextTierName: string | null; pct: number; logoUrl: string | null; art: string | null;
};

// The always-present, glorified Quest orb. Game-agnostic → shown on every page.
// Click toggles a popover of quest cards (each showing that quest's background
// art). The orb icon defaults to the CP coin and is admin-editable.
export default function FloatingQuestOrb({ quests, icon, color = "#8b5cf6" }: { quests: OrbQuest[]; icon?: string; color?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  if (quests.length === 0) return null;

  return (
    <div ref={wrap} className="fixed bottom-4 right-4 z-40 print:hidden">
      {open && (
        <div className="mb-3 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-violet-400/25 bg-[#0a0a1c]/95 backdrop-blur-xl p-3 shadow-2xl animate-[fadeIn_.15s_ease]">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-300 inline-flex items-center gap-1.5"><CpIcon size={14} /> Your Quests</span>
            <Link href="/quests" className="text-[11px] text-violet-300 hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {quests.map((q) => (
              <Link key={q.key} href={`/quests/${q.key}`} onClick={() => setOpen(false)}
                className="relative block overflow-hidden rounded-xl border border-white/10 p-2.5 hover:border-white/25 transition-colors">
                {/* Quest background art */}
                {q.art
                  ? <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${q.art})` }} />
                  : <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${q.color}22, transparent)` }} />}
                <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(4,5,26,0.82), rgba(4,5,26,0.6))" }} />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg shrink-0" style={{ background: `${q.color}22`, border: `1px solid ${q.color}55` }}>
                      {q.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-full w-full object-cover" /> : <Icon name={q.icon} size={14} style={{ color: q.color }} />}
                    </div>
                    <span className="text-sm font-semibold flex-1 truncate">{q.name}</span>
                    <span className="text-[10px] text-muted">{q.currentTierName ?? "—"}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${q.pct}%`, background: `linear-gradient(90deg, ${q.color}, ${q.accent2})` }} />
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted"><CpIcon size={11} /> {q.qp.toLocaleString()} CP{q.nextTierName ? ` · next: ${q.nextTierName}` : " · maxed"}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} aria-label="Quests"
        className="relative flex items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 overflow-hidden"
        style={{ height: 56, width: 56, background: `radial-gradient(circle at 35% 30%, ${color}, ${color}bb 60%, ${color}66)`, boxShadow: `0 0 24px -4px ${color}, inset 0 2px 6px rgba(255,255,255,0.25)` }}>
        <span className="absolute inset-0 rounded-full animate-ping opacity-25" style={{ background: color }} />
        {icon
          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={icon} alt="Quests" className="relative h-8 w-8 object-contain" />
          : <CpIcon size={30} />}
      </button>
    </div>
  );
}
