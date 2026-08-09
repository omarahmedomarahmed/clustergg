"use client";

import { useActionState } from "react";
import Icon from "@/components/Icon";
import { setAgeBand, type BandState } from "@/app/actions/age";
import { AGE_BANDS, BAND_CHANGE_HELP, BAND_LABEL, BAND_RULES, type AgeBand } from "@/lib/age";

// The band, in settings. B72.4 → B95.
//
// IT IS NOT THE SIGNUP CONTROL ANY MORE. The band is asked on the onboarding
// page now, where selecting one shows what it does before a separate button
// saves it. This survives as the settings view of the same fact: it shows which
// band the account is in, and — since B95 set `MAX_BAND_CHANGES` to zero — what
// to do when it is wrong, which is to talk to a human.
//
// The buttons are disabled rather than removed. A control that vanishes leaves
// somebody hunting for it and then writing to support asking where their age
// setting went; a control they can see, with the reason underneath, answers the
// question without the ticket.
//
// What each band gets is printed on the button. Not because a regulator asks
// for it, but because a band with no consequence attached reads as a formality.

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
      <div className="grid gap-2 sm:grid-cols-2">
        {AGE_BANDS.map((b) => {
          const rules = BAND_RULES[b];
          const active = shown === b;
          return (
            <form key={b} action={act}>
              <input type="hidden" name="band" value={b} />
              <button
                disabled={busy || !!shown}
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
          We never ask for your date of birth — only which of these you are in.
          {shown ? <> {BAND_CHANGE_HELP}</> : null}
        </p>
      )}
    </div>
  );
}
