"use client";

import { useActionState } from "react";
import { saveConnectVisibility, type ActionState } from "@/app/actions/admin";
import GameLogo from "@/components/GameLogo";

type Row = { id: string; name: string; game: string; live: boolean; logoUrl: string | null; hidden: boolean };

// Admin toggles for which providers appear on the connect + onboarding pickers.
export default function ConnectVisibilityEditor({ rows }: { rows: Row[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveConnectVisibility, undefined);
  const allIds = rows.map((r) => r.id).join(",");

  return (
    <form action={formAction}>
      <input type="hidden" name="allIds" value={allIds} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => (
          <label key={r.id}
            className="flex items-center gap-3 rounded-xl border border-violet-400/15 bg-black/20 p-3 cursor-pointer hover:border-violet-400/40 transition-colors">
            <input type="checkbox" name="visible" value={r.id} defaultChecked={!r.hidden} className="accent-cyan-500 h-4 w-4 shrink-0" />
            <GameLogo logoUrl={r.logoUrl} name={r.game || r.name} size={32} rounded="rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold truncate">{r.name}</span>
              <span className={`block text-[10px] uppercase tracking-wider ${r.live ? "text-emerald-300" : "text-amber-300/80"}`}>
                {r.live ? "Live" : "Needs key"}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button disabled={pending} className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">
          {pending ? "Saving…" : "Save visibility"}
        </button>
        {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
