"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { confirmUnderThirteen, type OnboardState } from "@/app/actions/onboarding";

// "I'm under 13". B95.
//
// A LINK, not a third option, and pressing it selects nothing — see lib/age.ts
// and lib/under13.ts for why a third button in the picker would have been the
// wrong design.
//
// What opens is an explanation and a typed confirmation. The explanation is
// written to be read by a twelve-year-old and it does three things in order:
// says what the rule is, says it is not their fault, and says exactly what
// pressing the button destroys. Nothing here is a dark pattern in either
// direction — it is not hidden, and it is not one tap away either.

export default function UnderThirteen() {
  const [open, setOpen] = useState(false);
  const [state, act, busy] = useActionState<OnboardState | undefined, FormData>(
    confirmUnderThirteen, undefined,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs text-muted underline decoration-dotted underline-offset-4 hover:text-ink"
      >
        I&apos;m under 13
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/[0.07] p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-rose-100">
        <Icon name="alert" size={15} /> Then we have to close your account.
      </div>

      <div className="mt-2 space-y-2 text-xs leading-relaxed text-rose-100/90">
        <p>
          Cluster hands out real prize money, and there are laws about running something like
          that for anybody under 13 — in the US it is called COPPA, and most other countries
          have their own version. They exist for good reasons and we are not going to work
          around them.
        </p>
        <p>
          <b>You have not done anything wrong</b>, and being honest here is the right call. But if
          you press the button below we will delete your account: the points, the trophies, the
          linked games, everything. It cannot be undone and there is nothing left to restore.
        </p>
        <p>
          Come back on your 13th birthday and make a new one. It is free, and it always will be.
        </p>
      </div>

      <form action={act} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[10px] uppercase tracking-widest text-rose-200/80">
          Type DELETE to confirm
          <input
            name="confirm" required placeholder="DELETE" autoComplete="off"
            className="input-cosmic mt-1 block w-40 text-sm tracking-widest"
          />
        </label>
        <button
          disabled={busy}
          className="pressable mb-0.5 rounded-full border border-rose-400/50 bg-rose-500/20 px-5 py-2 text-sm font-semibold text-rose-100 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ghost-btn pressable mb-0.5 rounded-full px-5 py-2 text-sm"
        >
          Never mind
        </button>
      </form>

      {state?.error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-200">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{state.error}</span>
        </p>
      )}
    </div>
  );
}
