"use client";

import { useActionState } from "react";
import Icon from "@/components/Icon";
import { setAgeBand, type BandState } from "@/app/actions/age";
import { AGE_BANDS, BAND_LABEL, BAND_RULES, type AgeBand } from "@/lib/age";

// Three buttons. B72.4.
//
// **The click IS the answer** — no "next", no "confirm". A confirm step on a
// question this small is a step people abandon, and an unanswered band is worth
// nothing to us and costs the gamer their earnings. One tap, and the page moves
// on.
//
// That shape guarantees mis-taps, which is exactly why `/settings/earning`
// exists and why this component says so underneath rather than burying it.
//
// What each band gets is printed on the button. Not because a regulator asks
// for it, but because "Under 16" with no consequence attached reads as a
// formality — and somebody who taps it without understanding is the person the
// whole gate is meant to protect.

export default function AgeBandPicker({
  current, locked, left, compact = false,
}: {
  current: AgeBand | null;
  locked: boolean;
  /** Changes remaining before it locks. */
  left: number;
  /** Onboarding shows it bare; settings frames it. */
  compact?: boolean;
}) {
  const [state, act, busy] = useActionState<BandState, FormData>(setAgeBand, undefined);
  const shown = state?.band ?? current;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {AGE_BANDS.map((b) => {
          const rules = BAND_RULES[b];
          const active = shown === b;
          return (
            <form key={b} action={act}>
              <input type="hidden" name="band" value={b} />
              <button
                disabled={busy || (locked && !active)}
                data-band={b}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  active
                    ? "border-emerald-400/50 bg-emerald-500/15"
                    : "border-white/12 bg-white/5 hover:border-white/25 hover:bg-white/10"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-black">
                  {active && <Icon name="check" size={13} className="text-emerald-300" />}
                  {BAND_LABEL[b]}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                  {rules.earn
                    ? rules.redeem
                      ? "Play, earn points, cash out."
                      : "Play and earn points. Cashing out opens at 18."
                    : "Browse only — no points, no prizes."}
                </span>
              </button>
            </form>
          );
        })}
      </div>

      {state?.error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {state.error}
        </p>
      )}

      {!compact && (
        <p className="text-[11px] leading-relaxed text-muted">
          <Icon name="check" size={10} className="mr-1 inline text-emerald-300" />
          We never ask for your date of birth — only which of these three you are in.
          {locked ? (
            <> Your age range is <b className="text-ink">locked</b> after three changes. Message support if it is wrong.</>
          ) : shown ? (
            <> Tapped the wrong one? You can change it {left === 1 ? "once more" : `${left} more times`}.</>
          ) : null}
        </p>
      )}
    </div>
  );
}
