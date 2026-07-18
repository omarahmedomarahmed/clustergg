"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import CpIcon from "@/components/CpIcon";
import { markQuestsSeen } from "@/app/actions/social";
import type { NavQuest } from "@/lib/quests";

// One wide quest card in the nav (art background, name, CP, progress). A dropdown
// (the chevron) picks which quest is shown. The card body links to the quest map.
// A red dot flags quests where the gamer has earned new CP since they last looked.
export default function NavQuestCard({ quests, totalCp }: { quests: NavQuest[]; totalCp?: number }) {
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  if (quests.length === 0) return null;
  const q = quests[Math.min(idx, quests.length - 1)];
  const anyEarned = quests.some((x) => x.earned) && !seen;

  const openMenu = () => {
    setOpen((v) => !v);
    if (!seen) { setSeen(true); markQuestsSeen().catch(() => {}); }
  };

  return (
    <div className="relative flex-1 min-w-0 max-w-md flex items-center gap-2">
      <div className="relative flex-1 min-w-0">
      <div className="relative h-11 overflow-hidden rounded-xl border border-white/10 hover:border-cyan-400/40 transition-colors flex">
        {q.art ? (
          <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-45" style={{ backgroundImage: `url(${q.art})` }} />
        ) : (
          <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${q.color}44, ${q.accent2}33)` }} />
        )}
        <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,5,26,0.5), rgba(4,5,26,0.8))" }} />

        <Link href={`/quests/${q.key}`} className="relative flex-1 min-w-0 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-white/15" style={{ background: `${q.color}33` }}>
            {q.logoUrl
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-full w-full object-cover" />
              : <Icon name="spark" size={14} style={{ color: q.color }} />}
          </span>
          <span className="min-w-0 flex-1 flex flex-col justify-center leading-tight">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold truncate">{q.name}</span>
              <span className="text-[10px] font-semibold shrink-0" style={{ color: q.accent2 }}>{q.qp.toLocaleString()} CP</span>
            </span>
            <span className="mt-1 h-1 w-full rounded-full bg-white/10 overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${q.pct}%`, background: q.color }} />
            </span>
          </span>
        </Link>

        {quests.length > 1 && (
          <button type="button" onClick={openMenu} aria-label="Switch quest"
            className="relative flex w-9 shrink-0 items-center justify-center border-l border-white/10 text-white/70 hover:text-white">
            <Icon name={open ? "chevronDown" : "chevronRight"} size={16} />
            {anyEarned && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#04051a] animate-pulse" />}
          </button>
        )}
        {/* Red dot for new CP even in the single-quest layout */}
        {quests.length === 1 && anyEarned && <span className="absolute right-1.5 top-1.5 z-10 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#04051a] animate-pulse" />}
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
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 ring-white/10" style={{ background: `${qq.color}55` }}>
                  {qq.logoUrl
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={qq.logoUrl} alt="" className="h-full w-full object-cover" />
                    : <Icon name="spark" size={13} style={{ color: qq.color }} />}
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold truncate">{qq.name}
                    {qq.earned && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" title="New CP earned" />}
                  </span>
                  <span className="block text-[10px]" style={{ color: qq.accent2 }}>{qq.qp.toLocaleString()} CP · {qq.pct}%</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      </div>
      {totalCp !== undefined && (
        <Link href="/quests" title="Your total Cluster Points" className="hidden xl:inline-flex items-center gap-1 shrink-0 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] font-bold text-cyan-200 hover:border-cyan-400/40">
          <CpIcon size={15} /> {totalCp.toLocaleString()}
        </Link>
      )}
    </div>
  );
}
