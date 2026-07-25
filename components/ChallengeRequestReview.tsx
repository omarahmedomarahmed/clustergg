"use client";

import { useActionState } from "react";
import {
  approveChallengeRequest, rejectChallengeRequest, staffSetChallengeState,
  type RequestActionState,
} from "@/app/actions/challenge-requests";

// Reviewing what a server asked us to run for them.
//
// Approve is the load-bearing button on this page: it creates the challenge,
// mints the entry key, and posts it into their server. So it shows exactly what
// will go live — the editable name and length — rather than being a bare yes.

export function RequestCard({ req, server }: {
  req: {
    id: string; title: string; game: string; description: string; days: number;
    prizeValue: number; prizeCurrency: string; status: string; challengeId: string | null;
    createdAt: string; requestedBy: string | null;
  };
  server: { name: string; iconUrl: string | null; linked: number } | null;
}) {
  const [approveState, approve, approving] = useActionState<RequestActionState, FormData>(approveChallengeRequest, null);
  const [rejectState, reject, rejecting] = useActionState<RequestActionState, FormData>(rejectChallengeRequest, null);
  const state = approveState ?? rejectState;
  const pending = req.status === "pending";

  return (
    <div className={`glass p-6 border ${pending ? "border-amber-400/30" : "border-white/10"}`}>
      <div className="flex items-start gap-4 flex-wrap">
        {server?.iconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={server.iconUrl} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-bold text-lg">{req.title}</div>
          <div className="text-xs text-muted">
            {req.game} · {req.days} days · requested by {req.requestedBy ?? "a server admin"}
            {server ? ` · ${server.name} (${server.linked.toLocaleString()} linked)` : ""}
          </div>
          {req.description && <p className="text-sm text-muted mt-2">{req.description}</p>}
          {req.prizeValue > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-200">
              {req.prizeValue.toLocaleString()} {req.prizeCurrency} prize pool — their money
            </div>
          )}
        </div>
        <StatusChip status={req.status} />
      </div>

      {pending ? (
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <form action={approve} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="requestId" value={req.id} />
            <label className="text-xs text-muted">
              <span className="block mb-1">Name that goes live</span>
              <input name="title" defaultValue={req.title} className="input-cosmic w-64" />
            </label>
            <label className="text-xs text-muted">
              <span className="block mb-1">Days</span>
              <input name="days" type="number" min={1} max={90} defaultValue={req.days} className="input-cosmic w-20" />
            </label>
            <button
              disabled={approving}
              className="grad-btn pressable rounded-full px-6 py-2.5 font-bold disabled:opacity-60"
            >
              {approving ? "Approving…" : "Approve & send key"}
            </button>
          </form>
          <form action={reject} className="flex items-end gap-2">
            <input type="hidden" name="requestId" value={req.id} />
            <input name="note" placeholder="Reason (optional)" className="input-cosmic w-48" />
            <button
              disabled={rejecting}
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm hover:bg-white/5 disabled:opacity-60"
            >
              Reject
            </button>
          </form>
        </div>
      ) : req.challengeId ? (
        <ChallengeControls challengeId={req.challengeId} />
      ) : null}

      {state?.ok && <p className="mt-3 text-sm text-emerald-300 break-all">{state.ok}</p>}
      {state?.error && <p className="mt-3 text-sm text-amber-300">{state.error}</p>}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone = status === "approved"
    ? "border-emerald-400/40 text-emerald-300 bg-emerald-500/10"
    : status === "rejected"
      ? "border-white/15 text-muted bg-black/30"
      : "border-amber-400/50 text-amber-200 bg-amber-500/10";
  return (
    <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-widest ${tone}`}>
      {status}
    </span>
  );
}

// Staff can run any challenge — the same pause/resume/end a server owner gets
// in Discord for their own.
export function ChallengeControls({ challengeId, status }: { challengeId: string; status?: string }) {
  const [state, act, busy] = useActionState<RequestActionState, FormData>(staffSetChallengeState, null);
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {(["paused", "active", "completed"] as const)
          .filter((s) => s !== status)
          .map((s) => (
            <form action={act} key={s}>
              <input type="hidden" name="challengeId" value={challengeId} />
              <input type="hidden" name="state" value={s} />
              <button
                disabled={busy}
                className={`rounded-full border px-4 py-2 text-xs font-semibold disabled:opacity-60 ${
                  s === "completed"
                    ? "border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
                    : "border-white/15 hover:bg-white/5"
                }`}
              >
                {s === "paused" ? "Pause" : s === "active" ? "Resume" : "End now"}
              </button>
            </form>
          ))}
      </div>
      {state?.ok && <p className="mt-2 text-sm text-emerald-300">{state.ok}</p>}
      {state?.error && <p className="mt-2 text-sm text-amber-300">{state.error}</p>}
    </div>
  );
}
