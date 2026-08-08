"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { saveSplit, type SplitState } from "@/app/actions/vaults";
import { VAULTS, splitProblems, type Vault } from "@/lib/vaults";

// The one switch an operator actually touches.
//
// A PRESET PICKER FIRST, and four number inputs behind a deliberate act. That
// ordering is the whole design: whoever runs this day to day should never have
// to do arithmetic to keep a money invariant true, and three named positions
// cover every change anybody has actually wanted to make.
//
// The hand-edit is not hidden — hiding it would mean somebody doing it in the
// database instead — it is just second, and it will not save unless the four
// shares total 100. `splitProblems` is the SAME function the server validates
// with, imported rather than reimplemented, so the form cannot disagree with
// the refusal.

const LABEL: Record<Vault, string> = {
  prize: "Prizes",
  cluster: "Cluster",
  server: "Servers",
  cp: "Gamer points",
};

export default function SplitEditor({ current, presets, canEdit }: {
  current: Record<Vault, number>;
  presets: Record<string, Record<Vault, number>>;
  canEdit: boolean;
}) {
  const [state, act, busy] = useActionState<SplitState, FormData>(saveSplit, undefined);
  const [draft, setDraft] = useState<Record<Vault, number>>(current);
  const [manual, setManual] = useState(false);

  const shown = state?.split ?? current;
  const problems = splitProblems(draft);
  const total = VAULTS.reduce((a, v) => a + (Number(draft[v]) || 0), 0);
  const matches = (p: Record<Vault, number>) => VAULTS.every((v) => p[v] === shown[v]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {Object.entries(presets).map(([key, p]) => (
          <form key={key} action={act}>
            <input type="hidden" name="preset" value={key} />
            <button
              disabled={!canEdit || busy}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                matches(p)
                  ? "border-emerald-400/50 bg-emerald-500/15"
                  : "border-white/12 bg-white/5 hover:border-white/25"
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-black capitalize">
                {matches(p) && <Icon name="check" size={12} className="text-emerald-300" />}
                {key.replace("-", " ")}
              </span>
              <span className="mt-1 block text-[11px] tabular-nums text-muted">
                {VAULTS.map((v) => `${LABEL[v]} ${p[v]}`).join(" · ")}
              </span>
            </button>
          </form>
        ))}
      </div>

      {!manual ? (
        <button
          type="button"
          onClick={() => { setDraft(shown); setManual(true); }}
          disabled={!canEdit}
          className="text-xs text-muted underline decoration-dotted hover:text-ink disabled:opacity-50"
        >
          Set the four shares by hand instead
        </button>
      ) : (
        <form action={act} className="rounded-2xl border border-rose-400/30 bg-rose-500/[0.05] p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-black text-rose-200">
            <Icon name="alert" size={14} /> Editing the split by hand
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-rose-100/80">
            This changes what every future sale divides into. It does not move money that has already
            arrived — use a transfer for that. A reason is required and is written to the audit log.
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            {VAULTS.map((v) => (
              <label key={v} className="block text-xs">
                <span className="mb-1 block text-muted">{LABEL[v]}</span>
                <input
                  name={v}
                  type="number"
                  min={0}
                  max={100}
                  value={draft[v]}
                  onChange={(e) => setDraft((d) => ({ ...d, [v]: Number(e.target.value) }))}
                  className="input-cosmic w-full tabular-nums"
                />
              </label>
            ))}
          </div>
          <input
            name="reason"
            placeholder="Why — e.g. 'board approved a higher server share for Q4'"
            className="input-cosmic mt-2 w-full text-xs"
            required
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className={`text-xs font-bold tabular-nums ${total === 100 ? "text-emerald-300" : "text-rose-300"}`}>
              {total}% of 100
            </span>
            <button
              disabled={busy || problems.length > 0}
              className="pressable rounded-full bg-rose-500/25 px-4 py-2 text-xs font-bold text-rose-100 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save this split"}
            </button>
            <button
              type="button"
              onClick={() => setManual(false)}
              className="text-xs text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
          {/* The same function the server refuses with. Two implementations of
              "does this total 100" is two answers, and the one on the screen
              would be the one nobody could trust. */}
          {problems.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-rose-200">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </form>
      )}

      {state?.error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Saved. Every sale from now on divides this way; nothing already in a vault moved.
        </p>
      )}
    </div>
  );
}
