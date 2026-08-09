"use client";

import { useActionState } from "react";
import Icon from "@/components/Icon";
import { announceUpcoming } from "@/app/actions/discord";
import { STAGE_ORDER, STAGES, type Stage } from "@/lib/challenge-stage";
import type { BotActionState } from "@/app/actions/discord";

// Where a challenge is, and the one move available from here. B90.3.
//
// The ladder is drawn WHOLE — all five rungs, with the ones already passed
// dimmed — rather than as a single badge. A badge saying "queued" tells an
// operator what is true; the ladder tells them what happens next, which is the
// question they actually opened the page with.
//
// Exactly one action lives here, and only on the rung that has one. Announcing
// is the only step in this ladder a human takes: draft→queued is a payment,
// live and ended are the cron. A panel offering buttons for the rest would be
// offering to fake a payment.

export default function StageLadder({ challengeId, stage, canAnnounce }: {
  challengeId: string;
  stage: Stage;
  canAnnounce: boolean;
}) {
  const [state, act, busy] = useActionState<BotActionState, FormData>(
    announceUpcoming, {} as BotActionState,
  );
  const at = STAGE_ORDER.indexOf(stage);

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {STAGE_ORDER.map((k, i) => {
          const v = STAGES[k];
          const now = i === at;
          const past = i < at;
          return (
            <span key={k} className="flex items-center gap-1.5">
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                  now
                    ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100"
                    : past
                      ? "border-white/10 bg-white/5 text-muted"
                      : "border-white/8 text-muted/60"
                }`}
              >
                {v.label}
              </span>
              {i < STAGE_ORDER.length - 1 && (
                <span className={`text-[10px] ${past ? "text-muted" : "text-muted/40"}`}>→</span>
              )}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{STAGES[stage].blurb}</p>

      {canAnnounce && (
        <form action={act} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="challengeId" value={challengeId} />
          <button
            disabled={busy}
            className="money-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Announcing…" : "Tell the servers it's coming"}
          </button>
          {/* Said before the click, because it is not undoable: the stamp is
              what every reach number for this challenge is measured from. */}
          <span className="text-[11px] text-muted">
            Marks it announced from now. Reach starts counting here.
          </span>
        </form>
      )}

      {state?.error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-rose-300">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{state.error}</span>
        </p>
      )}
      {state?.ok && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-300">
          <Icon name="check" size={13} className="mt-0.5 shrink-0" /> <span>{state.ok}</span>
        </p>
      )}
    </div>
  );
}
