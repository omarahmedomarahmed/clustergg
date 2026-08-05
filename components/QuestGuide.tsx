"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import CpIcon from "@/components/CpIcon";
import type { QuestRule } from "@/lib/quest-game";
import type { CapsToday } from "@/lib/quests";

// How to play, rather than a schedule of rates (B50).
//
// The action list already existed — inside the quest game's rules panel, as a
// flat table of "action · max N/day · +50". A table answers "what are the
// rates". A gamer opening this page is asking a different question: **what
// should I do, and is any of this worth my time.**
//
// So three things are different here.
//
//   1. **The caps are the pitch, not the small print.** "Free points" is a
//      claim nobody believes. "Free points, capped, and here is the cap" is one
//      they can check. Every row shows its ceiling, and the quest shows what a
//      full day is worth in dollars at the platform rate — because since B34
//      that is a real number and hiding it would be the only dishonest choice.
//   2. **Today's progress sits on the row it belongs to**, read from B17's
//      `capsToday`. "Why did that give me nothing?" is answered on the action
//      that stopped paying, not in a separate panel somebody has to find.
//   3. **Nothing here is restated.** Every figure comes from `getUserQuests`
//      and `capsToday`. A second copy of a number the CP calculator can move is
//      a number that is wrong the first time somebody moves it.
//
// An action with NO cap is shown as uncapped rather than given an invented
// ceiling. B34 means there should be none; if one appears, this says so instead
// of hiding it.

const num = (n: number) => n.toLocaleString();

export type GuideQuest = {
  id: string;
  key: string;
  name: string;
  color: string;
  accent2: string;
  logoUrl: string | null;
  rules: QuestRule[];
};

export default function QuestGuide({
  quests, caps, cpPerDollar, signedIn, defaultOpen,
}: {
  quests: GuideQuest[];
  /** B17's live figures. Null when signed out — the guide still reads. */
  caps: CapsToday | null;
  cpPerDollar: number;
  signedIn: boolean;
  /** Open this quest's list on first paint (the single-quest page passes its own). */
  defaultOpen?: string;
}) {
  const [open, setOpen] = useState<string | null>(defaultOpen ?? quests[0]?.key ?? null);
  const usedByKey = new Map((caps?.actions ?? []).map((a) => [a.key, a]));

  if (!quests.length) return null;

  return (
    <section className="glass p-5 md:p-6" data-quest-guide>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Icon name="zap" size={18} className="text-cyan-300" /> How to earn
        </h2>
        {caps && (
          <span className="text-[11px] text-muted">
            {num(caps.earned)} of {num(caps.ceiling)} earned today
          </span>
        )}
      </div>
      <p className="mb-4 max-w-2xl text-xs text-muted">
        Every way there is to earn on Cluster, what each one pays, and how often it pays.
        Everything is capped — that is what makes it worth checking.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {quests.map((q) => (
          <button key={q.key} type="button" data-guide-tab={q.key}
            onClick={() => setOpen(open === q.key ? null : q.key)}
            aria-expanded={open === q.key}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
              open === q.key ? "text-ink" : "border-white/12 text-muted hover:text-ink"}`}
            style={open === q.key ? { borderColor: `${q.color}88`, background: `${q.color}1f` } : undefined}>
            {q.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={q.logoUrl} alt="" className="h-4 w-4 object-contain" />
              : <Icon name="spark" size={11} />}
            {q.name}
            <span className="opacity-60">{q.rules.length}</span>
          </button>
        ))}
      </div>

      {quests.filter((q) => q.key === open).map((q) => {
        // Only capped actions can be totalled — an uncapped one has no maximum,
        // so it is left out of the sum rather than guessed at.
        const dailyMax = q.rules.reduce((s, r) => s + (r.cap ? r.points * r.cap : 0), 0);
        const dailyUsd = cpPerDollar > 0 ? dailyMax / cpPerDollar : 0;
        const uncapped = q.rules.filter((r) => !r.cap);

        return (
          <div key={q.key} className="mt-4" data-guide-panel={q.key}>
            <div className="space-y-1.5">
              {q.rules.map((r) => {
                const live = usedByKey.get(r.key);
                const pct = live && live.cap > 0 ? Math.min(100, (live.used / live.cap) * 100) : 0;
                return (
                  <div key={r.key} data-guide-action={r.key}
                    className={`rounded-xl border px-3 py-2 ${live?.maxed ? "border-amber-400/35 bg-amber-500/[0.06]" : "border-white/10"}`}>
                    <div className="flex items-center gap-2.5">
                      <Icon name="zap" size={13} className="shrink-0" style={{ color: q.accent2 }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.label}</span>
                      <span className="shrink-0 text-[10px] text-muted" data-guide-cap>
                        {r.cap ? <>max {num(r.cap)}/day</> : <span className="text-amber-300">uncapped</span>}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-black" data-guide-cp
                        style={{ color: q.color }}>
                        +{num(r.points)} <CpIcon size={12} />
                      </span>
                    </div>
                    {/* Today, on the row it belongs to. */}
                    {signedIn && live && live.cap > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: q.color }} />
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted">
                          {live.used}/{live.cap} today
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* What a full day on this quest is worth. The caps make it a real
                number rather than a promise. */}
            {dailyMax > 0 && (
              <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] px-3 py-2.5" data-guide-total>
                <div className="text-[10px] uppercase tracking-widest text-muted">Everything above, every day</div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                  <span className="inline-flex items-center gap-1 text-base font-black" style={{ color: q.color }}>
                    {num(dailyMax)} <CpIcon size={14} />
                  </span>
                  {dailyUsd > 0 && (
                    <span className="text-base font-black text-emerald-300">= ${dailyUsd.toFixed(2)}</span>
                  )}
                  <Link href="/marketplace" className="ml-auto text-[11px] font-semibold text-cyan-300 hover:underline">
                    What it buys <Icon name="chevronRight" size={10} className="inline" />
                  </Link>
                </div>
                {uncapped.length > 0 && (
                  // Said out loud rather than quietly excluded from the sum.
                  <div className="mt-1 text-[10px] text-amber-300">
                    {uncapped.length} {uncapped.length === 1 ? "action has" : "actions have"} no daily cap,
                    so {uncapped.length === 1 ? "it is" : "they are"} not counted in that total.
                  </div>
                )}
              </div>
            )}

            <Link href={`/quests/${q.key}`}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:underline">
              Open the {q.name} map <Icon name="arrowRight" size={11} />
            </Link>
          </div>
        );
      })}
    </section>
  );
}
