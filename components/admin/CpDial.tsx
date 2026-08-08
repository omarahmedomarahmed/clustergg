"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { applyCpDial, type DialState } from "@/app/actions/cp-dial";

// The dial itself.
//
// Type a ceiling, read what it does, then apply it. The preview is computed on
// the SERVER and passed in per-target rather than recomputed here, because the
// arithmetic that decides what a gamer earns must not exist in two languages —
// a client-side copy that drifts is a screen that lies about what a button will
// do.
//
// So the preview is a lookup, not a calculation: the page precomputes a plan
// for each preset and for the current value, and anything typed outside that
// set says plainly that it will be computed on apply. Honest and boring beats
// a number that might be wrong.

export type PlanPreview = {
  ceiling: number;
  scale: number;
  changed: number;
  missionTotal: number;
  note: string;
  runwayDays: number | null;
};

export default function CpDial({ current, presets, canEdit, dailyActive }: {
  current: number;
  /** Precomputed plans, keyed by ceiling. Always contains `current`. */
  presets: PlanPreview[];
  canEdit: boolean;
  /** Measured, not projected. Null when nobody has earned anything yet. */
  dailyActive: number | null;
}) {
  const [state, act, busy] = useActionState<DialState, FormData>(applyCpDial, undefined);
  const [target, setTarget] = useState(String(current));

  const n = Number(target);
  const preview = presets.find((p) => p.ceiling === n) ?? null;

  return (
    <form action={act} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">
          <span className="mb-1 block">Ceiling — CP per gamer per day</span>
          <input
            name="ceiling"
            type="number"
            min={0}
            step={10}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={!canEdit}
            className="input-cosmic w-40 tabular-nums"
          />
        </label>
        <div className="flex flex-wrap gap-1.5 pb-1">
          {presets.map((p) => (
            <button
              key={p.ceiling}
              type="button"
              onClick={() => setTarget(String(p.ceiling))}
              disabled={!canEdit}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                n === p.ceiling
                  ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40"
                  : "border border-white/12 text-muted hover:text-ink"
              }`}
            >
              {p.ceiling === 0 ? "Stop (0)" : p.ceiling.toLocaleString()}
              {p.ceiling === current && <span className="ml-1 text-[10px] opacity-70">now</span>}
            </button>
          ))}
        </div>
      </div>

      {/* What this ceiling does, before it does it. */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
        {preview ? (
          <>
            <p className="leading-relaxed">{preview.note}</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
              <span>
                A day&apos;s mission would be worth{" "}
                <b className="text-ink tabular-nums">{preview.missionTotal.toLocaleString()} CP</b>
              </span>
              <span>
                {preview.changed} action{preview.changed === 1 ? "" : "s"} rescaled ×{preview.scale.toFixed(2)}
              </span>
              <span>
                {preview.runwayDays === null
                  // Never a comfortable number for an unmeasured population.
                  ? "Runway: nobody has earned CP yet, so there is nothing to divide by."
                  : <>Vault runway: <b className="text-ink tabular-nums">{preview.runwayDays.toLocaleString()} days</b>
                    {dailyActive !== null && <> at {dailyActive.toLocaleString()} active gamers/day</>}</>}
              </span>
            </div>
          </>
        ) : (
          <p className="text-muted">
            No preview for {Number.isFinite(n) ? n.toLocaleString() : "that"} — the plan is computed on the
            server when you apply it, from the weights the quests are actually running. Pick a preset to see
            one first.
          </p>
        )}
      </div>

      <label className="block text-xs text-muted">
        <span className="mb-1 block">Why</span>
        <input
          name="reason"
          required
          disabled={!canEdit}
          placeholder="e.g. vault down to six weeks — pulling the ceiling back until the next challenge lands"
          className="input-cosmic w-full"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={!canEdit || busy}
          className="money-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Applying…" : "Apply this ceiling"}
        </button>
        <span className="text-xs text-muted">
          Nothing already credited moves. This is what tomorrow pays.
        </span>
      </div>

      {!canEdit && (
        <p className="text-xs text-amber-200">
          Reading what CP costs belongs to whoever runs quests. Moving the ceiling is a super admin.
        </p>
      )}
      {state?.error && (
        <p className="flex items-center gap-1.5 text-sm text-rose-300">
          <Icon name="alert" size={14} /> {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-300">
          <Icon name="check" size={14} /> {state.message}
        </p>
      )}
    </form>
  );
}
