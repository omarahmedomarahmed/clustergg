"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import type { NavQuest } from "@/lib/quests";

// One wide quest card in the nav (art background, name, CP, progress). A dropdown
// (the chevron) picks which quest is shown. The card body links to the quest map.
export default function NavQuestCard({ quests }: { quests: NavQuest[] }) {
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  if (quests.length === 0) return null;
  const q = quests[Math.min(idx, quests.length - 1)];

  return (
    <div className="relative flex-1 min-w-0 max-w-md">
      <div className="relative h-11 overflow-hidden rounded-xl border border-white/10 hover:border-cyan-400/40 transition-colors flex">
        {q.art ? (
          <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-45" style={{ backgroundImage: `url(${q.art})` }} />
        ) : (
          <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${q.color}44, ${q.accent2}33)` }} />
        )}
        <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,5,26,0.5), rgba(4,5,26,0.8))" }} />

        <Link href={`/quests/${q.key}`} className="relative flex-1 min-w-0 flex flex-col justify-center px-3 leading-tight">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold truncate">{q.name}</span>
            <span className="text-[10px] font-semibold shrink-0" style={{ color: q.accent2 }}>{q.qp.toLocaleString()} CP</span>
          </span>
          <span className="mt-1 h-1 w-full rounded-full bg-white/10 overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${q.pct}%`, background: q.color }} />
          </span>
        </Link>

        {quests.length > 1 && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Switch quest"
            className="relative flex w-9 shrink-0 items-center justify-center border-l border-white/10 text-white/70 hover:text-white">
            <Icon name={open ? "chevronDown" : "chevronRight"} size={16} />
          </button>
        )}
      </div>

      {open && quests.length > 1 && (
        <>
          <button aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-white/10 bg-[#0a0a1c]/95 backdrop-blur-xl p-1.5 shadow-2xl">
            {quests.map((qq, i) => (
              <button key={qq.key} type="button" onClick={() => { setIdx(i); setOpen(false); }}
                className={`relative flex w-full items-center gap-2 overflow-hidden rounded-lg px-2 py-2 text-left ${i === idx ? "ring-1 ring-cyan-400/40" : "hover:bg-white/5"}`}>
                {qq.art && <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${qq.art})` }} />}
                <span aria-hidden className="absolute inset-0" style={{ background: "rgba(4,5,26,0.7)" }} />
                <span className="relative h-6 w-6 shrink-0 rounded-md" style={{ background: `${qq.color}55` }} />
                <span className="relative min-w-0 flex-1">
                  <span className="block text-xs font-bold truncate">{qq.name}</span>
                  <span className="block text-[10px]" style={{ color: qq.accent2 }}>{qq.qp.toLocaleString()} CP · {qq.pct}%</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
