"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { releaseForWeek, type AllocState } from "@/app/actions/vaults";

// Releasing a week's budget.
//
// The two numbers that decide what the whole platform pays this week, side by
// side, with the vault behind each one and the reserve that is left after.
//
// PERCENTAGE BUTTONS OVER A DOLLAR FIELD. Nobody thinks "release $52.50"; they
// think "half of it". The stored value is dollars — a percentage of a moving
// balance is a number that changes after somebody has been shown it — but the
// operator picks in the units they actually reason in, and the dollars appear
// before they commit.
//
// The RESERVE is shown next to the release, not buried. It is the whole reason
// the control exists: what is left is what pays everybody through a week when
// nothing sells.

export type BudgetView = {
  vault: "cp" | "server";
  label: string;
  /** In the bank. */
  bank: number;
  allocated: number;
  spent: number;
  remaining: number;
  reserve: number;
  locked: boolean;
  exists: boolean;
  /** What this budget produces — today's ceiling, or Monday's pool. */
  effect: string;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function WeekBudgets({ week, budgets, canEdit }: {
  week: string;
  budgets: BudgetView[];
  canEdit: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {budgets.map((b) => <BudgetCard key={b.vault} week={week} b={b} canEdit={canEdit} />)}
    </div>
  );
}

function BudgetCard({ week, b, canEdit }: { week: string; b: BudgetView; canEdit: boolean }) {
  const [state, act, busy] = useActionState<AllocState, FormData>(releaseForWeek, undefined);
  const [amount, setAmount] = useState(String(b.exists ? b.allocated : Math.round(b.bank * 0.5 * 100) / 100));

  const n = Number(amount);
  const valid = Number.isFinite(n) && n >= 0;
  const reserveAfter = valid ? Math.max(0, Math.round((b.bank - n) * 100) / 100) : b.reserve;
  const pct = (p: number) => Math.round(b.bank * p) / 100;

  return (
    <form action={act} className="rounded-2xl border border-white/10 bg-black/25 p-5">
      <input type="hidden" name="vault" value={b.vault} />
      <input type="hidden" name="week" value={week} />

      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold">{b.label}</h3>
        {b.locked && (
          <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
            locked · can only go up
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{b.effect}</p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Fig label="In the vault" value={money(b.bank)} />
        <Fig label="Released" value={money(b.allocated)} tone={b.exists ? "on" : "off"} />
        <Fig label="Left this week" value={money(b.remaining)} />
      </div>

      {!b.exists && (
        <p className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-cyan-100">
          Nothing released yet, so this week is still running on the old behaviour.
          Release an amount and it takes over.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-[10px] uppercase tracking-widest text-muted">
          Release
          <input
            name="amount" type="number" min={0} step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)} disabled={!canEdit}
            className="input-cosmic !py-1 mt-0.5 block w-36 text-sm tabular-nums"
          />
        </label>
        <div className="flex gap-1.5 pb-1">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p} type="button" disabled={!canEdit}
              onClick={() => setAmount(String(pct(p)))}
              className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] font-bold text-muted hover:text-ink"
            >{p}%</button>
          ))}
        </div>
      </div>

      {/* The reserve, next to the decision rather than after it. */}
      <p className="mt-2 text-[11px] text-muted">
        Leaves <b className="text-ink tabular-nums">{money(reserveAfter)}</b> in reserve
        {reserveAfter <= 0 && (
          <span className="text-amber-200"> — nothing held back. A week with no sales pays nobody.</span>
        )}
      </p>

      <label className="mt-3 block text-[10px] uppercase tracking-widest text-muted">
        Why
        <input
          name="note" required disabled={!canEdit}
          placeholder={b.vault === "cp" ? "e.g. holding two weeks back until the next challenge lands" : "e.g. half, so a quiet week still pays"}
          className="input-cosmic !py-1 mt-0.5 block w-full text-xs"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          disabled={!canEdit || busy || !valid}
          className="money-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Releasing…" : b.exists ? "Update this week" : "Release for this week"}
        </button>
        {b.locked && (
          <span className="text-[11px] text-muted">Raising is fine. Lowering is refused.</span>
        )}
      </div>

      {!canEdit && (
        <p className="mt-2 text-[11px] text-amber-200">
          Reading the budget is billing&apos;s. Setting it is a super admin.
        </p>
      )}
      {state?.error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-rose-300">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{state.error}</span>
        </p>
      )}
      {state?.ok && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-300">
          <Icon name="check" size={13} className="mt-0.5 shrink-0" /> <span>{state.message}</span>
        </p>
      )}
    </form>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: "on" | "off" }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-2 py-2">
      <div className="text-[9px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-0.5 text-sm font-black tabular-nums ${tone === "off" ? "text-muted" : ""}`}>
        {value}
      </div>
    </div>
  );
}
