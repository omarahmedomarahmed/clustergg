"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import {
  finance, stress, challengeUnit, FINANCE_DEFAULTS, type FinanceConfig,
} from "@/lib/finance";
import { PRICING_DEFAULTS, type PricingConfig } from "@/lib/pricing";

// The plan for the money, as something you can argue with.
//
// A financial model in a deck is normally a table of numbers you are asked to
// accept. This one is the model itself: every figure is computed from the
// assumptions on the left, and the assumptions are sliders. If you think 83%
// of brands will not stay after a free month, move it to 30% and watch what
// happens to the whole page — that is a far better answer than us insisting.
//
// It runs the SAME functions the server renders with, so a reader dragging a
// slider and a founder presenting the page can never see different arithmetic.

const $ = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 10_000
    ? `$${Math.round(abs).toLocaleString()}`
    : `$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return n < 0 ? `−${s}` : s;
};
const pct = (n: number) => `${Math.round(n)}%`;

export default function FinanceModel({ initial, pricing, accent = "#8b5cf6" }: {
  initial: FinanceConfig;
  pricing: PricingConfig;
  accent?: string;
}) {
  const [cfg, setCfg] = useState<FinanceConfig>(initial);
  const [tab, setTab] = useState<"funds" | "flow" | "risk" | "round">("funds");

  const f = useMemo(() => finance(cfg, pricing), [cfg, pricing]);
  const scenarios = useMemo(() => stress(cfg, pricing), [cfg, pricing]);
  const unit = useMemo(() => challengeUnit(pricing), [pricing]);
  const touched = JSON.stringify(cfg) !== JSON.stringify(initial);

  const set = (k: keyof FinanceConfig, v: number) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
      {/* ===== The assumptions ===== */}
      <aside className="glass rounded-2xl p-4 lg:sticky lg:top-24 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Assumptions</div>
          {touched && (
            <button
              type="button" onClick={() => setCfg(initial)}
              className="text-[10px] text-cyan-300 hover:underline"
            >
              Reset
            </button>
          )}
        </div>
        <p className="text-[11px] leading-snug text-muted">
          Everything on the right is computed from these. Change one and the whole page moves —
          including the parts that make us look worse.
        </p>

        <Field label="Raising" value={cfg.raise} min={25_000} max={500_000} step={5_000}
          fmt={$} onChange={(v) => set("raise", v)} />
        <Field label="For this much of the company" value={cfg.equityPct} min={5} max={40} step={1}
          fmt={pct} onChange={(v) => set("equityPct", v)} />
        <Field label="Months it has to last" value={cfg.months} min={3} max={24} step={1}
          fmt={(v) => `${v} mo`} onChange={(v) => set("months", v)} />

        <Divider label="Brands" />
        <Field label="Brands given a free first month" value={cfg.targetBrands} min={5} max={200} step={5}
          fmt={(v) => String(v)} onChange={(v) => set("targetBrands", v)} />
        <Field
          label="Of those, how many stay" value={cfg.brandsConverting} min={0} max={cfg.targetBrands} step={1}
          fmt={(v) => `${v} · ${pct(cfg.targetBrands ? (v / cfg.targetBrands) * 100 : 0)}`}
          hint={f.capacityBound
            ? `Capped at ${f.payingBrandCapacity} by the games slider below — a game runs one sponsored challenge at a time, so a game is a sponsor's slot. Raising this does nothing until games rise.`
            : "20–40% is normal for a B2B free trial. It stops mattering above the number of game slots, because the network cannot serve more sponsors than it has games."}
          onChange={(v) => set("brandsConverting", v)}
        />
        <Field label="What a paying brand pays a month" value={cfg.revenuePerBrand} min={250} max={5_000} step={50}
          fmt={$} onChange={(v) => set("revenuePerBrand", v)} />

        <Divider label="Servers" />
        <Field label="Servers onboarded" value={cfg.targetServers} min={100} max={10_000} step={100}
          fmt={(v) => v.toLocaleString()} onChange={(v) => set("targetServers", v)} />
        <Field label="Welcome challenge we fund each" value={cfg.welcomeChallengeCost} min={0} max={200} step={5}
          fmt={$} onChange={(v) => set("welcomeChallengeCost", v)} />
        <Field label="Members in a typical server" value={cfg.membersPerServer} min={50} max={10_000} step={50}
          fmt={(v) => v.toLocaleString()} onChange={(v) => set("membersPerServer", v)} />
        <Field label="Of those, how many link a game" value={cfg.linkedPerServer} min={1} max={200} step={1}
          fmt={(v) => String(v)} onChange={(v) => set("linkedPerServer", v)} />

        <Divider label="What we run" />
        {/* THE CAPACITY DIAL. B120. Every brand number above is capped by this
            one, so it is labelled as the ceiling rather than as inventory. */}
        <Field label="Games — the capacity ceiling" value={cfg.games} min={1} max={40} step={1}
          hint={`${f.payingBrandCapacity} sponsors can be served at once. A game runs a single sponsored challenge at a time, so games ÷ games-per-brand is the hard limit on revenue.`}
          fmt={(v) => String(v)} onChange={(v) => set("games", v)} />
        <Field label="Games a paying brand buys at once" value={cfg.gamesPerPayingBrand} min={1} max={6} step={1}
          fmt={(v) => String(v)} onChange={(v) => set("gamesPerPayingBrand", v)} />
        <Field label="Challenges per game per month" value={cfg.challengesPerGamePerMonth} min={1} max={12} step={1}
          fmt={(v) => String(v)} onChange={(v) => set("challengesPerGamePerMonth", v)} />

        <Divider label="Costs" />
        <Field label="Infrastructure & partnerships" value={cfg.techBudget} min={0} max={60_000} step={1_000}
          fmt={$} onChange={(v) => set("techBudget", v)} />
        <Field label="People" value={cfg.hires} min={0} max={20} step={1}
          fmt={(v) => String(v)} onChange={(v) => set("hires", v)} />
        <Field label="Each, per month" value={cfg.hireMonthlyCost} min={0} max={10_000} step={50}
          fmt={$} onChange={(v) => set("hireMonthlyCost", v)} />

        {/* A checkbox called "a sponsor names an existing challenge" was here.
            It is now answered by the commercial model rather than toggled — see
            the C8 note in `lib/finance.ts`. Left as a statement because a
            reader who used to flip it deserves to know where it went, and
            because it is the assumption that moves this budget most. */}
        <p className="rounded-lg border border-white/10 p-2.5 text-[10px] leading-snug text-muted">
          <span className="block text-[11px] font-semibold text-ink">Who funds a sponsored prize</span>
          Half of what a brand pays <b className="text-ink">is</b> the prize pool, so a sold challenge costs
          us nothing in prizes. The prizes line above is the challenges nobody has bought yet. The one
          exception is the free first month, which is counted as cash in brand acquisition.
        </p>
      </aside>

      {/* ===== The model ===== */}
      <div className="min-w-0 space-y-4">
        {/* Headline numbers, always visible. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Cash out" value={$(f.cashTotal)} note={`over ${cfg.months} months`} accent={accent} />
          <Stat label="Buffer left" value={$(f.buffer)} note={f.buffer >= 0 ? "unallocated" : "short — cut a line"} accent={f.buffer >= 0 ? accent : "#f43f5e"} />
          <Stat label="Breakeven" value={`${f.breakeven.brandsNeeded} brands`} note={f.breakeven.brandsNeeded > f.payingBrandCapacity ? `more than the ${f.payingBrandCapacity} slots we have` : `${pct(f.breakeven.conversionNeededPct)} of the free month`} accent={f.breakeven.brandsNeeded > f.payingBrandCapacity ? "#f43f5e" : "#22d3ee"} />
          <Stat label={`ARR at month ${cfg.months}`} value={$(f.exit.arr)} note={`${f.exit.payingBrands} of ${f.payingBrandCapacity} slots filled`} accent="#34d399" />
        </div>

        {/* THE CONSTRAINT, said out loud. B120.
            The plan projected 22 paying brands against six games. Every figure
            downstream was revenue the network had no inventory to deliver, and
            nothing on the page said so — the model simply multiplied brands by
            price. If the funnel is bigger than the slots now, it says it here,
            before any of the numbers below are read. */}
        {f.capacityBound && (
          <p className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] p-3 text-[11px] leading-relaxed text-muted">
            <span className="mt-0.5 shrink-0 font-bold text-amber-300">!</span>
            <span>
              <b className="text-ink">Inventory is the binding constraint, not conversion.</b> A game runs one
              sponsored challenge at a time, so {cfg.games} games can serve {f.payingBrandCapacity} sponsors.
              The funnel above converts {cfg.brandsConverting}. The extra{" "}
              {cfg.brandsConverting - f.payingBrandCapacity} are brands we would have to turn away — they are
              excluded from every figure below, and the cash to acquire them is not.
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {([
            ["funds", "Where the money goes"],
            ["flow", "Month by month"],
            ["risk", "If we're wrong"],
            ["round", "The round"],
          ] as const).map(([k, label]) => (
            <button
              key={k} type="button" onClick={() => setTab(k)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                tab === k ? "bg-white/15 text-ink" : "text-muted hover:text-ink hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "funds" && (
          <div className="space-y-3">
            {/* The unit the whole thing rests on. */}
            <div className="glass rounded-2xl p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">One sponsored challenge</div>
              {/* THREE segments, not two. B120. This bar showed the prize
                  half against "the platform fee" and labelled the second one
                  the line the business lives on — while the server pool and
                  the points vault, 15% each, sat inside it. */}
              <div className="flex h-8 w-full overflow-hidden rounded-lg">
                <div className="flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ width: `${unit.prizePct}%`, background: "#22d3ee" }}>
                  {$(unit.prize)} to gamers
                </div>
                <div className="flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ width: `${unit.poolsPct}%`, background: "#34d399" }}>
                  {$(unit.pools)}
                </div>
                <div className="flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ width: `${unit.oursPct}%`, background: accent }}>
                  {$(unit.ours)}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted leading-snug">
                A brand pays {$(unit.price)}. {unit.prizePct}% is the prize pool and reaches a gamer;
                {" "}{unit.poolsPct}% is the weekly server pool and the points vault, both owed to somebody
                else. {$(unit.ours)} — {unit.oursPct}% — is ours, and it is the only line the business lives
                on. Every total below is built from that number, not from the {$(unit.fee)} that is merely
                not prize money.
              </p>
            </div>

            {f.lines.map((l) => {
              const total = l.cash + l.foregone;
              const width = f.investedTotal > 0 ? (total / f.investedTotal) * 100 : 0;
              return (
                <div key={l.key} className="glass rounded-2xl p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-ink">{l.label}</span>
                    <span className="font-mono text-sm" style={{ color: accent }}>{$(total)}</span>
                  </div>
                  <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div style={{ width: `${(l.cash / Math.max(1, f.investedTotal)) * 100}%`, background: accent }} />
                    <div style={{ width: `${(l.foregone / Math.max(1, f.investedTotal)) * 100}%`, background: "#64748b" }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="text-muted">{l.formula}</span>
                    <span style={{ color: accent }}>{$(l.cash)} cash</span>
                    {l.foregone > 0 && (
                      <span className="text-slate-400">{$(l.foregone)} revenue we don&apos;t charge</span>
                    )}
                    <span className="text-muted/70">{pct(width)} of the plan</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{l.note}</p>
                </div>
              );
            })}

            <div className="glass rounded-2xl p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Cash is not the same as budget</div>
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <Line label="Cash leaving the bank" value={$(f.cashTotal)} strong />
                <Line label="Revenue we choose not to charge" value={$(f.foregoneTotal)} />
                <Line label="Total invested in growth" value={$(f.investedTotal)} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Giving a brand its first month free costs us the invoice, not the prize money — that challenge was
                already running and already funded on the line above. Counting it as cash would overstate the burn by{" "}
                {$(f.foregoneTotal)} and understate the runway by months. Both figures are shown because both are
                true, and only one of them is runway.
              </p>
            </div>
          </div>
        )}

        {tab === "flow" && (
          <div className="glass rounded-2xl p-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted">
                  <th className="text-left font-medium pb-2">Month</th>
                  <th className="text-right font-medium pb-2">Servers</th>
                  <th className="text-right font-medium pb-2">Linked gamers</th>
                  <th className="text-right font-medium pb-2">Paying brands</th>
                  <th className="text-right font-medium pb-2">Revenue</th>
                  <th className="text-right font-medium pb-2">Spend</th>
                  <th className="text-right font-medium pb-2">Cash left</th>
                </tr>
              </thead>
              <tbody>
                {f.months.map((m) => (
                  <tr key={m.month} className="border-t border-white/8">
                    <td className="py-2 font-semibold">M{m.month}</td>
                    <td className="py-2 text-right tabular-nums">{m.serversTotal.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{m.linkedGamers.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{m.payingBrands}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-300">{$(m.revenue)}</td>
                    <td className="py-2 text-right tabular-nums text-muted">{$(m.spend)}</td>
                    <td className={`py-2 text-right tabular-nums font-semibold ${m.cashLeft < 0 ? "text-rose-300" : ""}`}>
                      {$(m.cashLeft)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              A brand takes its free month, then pays from the next one — which is why month {cfg.months} shows{" "}
              {f.months[f.months.length - 1]?.payingBrands} paying rather than {f.exit.payingBrands}. The{" "}
              {$(f.exit.mrr)} figure is the run rate once every brand has been through the free month, not revenue
              earned inside month {cfg.months}. Both are real; they are different numbers.
              {f.breakeven.month !== null && (
                <> Revenue covers spend from <b className="text-ink">month {f.breakeven.month}</b>.</>
              )}
            </p>
          </div>
        )}

        {tab === "risk" && (
          <div className="space-y-3">
            <div className="glass rounded-2xl p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted mb-1">
                What has to be true
              </div>
              <p className="text-sm leading-relaxed text-muted">
                A steady month costs <b className="text-ink">{$(f.breakeven.monthlyCost)}</b> — the network&apos;s prize
                pools, infrastructure and people. One paying brand contributes{" "}
                <b className="text-ink">{$(f.breakeven.contributionPerBrand)}</b>. So the business covers itself at{" "}
                <b style={{ color: accent }}>{f.breakeven.brandsNeeded} paying brands</b>, which is{" "}
                <b style={{ color: accent }}>{pct(f.breakeven.conversionNeededPct)}</b> of the brands we put through a
                free month. Everything above that is upside, not survival.
              </p>
            </div>

            {scenarios.map((s) => (
              <div key={s.label} className="glass rounded-2xl p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">{s.label}</span>
                  <span className="text-xs text-muted">{pct(s.conversionPct)} stay · {s.payingBrands} brands</span>
                </div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <Line label="ARR" value={$(s.arr)} />
                  <Line label="Monthly profit" value={$(s.monthlyProfit)} tone={s.monthlyProfit >= 0 ? "good" : "bad"} />
                  <Line label="Cash at the end" value={$(s.cashAtEnd)} tone={s.cashAtEnd >= 0 ? "good" : "bad"} />
                  <Line label="Outcome" value={s.survives ? "Survives" : "Runs out"} tone={s.survives ? "good" : "bad"} />
                </div>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-muted px-1">
              These are the same model with one number changed. The plan is built so that the weak case still gets to
              the next round — which is the only thing a first cheque has to buy.
            </p>
          </div>
        )}

        {tab === "round" && (
          <div className="space-y-3">
            <div className="glass rounded-2xl p-4">
              <div className="grid sm:grid-cols-4 gap-3 text-sm">
                <Line label="Raising" value={$(cfg.raise)} strong />
                <Line label="For" value={pct(cfg.equityPct)} strong />
                <Line label="Pre-money" value={$(f.valuation.pre)} />
                <Line label="Post-money" value={$(f.valuation.post)} />
              </div>
            </div>

            <div className="glass rounded-2xl p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">
                What the price implies
              </div>
              <p className="text-sm leading-relaxed text-muted">
                {$(f.valuation.post)} post-money against the {$(f.exit.arr)} of ARR this plan reaches in month{" "}
                {cfg.months} is <b className="text-ink">{f.valuation.postOnExitArr.toFixed(2)}× forward ARR</b>.
                Comparable software at this stage prices between four and ten times ARR — which is the range below,
                and the step-up each one implies from today&apos;s price.
              </p>
              <div className="mt-3 space-y-2">
                {f.valuation.nextRound.map((n) => (
                  <div key={n.multiple} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-xs text-muted">{n.multiple}× ARR</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min(100, (n.valuation / (f.exit.arr * 10 || 1)) * 100)}%`,
                        background: accent,
                      }} />
                    </div>
                    <span className="w-24 shrink-0 text-right font-mono text-xs" style={{ color: accent }}>
                      {$(n.valuation)}
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs text-muted">{n.stepUp.toFixed(1)}×</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass rounded-2xl p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Where we land</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Line label="Servers" value={f.exit.servers.toLocaleString()} />
                <Line label="Members reachable" value={f.exit.reachable.toLocaleString()} />
                <Line label="Linked gamers" value={f.exit.linkedGamers.toLocaleString()} />
                <Line label="Paying brands" value={String(f.exit.payingBrands)} />
                <Line label="MRR run rate" value={$(f.exit.mrr)} strong />
                <Line label="ARR" value={$(f.exit.arr)} strong />
                <Line label="Monthly cost" value={$(f.exit.steadyMonthlyCost)} />
                <Line label="Monthly profit" value={$(f.exit.monthlyProfit)} tone={f.exit.monthlyProfit >= 0 ? "good" : "bad"} />
              </div>
            </div>
          </div>
        )}

        {touched && (
          <p className="flex items-start gap-2 text-[11px] text-cyan-300/90 px-1">
            <Icon name="spark" size={13} className="mt-0.5 shrink-0" />
            You&apos;ve changed the assumptions — everything above is now your model, not ours. Reset returns it to the plan as filed.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, min, max, step, fmt, hint, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  fmt: (v: number) => string; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted">{label}</span>
        <span className="font-mono text-[11px] text-ink">{fmt(value)}</span>
      </span>
      <input
        type="range" min={min} max={Math.max(min, max)} step={step} value={Math.min(value, max)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-cyan-400"
      />
      {hint && <span className="mt-0.5 block text-[10px] leading-snug text-muted/80">{hint}</span>}
    </label>
  );
}

const Divider = ({ label }: { label: string }) => (
  <div className="pt-1 text-[10px] uppercase tracking-[0.2em] text-muted/60 border-t border-white/8">{label}</div>
);

function Stat({ label, value, note, accent }: { label: string; value: string; note: string; accent: string }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: accent }}>{value}</div>
      <div className="text-[10px] text-muted">{note}</div>
    </div>
  );
}

function Line({ label, value, strong, tone }: {
  label: string; value: string; strong?: boolean; tone?: "good" | "bad";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular-nums ${strong ? "text-lg font-bold" : "font-semibold"} ${
        tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-ink"
      }`}>
        {value}
      </div>
    </div>
  );
}

export { FINANCE_DEFAULTS, PRICING_DEFAULTS };
