"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useTr } from "@/components/LocaleProvider";

// Today's mission and the streak, under the nav. B63.1 / B113.
//
// ===== WHY THIS IS THE FIRST TIME ANY OF IT IS VISIBLE =====
//
// `lib/missions.ts` shipped a complete system — templates, per-day tasks, a
// streak that loops, milestones that award trophies — with 89 green assertions
// and **not one importer**. No gamer had ever seen a daily mission, no streak
// had ever been counted, and no milestone trophy had ever been awarded.
//
// So this band is not decoration on top of a feature. It is the first surface
// the feature has ever had.
//
// ===== TWO STATES, LIKE THE BAND ABOVE IT =====
//
// Collapsed: the streak's day count and how much of today is done — a strip
// inside the sticky header, on every page.
//
// Expanded: today's tasks with their done state, and the milestone ladder with
// how far off the next one is. It drops OVER the page rather than pushing it
// down, for the same reason `WeekBand` does: expanding it from halfway through
// a page must not move the thing you were reading.
//
// **Click anywhere in the panel to close it** (B63.1), which is what people try
// first and what the week band already does.
//
// B63.2 asks for both bands to sit on the nav's own background art. The way
// that is achieved is the opposite of what it sounds like: the header group
// paints the image ONCE and this band stays transparent so that single layer
// shows through. See the note on `bandBg` below — painting a second copy is
// what makes the header stop reading as one surface.

export type MissionBandData = {
  streak: number;
  earned: number;
  ceiling: number;
  complete: boolean;
  tasks: { label: string; count: number; done: number; complete: boolean; cp: number }[];
  milestones: { days: number; hasTrophy: boolean }[];
  reached: number[];
  next: { days: number; away: number } | null;
};

const KEY = "cluster-mission-band";

export default function MissionBand({ data, bgUrl }: { data: MissionBandData; bgUrl: string }) {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // Collapsed by default, unlike the week band. A mission is a private nudge,
  // not a competition somebody needs to be shown — and a second panel opening
  // over every page on every visit is the thing that makes people collapse both.
  useEffect(() => {
    setOpen(localStorage.getItem(KEY) === "open");
    setReady(true);
  }, []);
  const toggle = () => {
    setOpen((v) => {
      localStorage.setItem(KEY, v ? "closed" : "open");
      return !v;
    });
  };

  const pct = data.ceiling > 0 ? Math.min(100, Math.round((data.earned / data.ceiling) * 100)) : 0;
  // B63.2, corrected. The band must NOT paint the nav art.
  //
  // It reads as one piece of chrome because the header group paints the image
  // ONCE and everything inside it — this band, the week band above it — stays
  // transparent and lets that single layer through. Painting a second copy is
  // what makes the header stop reading as one surface, and `tests/ui/week-band`
  // has guarded "exactly one element paints the nav art" since B10. My first
  // version of this component painted it directly and turned that guard red.
  //
  // So `bgUrl` is a FLAG, not a source: when the nav has art we stay see-through,
  // and when it does not we supply our own solid ground so the strip still has
  // one. Exactly what `WeekBand` does.
  const bandBg = bgUrl ? undefined : { background: "rgba(4,5,26,0.70)" };
  // The expanded panel drops below the header group, past the painted layer, so
  // it needs a ground of its own either way — a scrim, never the image.
  const panelBg = { background: bgUrl ? "rgba(4,5,26,0.90)" : "rgba(4,5,26,0.95)" };

  return (
    <>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full border-t border-white/5 px-4 py-1.5 text-left"
        style={bandBg}
      >
        <span className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Icon name="flame" size={13} className={data.streak > 0 ? "text-amber-300" : "text-muted"} />
            {data.streak > 0
              ? <>{data.streak} {tr(data.streak === 1 ? "day streak" : "day streak")}</>
              : tr("Start a streak today")}
          </span>
          <span className="inline-flex min-w-0 flex-1 items-center gap-2">
            <span className="h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full transition-[width]"
                style={{ width: `${pct}%`, background: data.complete ? "#34d399" : "#8b5cf6" }}
              />
            </span>
            <span className="shrink-0 text-muted">
              {data.complete
                ? tr("Today is done")
                : `${data.earned.toLocaleString()} / ${data.ceiling.toLocaleString()} CP`}
            </span>
          </span>
          {ready && (
            <span className="shrink-0 text-muted">
              <Icon name={open ? "chevronUp" : "chevronDown"} size={13} />
            </span>
          )}
        </span>
      </button>

      {open && (
        // Click ANYWHERE in here to close (B63.1). The links inside stop the
        // event, so tapping a task still navigates rather than only closing.
        <div onClick={toggle} className="cursor-pointer border-t border-white/5 px-4 py-4" style={panelBg}>
          <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
                {tr("Today's mission")}
              </h3>
              {data.tasks.length === 0 ? (
                <p className="text-sm text-muted">{tr("Nothing set for today — every point still counts.")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.tasks.map((t, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-black ${t.complete ? "bg-emerald-500 text-white" : "bg-white/10 text-muted"}`}>
                        {t.complete ? "✓" : ""}
                      </span>
                      <span className={t.complete ? "text-muted line-through" : ""}>{t.label}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">
                        {t.done}/{t.count} · +{t.cp} CP
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
                {tr("Streak milestones")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.milestones.map((m) => {
                  const done = data.reached.includes(m.days) || data.streak >= m.days;
                  return (
                    <span
                      key={m.days}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                        done ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200" : "border-white/15 text-muted"
                      }`}
                    >
                      {m.hasTrophy && <Icon name="trophy" size={11} />}
                      {m.days} {tr("days")}
                    </span>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-muted">
                {data.next
                  ? <>{tr("Next milestone in")} <b className="text-ink">{data.next.away}</b> {tr(data.next.away === 1 ? "day" : "days")}.</>
                  : tr("Every milestone reached this run.")}
              </p>
              {/* A milestone with no trophy attached is honest about it rather
                  than silently promising one. */}
              {data.milestones.length > 0 && data.milestones.every((m) => !m.hasTrophy) && (
                <p className="mt-1 text-xs text-muted">{tr("Trophies for these are being chosen.")}</p>
              )}
              <Link
                href="/quests"
                onClick={(e) => e.stopPropagation()}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:underline"
              >
                {tr("My quests")} <Icon name="arrowRight" size={12} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
