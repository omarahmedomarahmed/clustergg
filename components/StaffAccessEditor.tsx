"use client";

import { useActionState } from "react";
import { saveStaffAccess } from "@/app/actions/admin";
import { GRANTABLE_AREAS } from "@/lib/areas";
import type { ActionState } from "@/app/actions/admin";
import Icon from "@/components/Icon";

// Admin toggles which delegated admin areas the staff role can access. Staff-
// default areas (planets, games, challenges, content…) are always on; roles &
// settings are never grantable.
export default function StaffAccessEditor({ granted }: { granted: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (_prev, fd) => saveStaffAccess(fd), undefined,
  );
  const set = new Set(granted);

  return (
    <form action={action} className="glass p-5">
      <h2 className="font-bold flex items-center gap-2 mb-1"><Icon name="shield" size={16} className="text-amber-300" /> Staff role access</h2>
      <p className="text-sm text-muted mb-4">
        The staff role can always edit planets, games, challenges, quests, trophies, leaderboards, site content, backgrounds and partners.
        Tick the sensitive areas below to also delegate them to staff. Roles &amp; Settings stay admin-only.
      </p>
      <div className="space-y-2 mb-4">
        {GRANTABLE_AREAS.map((a) => (
          <label key={a.key} className="flex items-start gap-3 rounded-xl border border-white/10 p-3 cursor-pointer hover:border-cyan-400/30">
            <input type="checkbox" name="areas" value={a.key} defaultChecked={set.has(a.key)} className="mt-0.5 accent-cyan-500 h-4 w-4" />
            <div>
              <div className="text-sm font-semibold">{a.label}</div>
              <div className="text-xs text-muted">{a.desc}</div>
            </div>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save staff access"}
        </button>
        {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
