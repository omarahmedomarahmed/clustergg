"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import CpIcon from "@/components/CpIcon";
import { markQuestsSeen } from "@/app/actions/social";
import type { NavQuest } from "@/lib/quests";
import Img from "@/components/Img";
import { optImg } from "@/lib/img";

// The quest control in the nav.
//
// Two things, and nothing else: the current quest's ART, and the gamer's TOTAL
// Cluster Points. The quest NAME is gone — it was the widest element in the nav
// and it said the least, because the art already identifies the quest
// everywhere else on the site.
//
// The icon IS the dropdown. There used to be a separate chevron for that, which
// meant the obvious thing to click (the picture) did something different from
// the small thing next to it. Now tapping the art opens the quest list, and
// every row in that list opens that quest's map — so the picker and the
// navigation are the same control rather than two that disagree.
//
// The thumbnails show quest CARD ART, not the quest logo — the art is what the
// quest looks like everywhere else, so it's what makes a row recognisable at
// 28px.
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
    <div className="relative shrink-0">
      <div className="relative flex h-11 items-stretch overflow-hidden rounded-xl border border-white/10 transition-colors hover:border-cyan-400/40">
        {/* The art, and it opens the picker. */}
        <button
          type="button"
          onClick={openMenu}
          aria-label={`Quest: ${q.name}. Choose a quest`}
          aria-expanded={open}
          title={q.name}
          className="relative flex shrink-0 items-center gap-1 px-2 hover:bg-white/5"
        >
          <Art art={q.art} color={q.color} size="h-8 w-8" />
          <Icon name={open ? "chevronDown" : "chevronRight"} size={13} className="text-white/60" />
          {anyEarned && <span className="absolute left-1.5 top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#04051a] animate-pulse" />}
        </button>

        {/* Total Cluster Points — the one number worth carrying in the nav. */}
        {totalCp !== undefined && (
          <Link
            href="/quests"
            title="Your total Cluster Points"
            className="relative flex shrink-0 items-center gap-1 border-l border-white/10 px-2.5 text-[11px] font-bold text-cyan-200 hover:bg-white/5"
          >
            <CpIcon size={15} /> {totalCp.toLocaleString()}
          </Link>
        )}
      </div>

      {open && (
        <>
          <button aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-white/10 bg-[#0a0a1c]/95 backdrop-blur-xl p-1.5 shadow-2xl">
            {quests.map((qq, i) => (
              <Link
                key={qq.key}
                href={`/quests/${qq.key}`}
                onClick={() => { setIdx(i); setOpen(false); }}
                className={`relative flex w-full items-center gap-2 overflow-hidden rounded-lg px-2 py-2 text-left ${i === idx ? "ring-1 ring-cyan-400/40" : "hover:bg-white/5"}`}
              >
                {qq.art && <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${optImg(qq.art, 256)})` }} />}
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
        // Optimized at thumbnail size: quest card art is full-bleed artwork,
        // and this draws it at 32px on every page of the site.
        ? <Img src={art} width={96} className="h-full w-full object-cover" />
        : <span className="flex h-full w-full items-center justify-center"><Icon name="spark" size={14} style={{ color }} /></span>}
    </span>
  );
}
