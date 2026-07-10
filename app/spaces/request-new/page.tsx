"use client";

import { useActionState } from "react";
import { requestNewSpace } from "@/app/actions/social";

export default function RequestSpacePage() {
  const [state, action, pending] = useActionState(requestNewSpace, undefined);
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="glass p-8">
        <h1 className="text-2xl font-bold">Propose a <span className="grad-text">new space</span></h1>
        <p className="text-sm text-muted mt-2">
          Mission Control reviews every proposal. Approved spaces launch with their own feed —
          and a leaderboard if the game has an API.
        </p>
        {state?.ok ? (
          <div className="mt-6 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-4 text-emerald-200">
            🛰️ Transmission received! Your request is in the review queue — you&apos;ll get a
            notification when it&apos;s decided.
          </div>
        ) : (
          <form action={action} className="mt-6 space-y-4">
            <input name="proposedName" required placeholder="Space name (e.g. Rocket League)" className="input-cosmic" />
            <textarea
              name="reason" required rows={4} placeholder="Why should this space exist? Does the game have a public stats API?"
              className="input-cosmic resize-none"
            />
            {state?.error && <p className="text-sm text-rose-300">{state.error}</p>}
            <button disabled={pending} className="glow-btn rounded-full px-8 py-2.5 font-semibold text-white">
              {pending ? "Transmitting…" : "Submit proposal"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
