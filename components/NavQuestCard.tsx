"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import CpIcon from "@/components/CpIcon";
import { markQuestsSeen } from "@/app/actions/social";
import type { NavQuest } from "@/lib/quests";

// The quest bar in the nav.
//
// One bordered bar holding three things, left to right: the current quest (its
// card art and name), the gamer's TOTAL Cluster Points, and the chevron that
// opens the quest list. The CP coins used to sit OUTSIDE the bar as a detached
// chip that disappeared below xl — which is what made the nav look broken.
// They belong inside, next to the dropdown.
//
// One number, not three. The bar previously carried the current quest's own CP
// and a progress bar as well, which meant three competing figures in a 44px
// strip — and the total is the only one anybody reads in passing.
//
// Everything here navigates. The bar opens the current quest's map; every row
// in the dropdown opens that quest's map (it also switches the bar, so the nav
// still reflects where you went); the coins open the quest index. A menu whose
// items only change a label is a dead end, and this is the most-used control
// on the site.
//
// The thumbnails show quest CARD ART, not the quest logo — the art is what the
// quest looks like everywhere else on the site, so it's what makes a row
// recognisable at 28px.
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
    <div className="relative flex-1 min-w-0 max-w-xl">
      <div className="relative h-11 overflow-hidden rounded-xl border border-white/10 hover:border-cyan-400/40 transition-colors flex">
        {q.art ? (
          <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-45" style={{ backgroundImage: `url(${q.art})` }} />
        ) : (
          <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${q.color}44, ${q.accent2}33)` }} />
        )}
        <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,5,26,0.5), rgba(4,5,26,0.8))" }} />

        {/* The art and the name, and nothing else. The per-quest CP and its
            progress bar used to live here too — three numbers competing in a
            44px bar, one of which (the total) is the only one anybody reads at
            a glance. The detail is one tap away on the quest page. */}
        <Link href={`/quests/${q.key}`} className="relative flex min-w-0 flex-1 items-center gap-2 px-2">
          <Art art={q.art} color={q.color} size="h-8 w-8" />
          <span className="truncate text-[12px] font-bold">{q.name}</span>
        </Link>

        {/* Total Cluster Points — inside the bar, immediately left of the
            dropdown, so the two controls read as one unit. */}
        {totalCp !== undefined && (
          <Link
            href="/quests"
            title="Your total Cluster Points"
            className="relative flex shrink-0 items-center gap-1 border-l border-white/10 px-2.5 text-[11px] font-bold text-cyan-200 hover:bg-white/5"
          >
            <CpIcon size={15} /> {totalCp.toLocaleString()}
          </Link>
        )}

        {quests.length > 1 && (
          <button type="button" onClick={openMenu} aria-label="All quests" aria-expanded={open}
            className="relative flex w-9 shrink-0 items-center justify-center border-l border-white/10 text-white/70 hover:text-white hover:bg-white/5">
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
          <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-white/10 bg-[#0a0a1c]/95 backdrop-blur-xl p-1.5 shadow-2xl">
            {quests.map((qq, i) => (
              <Link
                key={qq.key}
                href={`/quests/${qq.key}`}
                onClick={() => { setIdx(i); setOpen(false); }}
                className={`relative flex w-full items-center gap-2 overflow-hidden rounded-lg px-2 py-2 text-left ${i === idx ? "ring-1 ring-cyan-400/40" : "hover:bg-white/5"}`}
              >
                {qq.art && <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${qq.art})` }} />}
                <span aria-hidden className="absolute inset-0" style={{ background: "rgba(4,5,26,0.7)" }} />
                <Art art={qq.art} color={qq.color} size="h-7 w-7" />
                <span className="relative min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold truncate">{qq.name}
                    {qq.earned && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" title="New CP earned" />}
                  </span>
                  <span className="block text-[10px] text-muted">Open the quest map</span>
                </span>
                <Icon name="chevronRight" size={13} className="relative shrink-0 text-white/40" />
              </Link>
            ))}
            <Link
              href="/quests"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center justify-between rounded-lg px-2 py-2 text-xs font-semibold text-cyan-300 hover:bg-white/5"
            >
              All quests {totalCp !== undefined && <span className="inline-flex items-center gap-1"><CpIcon size={14} /> {totalCp.toLocaleString()}</span>}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Art({ art, color, size }: { art: string | null; color: string; size: string }) {
  return (
    <span className={`relative ${size} shrink-0 overflow-hidden rounded-lg ring-1 ring-white/15`} style={{ background: `${color}33` }}>
      {art
        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={art} alt="" className="h-full w-full object-cover" />
        : <span className="flex h-full w-full items-center justify-center"><Icon name="spark" size={14} style={{ color }} /></span>}
    </span>
  );
}
