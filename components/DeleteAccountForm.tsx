"use client";

import { useActionState, useState } from "react";
import { deleteAccount } from "@/app/actions/connections";

/**
 * Type the word (B40).
 *
 * Not a confirmation modal. A modal is something you dismiss — the muscle
 * memory for one is "click through it" — whereas typing a word is something you
 * have to decide to do. Deletion here is irreversible AND forfeits money, which
 * is exactly the pair that earns the friction.
 *
 * The button stays disabled until the word matches, so the state of the form is
 * the state of the decision.
 */
export default function DeleteAccountForm({ canDelete, atStake }: { canDelete: boolean; atStake: number }) {
  const [state, act, pending] = useActionState<{ error?: string } | undefined, FormData>(
    async (_prev, fd) => deleteAccount(fd), undefined);
  const [typed, setTyped] = useState("");
  const armed = typed.trim().toUpperCase() === "DELETE";

  return (
    <form action={act} className="space-y-3">
      <label className="block text-sm">
        <span className="text-muted">
          Type <b className="text-rose-300">DELETE</b> to confirm
          {atStake > 0 && <> — this forfeits <b className="text-ink">${atStake.toFixed(2)}</b></>}
        </span>
        <input
          name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)}
          autoComplete="off" placeholder="DELETE"
          className="input-cosmic mt-1 w-full max-w-xs uppercase"
        />
      </label>
      <button
        disabled={!armed || !canDelete || pending}
        className="rounded-full border border-rose-400/50 px-6 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Deleting…" : "Delete my account"}
      </button>
      {state?.error && <p className="text-sm text-rose-300">{state.error}</p>}
    </form>
  );
}
