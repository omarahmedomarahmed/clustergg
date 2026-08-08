"use client";

import { useActionState } from "react";
import Icon from "@/components/Icon";
import { runWeekClose, type WeekCloseState } from "@/app/actions/vaults";

// One button. It runs the same function the Monday cron runs.
//
// Not disabled when the week is already closed — the close is idempotent and
// says so, and a disabled button leaves an operator wondering whether it would
// have worked. Pressing it on a closed week returns "already closed", which is
// a better answer than a control that cannot be pressed.
export default function RunWeekClose({ week, alreadyClosed }: {
  week: string;
  alreadyClosed: boolean;
}) {
  const [state, act, busy] = useActionState<WeekCloseState, FormData>(runWeekClose, undefined);
  return (
    <form action={act} className="space-y-3">
      <button
        disabled={busy}
        className="pressable glow-btn rounded-full px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
      >
        {busy ? "Closing…" : alreadyClosed ? `Re-run the close for ${week}` : `Close the week of ${week}`}
      </button>
      {alreadyClosed && (
        <p className="text-[11px] text-muted">
          <Icon name="check" size={11} className="mr-1 inline text-emerald-300" />
          Already closed. Running it again writes nothing — the check is against the payout rows, not a flag.
        </p>
      )}
      {state?.summary && (
        <p className={`rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${
          state.error
            ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
            : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
        }`}>
          {state.summary}
        </p>
      )}
      {state?.error && !state.summary && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{state.error}</p>
      )}
    </form>
  );
}
