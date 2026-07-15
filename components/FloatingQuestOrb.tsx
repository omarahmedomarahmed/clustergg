"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

export type OrbQuest = {
  key: string; name: string; color: string; accent2: string; icon: string;
  qp: number; currentTierName: string | null; nextTierName: string | null; pct: number; logoUrl: string | null;
};

// The always-present, glorified Quest orb. Game-agnostic → shown on every page
// (feed, planets, profiles). Hover/tap reveals live progress across all quests.
export default function FloatingQuestOrb({ quests }: { quests: OrbQuest[] }) {
  const [open, setOpen] = useState(false);
  if (quests.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {open && (
        <div className="mb-3 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border border-violet-400/25 bg-[#0a0a1c]/95 backdrop-blur-xl p-3 shadow-2xl animate-[fadeIn_.15s_ease]">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-300">Your Quests</span>
            <Link href="/quests" className="text-[11px] text-violet-300 hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {quests.map((q) => (
              <Link key={q.key} href="/quests" className="block rounded-xl border border-white/10 p-2.5 hover:border-white/25 transition-colors"
                style={{ background: `linear-gradient(90deg, ${q.color}14, transparent)` }}>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: `${q.color}22`, border: `1px solid ${q.color}55` }}>
                    {q.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-5 w-5 object-contain" /> : <Icon name={q.icon} size={14} style={{ color: q.color }} />}
                  </div>
                  <span className="text-sm font-semibold flex-1 truncate">{q.name}</span>
                  <span className="text-[10px] text-muted">{q.currentTierName ?? "—"}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${q.pct}%`, background: `linear-gradient(90deg, ${q.color}, ${q.accent2})` }} />
                </div>
                <div className="mt-1 text-[10px] text-muted">{q.qp.toLocaleString()} QP{q.nextTierName ? ` · next: ${q.nextTierName}` : " · maxed"}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} aria-label="Quests"
        className="relative flex items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95"
        style={{ height: 56, width: 56, background: "radial-gradient(circle at 35% 30%, #a78bfa, #6d28d9 60%, #3b0764)", boxShadow: "0 0 24px -4px #8b5cf6, inset 0 2px 6px rgba(255,255,255,0.25)" }}>
        <span className="absolute inset-0 rounded-full animate-ping opacity-25" style={{ background: "#8b5cf6" }} />
        <Icon name="trophy" size={24} />
      </button>
    </div>
  );
}
