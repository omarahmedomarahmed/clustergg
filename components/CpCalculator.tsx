"use client";

import { useActionState, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Cp from "@/components/Cp";
import { saveCpConfig, type SaveState } from "@/app/actions/cp-calculator";
import {
  maxDailyCp, maxDailyCost, expectedDailyCost, exposure, abuseSurface, minutesPerDollar,
  DEFAULT_ASSUMPTIONS, type ActionConfig, type EconConfig,
} from "@/lib/cp-economics";

const POPULATIONS = [1_000, 10_000, 100_000, 1_000_000];

const usd = (n: number) =>
  !Number.isFinite(n) ? "unbounded"
    : n >= 1000 ? `$${Math.round(n).toLocaleString()}`
    : n >= 1 ? `$${n.toFixed(2)}`
    : `$${n.toFixed(4)}`;

/**
 * The screen where a wrong number costs money (B16.2).
 *
 * Everything recomputes as you type, because the point of a calculator is to
 * answer "what if" before it becomes "what happened". Nothing here writes until
 * Save, and Save says exactly what it changed.
 *
 * The worst case and the forecast are shown side by side and are never merged.
 * They answer different questions and a single blended number would be the most
 * misleading thing on the page.
 */
export default function CpCalculator({ initial, canSave }: { initial: EconConfig; canSave: boolean }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(saveCpConfig, undefined);
  const [actions, setActions] = useState<ActionConfig[]>(initial.actions);
  const [rate, setRate] = useState(initial.cpPerDollar);
  const [ceiling, setCeiling] = useState(initial.ceiling);
  const [pop, setPop] = useState(1_000_000);
  const [assume, setAssume] = useState(DEFAULT_ASSUMPTIONS);

  // Row order is fixed ONCE, from the configuration as loaded.
  //
  // Sorting live by CP/day meant a row jumped out from under the cursor the
  // moment you typed into it — set a cap to 0 and the row you were editing
  // slides to the bottom mid-keystroke, and the next character lands in
  // somebody else's number. A table you are editing must not move.
  const order = useMemo(
    () => [...initial.actions]
      .sort((a, b) => (b.weight * b.cap) - (a.weight * a.cap) || a.label.localeCompare(b.label))
      .map((a) => a.key),
    [initial.actions],
  );

  const cfg: EconConfig = useMemo(() => ({ actions, cpPerDollar: rate, ceiling }), [actions, rate, ceiling]);
  const max = useMemo(() => maxDailyCp(cfg), [cfg]);
  const exp = useMemo(() => exposure(cfg, pop), [cfg, pop]);
  const worst = maxDailyCost(cfg, pop);
  const forecast = expectedDailyCost(cfg, pop, assume);
  const surface = useMemo(() => abuseSurface(cfg), [cfg]);
  const mpd = minutesPerDollar(cfg);

  const set = (key: string, field: "weight" | "cap", v: number) =>
    setActions((prev) => prev.map((a) => a.key === key ? { ...a, [field]: Math.max(0, Math.round(v || 0)) } : a));

  const dirty = rate !== initial.cpPerDollar || ceiling !== initial.ceiling ||
    actions.some((a) => {
      const was = initial.actions.find((x) => x.key === a.key);
      return !was || was.weight !== a.weight || was.cap !== a.cap;
    });

  const num = "w-20 rounded-lg border border-violet-400/20 bg-black/30 px-2 py-1 text-sm tabular-nums";

  return (
    <form action={formAction} className="space-y-6">
      {/* Every edited number rides along as a hidden field, so the server reads
          exactly what the screen showed — not a re-derivation that could differ. */}
      <input type="hidden" name="cpPerDollar" value={rate} />
      <input type="hidden" name="ceiling" value={ceiling} />
      {actions.map((a) => (
        <div key={a.key}>
          <input type="hidden" name={`weight:${a.key}`} value={a.weight} />
          <input type="hidden" name={`cap:${a.key}`} value={a.cap} />
        </div>
      ))}

      {/* ---- The answer, first ---- */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted">Worst case, per day</div>
          <div className={`mt-1 text-3xl font-black tabular-nums ${Number.isFinite(worst) ? "text-ink" : "text-rose-300"}`}>
            {usd(worst)}
          </div>
          <p className="mt-1 text-xs text-muted">
            Every one of {pop.toLocaleString()} gamers doing everything, every day, at the maximum.
            That is <b className="text-ink">{usd(exp.perGamerCost)}</b> each.
          </p>
        </div>
        <div className="glass p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted">Forecast, per day</div>
          <div className="mt-1 text-3xl font-black tabular-nums text-cyan-300">{usd(forecast)}</div>
          <p className="mt-1 text-xs text-muted">
            At {Math.round(assume.dailyActive * 100)}% daily-active reaching {Math.round(assume.capReach * 100)}% of their cap.
            This is a guess; the number on the left is not.
          </p>
        </div>
        <div className="glass p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted">Cost to fake a dollar</div>
          <div className="mt-1 text-3xl font-black tabular-nums text-amber-300">
            {mpd === null ? "—" : mpd >= 60 ? `${(mpd / 60).toFixed(1)} h` : `${Math.round(mpd)} min`}
          </div>
          <p className="mt-1 text-xs text-muted">
            {surface[0]
              ? <>Doing nothing but <b className="text-ink">{surface[0].label.toLowerCase()}</b>, the cheapest thing on the board.</>
              : "Nothing on the board is reachable without playing."}
          </p>
        </div>
      </div>

      {/* ---- Open liabilities ---- */}
      {exp.uncapped.length > 0 && (
        <div className="glass border border-rose-400/30 p-5">
          <div className="flex items-center gap-2 font-bold text-rose-200">
            <Icon name="alert" size={16} /> {exp.uncapped.length} action{exp.uncapped.length === 1 ? " is" : "s are"} uncapped
          </div>
          <ul className="mt-2 space-y-1.5">
            {exp.uncapped.map((l) => (
              <li key={l.key} className="text-xs text-muted">
                <b className="text-ink">{l.label}</b> — {l.why}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!exp.ceilingHolds && ceiling > 0 && (
        <div className="glass border border-amber-400/30 p-4 text-xs text-amber-200">
          The ceiling is set at {ceiling.toLocaleString()} CP but the per-action caps only sum to{" "}
          {Number.isFinite(max.table) ? max.table.toLocaleString() : "∞"}. It is not doing anything — the caps are the
          only thing holding, and the guarantee you think you have is the table you happen to have typed.
        </div>
      )}
      {ceiling === 0 && (
        <div className="glass border border-rose-400/40 p-4 text-xs text-rose-200">
          <b>There is no ceiling.</b> What a gamer can earn is now whatever the per-action caps happen to sum to, and
          it has to be re-summed by hand every time one of them moves.
        </div>
      )}

      {/* ---- The two platform numbers ---- */}
      <div className="glass p-5">
        <h2 className="font-bold">The two numbers everything else is measured in</h2>
        <div className="mt-3 flex flex-wrap gap-6">
          <label className="text-sm">
            <div className="text-xs text-muted mb-1">Cluster Points to the dollar</div>
            <input type="number" min={1} value={rate} onChange={(e) => setRate(Math.max(1, Number(e.target.value)))}
              className={`${num} w-32`} />
            <div className="mt-1 text-[11px] text-muted">A $5 trophy costs <Cp amount={5 * rate} />.</div>
          </label>
          <label className="text-sm">
            <div className="text-xs text-muted mb-1">Hard daily ceiling, per gamer</div>
            <input type="number" min={0} value={ceiling} onChange={(e) => setCeiling(Math.max(0, Number(e.target.value)))}
              className={`${num} w-32`} />
            <div className="mt-1 text-[11px] text-muted">
              {ceiling > 0 ? <>Worth <b className="text-ink">{usd(ceiling / rate)}</b> a day, whatever the table says.</> : "Zero means no ceiling."}
            </div>
          </label>
          <div className="text-sm">
            <div className="text-xs text-muted mb-1">Per-action caps sum to</div>
            <div className="text-2xl font-black tabular-nums">{Number.isFinite(max.table) ? max.table.toLocaleString() : "∞"}</div>
            <div className="mt-1 text-[11px] text-muted">
              A gamer can be credited <b className="text-ink">{Number.isFinite(max.capped) ? max.capped.toLocaleString() : "∞"}</b>.
            </div>
          </div>
        </div>
      </div>

      {/* ---- Population and assumptions ---- */}
      <div className="glass p-5">
        <h2 className="font-bold">At what scale, and how honest are we being</h2>
        <div className="mt-3 flex flex-wrap items-end gap-6">
          <div>
            <div className="text-xs text-muted mb-1">Gamers</div>
            <div className="flex flex-wrap gap-2">
              {POPULATIONS.map((n) => (
                <button key={n} type="button" onClick={() => setPop(n)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${pop === n ? "border-cyan-400/60 text-cyan-300" : "border-violet-400/20 text-muted hover:text-ink"}`}>
                  {n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}k`}
                </button>
              ))}
              <input type="number" min={1} value={pop} onChange={(e) => setPop(Math.max(1, Number(e.target.value)))} className={num} />
            </div>
          </div>
          <label className="text-sm">
            <div className="text-xs text-muted mb-1">Daily active {Math.round(assume.dailyActive * 100)}%</div>
            <input type="range" min={0} max={100} value={Math.round(assume.dailyActive * 100)}
              onChange={(e) => setAssume((a) => ({ ...a, dailyActive: Number(e.target.value) / 100 }))} className="w-44" />
          </label>
          <label className="text-sm">
            <div className="text-xs text-muted mb-1">Of their cap, they reach {Math.round(assume.capReach * 100)}%</div>
            <input type="range" min={0} max={100} value={Math.round(assume.capReach * 100)}
              onChange={(e) => setAssume((a) => ({ ...a, capReach: Number(e.target.value) / 100 }))} className="w-44" />
          </label>
        </div>
      </div>

      {/* ---- The table ---- */}
      <div className="glass overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-widest text-muted">
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Quests</th>
              <th className="px-4 py-3 text-right">CP</th>
              <th className="px-4 py-3 text-right">Cap/day</th>
              <th className="px-4 py-3 text-right">CP/day</th>
              <th className="px-4 py-3 text-right">$/day per gamer</th>
            </tr>
          </thead>
          <tbody>
            {order.map((key) => actions.find((x) => x.key === key)!).map((a) => {
              const perDay = a.cap > 0 ? a.weight * a.cap : Infinity;
              return (
                <tr key={a.key} className={`border-b border-white/5 ${a.cap === 0 ? "bg-rose-500/5" : ""}`}>
                  <td className="px-4 py-2">
                    <div className="text-ink">{a.label}</div>
                    <div className="font-mono text-[10px] text-muted">{a.key}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{a.quests.join(", ")}</td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" min={0} value={a.weight} onChange={(e) => set(a.key, "weight", Number(e.target.value))} className={num} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" min={0} value={a.cap} onChange={(e) => set(a.key, "cap", Number(e.target.value))} className={num} />
                    {a.cap === 0 && <div className="text-[10px] text-rose-300">uncapped</div>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number.isFinite(perDay) ? perDay.toLocaleString() : "∞"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{Number.isFinite(perDay) ? usd(perDay / rate) : "unbounded"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- The abuse surface ---- */}
      <div className="glass p-5">
        <h2 className="font-bold">What a second account would do first</h2>
        <p className="mt-1 max-w-2xl text-xs text-muted">
          Everything reachable without spending money or being good at a game, ranked by Cluster Points per minute of
          human effort. Winning a challenge is not on this list because faking it means actually winning.
        </p>
        <div className="mt-3 space-y-1.5">
          {surface.map((r) => (
            <div key={r.key} className="flex items-center gap-3 text-xs">
              <span className="w-48 shrink-0 text-ink">{r.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-amber-400/70"
                  style={{ width: `${Math.min(100, (r.cpPerMinute / (surface[0]?.cpPerMinute || 1)) * 100)}%` }} />
              </div>
              <span className="w-28 shrink-0 text-right tabular-nums text-muted">{r.cpPerMinute.toFixed(1)} CP/min</span>
              <span className="w-24 shrink-0 text-right tabular-nums text-muted">{r.cpPerDay.toLocaleString()}/day</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Save ---- */}
      <div className="glass flex flex-wrap items-center gap-4 p-5">
        <button disabled={!canSave || pending || !dirty}
          className="glow-btn rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? "Saving…" : dirty ? "Save to the live economy" : "Nothing changed"}
        </button>
        {!canSave && <span className="text-xs text-amber-300">Only an admin can change what a Cluster Point is worth.</span>}
        {dirty && canSave && (
          <span className="text-xs text-muted">
            This writes to the quests that actually pay, and records every before → after in the audit log.
          </span>
        )}
        {state?.ok && <span className="text-xs text-emerald-300">{state.message}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>

      {state?.changes && state.changes.length > 0 && (
        <div className="glass p-5">
          <div className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">What was written</div>
          <ul className="space-y-1 text-xs text-muted">
            {state.changes.map((c, i) => <li key={i} className="font-mono">{c}</li>)}
          </ul>
        </div>
      )}
    </form>
  );
}
