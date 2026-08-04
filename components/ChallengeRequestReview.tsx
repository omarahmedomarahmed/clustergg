"use client";

import Link from "next/link";

import { useActionState } from "react";
import {
  approveChallengeRequest, rejectChallengeRequest, staffSetChallengeState,
  type RequestActionState,
} from "@/app/actions/challenge-requests";

// Reviewing what a server or a brand asked us to run.
//
// Approve creates the challenge as a DRAFT and stops. It used to create it live
// and announce it to every server in the same click, which meant a requester's
// draft copy went out to the whole network before anybody read it — and a
// Discord announcement cannot be unsent. So this button now says what it does,
// and the next step is the editor.

export function RequestCard({ req, server, brand }: {
  req: {
    id: string; title: string; game: string; description: string; days: number;
    prizeValue: number; prizeCurrency: string; status: string; challengeId: string | null;
    createdAt: string; requestedBy: string | null;
    /** Week n of a bought campaign, when this came from a brand. */
    slotIndex: number | null; slots: number | null;
  };
  server: { name: string; iconUrl: string | null; linked: number } | null;
  /** Set when a BRAND paid for this slot rather than a server asking for it. */
  brand: { name: string; logoUrl: string | null; total: number } | null;
}) {
  const [approveState, approve, approving] = useActionState<RequestActionState, FormData>(approveChallengeRequest, null);
  const [rejectState, reject, rejecting] = useActionState<RequestActionState, FormData>(rejectChallengeRequest, null);
  const state = approveState ?? rejectState;
  const pending = req.status === "pending";

  return (
    <div className={`glass p-6 border ${pending ? "border-amber-400/30" : "border-white/10"}`}>
      <div className="flex items-start gap-4 flex-wrap">
        {/* Whose request this is, at a glance. A brand's and a server's land in
            the same queue because both end in a challenge with our name on it,
            but they are reviewed with different questions — so the two are
            never rendered the same way. */}
        {(brand?.logoUrl ?? server?.iconUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(brand?.logoUrl ?? server?.iconUrl) as string} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          {brand && (
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-violet-400/45 bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-200">
              Paid · {brand.name}
            </div>
          )}
          <div className="font-bold text-lg">{req.title}</div>
          <div className="text-xs text-muted">
            {brand
              ? `${req.game} · ${req.days} days · week ${(req.slotIndex ?? 0) + 1} of ${req.slots ?? 4} · $${brand.total.toLocaleString()} campaign`
              : `${req.game} · ${req.days} days · requested by ${req.requestedBy ?? "a server admin"}${server ? ` · ${server.name} (${server.linked.toLocaleString()} linked)` : ""}`}
          </div>
          {req.description && <p className="text-sm text-muted mt-2">{req.description}</p>}
          {req.prizeValue > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-200">
              {req.prizeValue.toLocaleString()} {req.prizeCurrency} prize pool — {brand ? "already paid for" : "their money"}
            </div>
          )}
          {brand && (
            <p className="mt-2 text-[11px] leading-snug text-violet-200/80">
              Approving this posts it publicly to every eligible server. To keep it to chosen servers
              instead, approve it and then set its audience on the challenge itself.
            </p>
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
              className="glow-btn pressable rounded-full px-6 py-2.5 font-bold disabled:opacity-60"
            >
              {/* A brand's challenge is public and has no entry key to send —
                  promising one on the button would be a lie about what the
                  click does. */}
              {approving ? "Approving…" : "Approve — open in editor"}
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

      {state?.ok && (
        <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5">
          <p className="text-sm text-emerald-200">{state.ok}</p>
          {state.editHref && (
            <Link href={state.editHref}
              className="glow-btn pressable mt-2 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold text-white">
              Open the editor →
            </Link>
          )}
        </div>
      )}
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
