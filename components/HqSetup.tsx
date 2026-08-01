"use client";

import { useActionState } from "react";
import Icon from "@/components/Icon";
import { saveHqServer, buildHqServer, type BotActionState } from "@/app/actions/discord";

export type PlanRow = { category: string; name: string; kind: string; exists: boolean };

export function HqServerForm({ guildId }: { guildId: string | null }) {
  const [state, act, busy] = useActionState<BotActionState, FormData>(saveHqServer, undefined);
  return (
    <form action={act} className="space-y-3">
      <div>
        <label className="text-xs text-muted block mb-1.5">Our Discord server ID</label>
        <div className="flex flex-wrap gap-2">
          <input
            name="guildId" defaultValue={guildId ?? ""} inputMode="numeric"
            placeholder="e.g. 1234567890123456789"
            className="input-cosmic w-full sm:w-80 font-mono text-sm"
          />
          <button disabled={busy} className="ghost-btn pressable rounded-full px-6 py-2.5 font-semibold disabled:opacity-60">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="text-[11px] text-muted mt-2">
          Discord → User Settings → Advanced → Developer Mode, then right-click the server → Copy Server ID.
          Saving only records the id; nothing is created until you build.
        </p>
      </div>
      {state?.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
      {state?.error && <p className="text-sm text-amber-300">{state.error}</p>}
    </form>
  );
}

export function HqBuildButton({ toCreate, alreadySetUp, blocked }: {
  toCreate: number; alreadySetUp: boolean; blocked?: boolean;
}) {
  const [state, act, busy] = useActionState<BotActionState, FormData>(buildHqServer, undefined);
  return (
    <form action={act} className="space-y-3">
      {alreadySetUp && !blocked && (
        <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" name="force" className="accent-amber-500 mt-0.5" />
          <span>
            HQ is already built. Tick to run the same pass again — it only fills in channels that are
            missing and never touches or deletes what exists.
          </span>
        </label>
      )}
      <button
        disabled={busy || blocked || (toCreate === 0 && !alreadySetUp)}
        className="glow-btn pressable rounded-full px-6 py-2.5 font-bold disabled:opacity-60"
      >
        {busy ? "Building…"
          : blocked ? "Can't build yet"
            : toCreate > 0 ? `Build ${toCreate} missing channel${toCreate === 1 ? "" : "s"}` : "Nothing to build"}
      </button>
      {state?.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
      {state?.error && <p className="text-sm text-amber-300">{state.error}</p>}
    </form>
  );
}

// What the build would do, before it does it. Creating channels in a real
// server is the least reversible thing the bot does, so it is shown in full
// first rather than described.
export function HqPlanTable({ rows, preview }: { rows: PlanRow[]; preview?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      {rows.map((r, i) => (
        r.kind === "category" ? (
          <div key={i} className="bg-white/5 px-4 py-2 text-[11px] uppercase tracking-widest font-bold flex items-center justify-between gap-3">
            <span>{r.name}</span>
            <Mark exists={r.exists} preview={preview} />
          </div>
        ) : (
          <div key={i} className="px-4 py-1.5 text-sm flex items-center justify-between gap-3 border-t border-white/5">
            <span className="text-muted truncate">
              <span className="text-muted/60">{r.kind === "voice" ? <Icon name="volume" size={11} className="inline" /> : r.kind === "role" ? "@" : "#"}{" "}</span>
              {r.name}
            </span>
            <Mark exists={r.exists} preview={preview} />
          </div>
        )
      ))}
    </div>
  );
}

function Mark({ exists, preview }: { exists: boolean; preview?: boolean }) {
  if (preview) return <span className="text-[11px] text-muted shrink-0">planned</span>;
  return exists
    ? <span className="text-[11px] text-muted shrink-0">exists</span>
    : <span className="text-[11px] text-emerald-300 font-semibold shrink-0">will create</span>;
}
