"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import SubmitButton from "@/components/SubmitButton";
import { saveMilestones, type MilestoneState } from "@/app/actions/milestones";

export type TrophyOption = { id: string; name: string; tier: string; value: number };
export type MilestoneRow = { days: number; trophyId: string | null };

// The streak ladder, and what each rung pays.
//
// A gamer who hits the daily ceiling on consecutive days is on a streak, and the
// band under the nav shows them the rungs they are climbing toward. Until this
// screen existed nothing could attach a prize to one, so the band told everybody
// "Trophies for these are being chosen" and meant it indefinitely.
//
// ===== A RUNG WITH NO TROPHY IS ALLOWED, AND SAID SO =====
//
// It is not a half-configured state to be nagged about: a visible rung with no
// prize still marks the run and still gives the streak a shape. What would be
// wrong is letting it look like a prize. So each row says which it is, in
// words, next to the picker rather than in a legend somewhere else.

export default function MilestonesPanel({
  initial, trophies, isDefault,
}: {
  initial: MilestoneRow[];
  trophies: TrophyOption[];
  isDefault: boolean;
}) {
  const [state, action] = useActionState<MilestoneState, FormData>(saveMilestones, {});
  const [rows, setRows] = useState<MilestoneRow[]>(
    initial.length ? initial : [{ days: 3, trophyId: null }],
  );

  const setDays = (i: number, v: string) =>
    setRows((r) => r.map((m, j) => (j === i ? { ...m, days: Number(v) } : m)));
  const setTrophy = (i: number, v: string) =>
    setRows((r) => r.map((m, j) => (j === i ? { ...m, trophyId: v || null } : m)));
  const remove = (i: number) => setRows((r) => r.filter((_, j) => j !== i));
  const add = () =>
    setRows((r) => [...r, { days: (r[r.length - 1]?.days ?? 0) + 7, trophyId: null }]);

  const money = (n: number) => `$${n.toLocaleString("en-US")}`;
  const withTrophy = rows.filter((r) => r.trophyId).length;

  return (
    <form action={action} className="glass p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-bold">Streak milestones</h2>
        <span className="text-xs text-muted">
          {rows.length} rung{rows.length === 1 ? "" : "s"} · {withTrophy} paying a trophy
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        A gamer who earns the full daily ceiling on consecutive days is on a streak. These are the rungs
        they climb toward, shown in the band under the nav on every page. The nightly job awards a rung
        the first time a run reaches it — once per run, never twice.
      </p>

      {isDefault && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-white/12 bg-black/25 p-3 text-xs leading-relaxed text-muted">
          <Icon name="spark" size={13} className="mt-0.5 shrink-0 text-violet-300" />
          <span>
            Nobody has set these yet, so the shipped default is showing. Saving makes them yours —
            including saving an empty list, which switches milestones off entirely.
          </span>
        </p>
      )}

      <div className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              Day
              <input
                name={`days:${i}`} type="number" min={1} max={365}
                value={Number.isFinite(r.days) ? r.days : ""}
                onChange={(e) => setDays(i, e.target.value)}
                className="input-cosmic w-20 py-1.5 text-sm"
              />
            </label>

            <select
              name={`trophy:${i}`} value={r.trophyId ?? ""}
              onChange={(e) => setTrophy(i, e.target.value)}
              className="input-cosmic min-w-[220px] flex-1 py-1.5 text-sm"
            >
              <option value="">No trophy — the rung shows, and pays nothing</option>
              {trophies.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.tier}{t.value > 0 ? ` · ${money(t.value)}` : ""}
                </option>
              ))}
            </select>

            {/* Which it is, in words, on the row itself. A gamer is told the
                difference on the band; an operator should be told it here. */}
            <span className={`text-[11px] ${r.trophyId ? "text-emerald-300" : "text-muted"}`}>
              {r.trophyId ? "pays out" : "marker only"}
            </span>

            <button
              type="button" onClick={() => remove(i)}
              className="ml-auto text-xs text-rose-300 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} className="ghost-btn pressable rounded-full px-4 py-2 text-sm">
          Add a rung
        </button>
        <SubmitButton pendingText="Saving…" className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">
          Save milestones
        </SubmitButton>
        {state?.ok && <span className="text-xs text-emerald-300">{state.ok}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>

      {trophies.length === 0 && (
        <p className="mt-3 text-xs text-amber-200">
          There are no trophies to attach yet. Create one on the Trophies desk and it appears here.
        </p>
      )}
    </form>
  );
}
