"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import {
  cancelPayout, confirmPayoutPaid, openManualPayout, openServerPayout, releasePayout,
} from "@/app/actions/payouts";

// Staff working the payout queue.
//
// Two clicks, never one. `Open` gathers the lines and files them; `Release`
// hands the money to the provider. Collapsing those into a single button would
// make the review step optional, and the review step is the entire reason a
// human is in this loop at all.

type Line = { id: string; label: string; amount: number; kind: string };
type P = {
  id: string; guildId: string; guildName: string | null; status: string;
  total: number; currency: string; createdAt: string; paidAt: string | null;
  providerKey: string | null; providerRef: string | null; collectUrl: string | null;
  failedReason: string | null; note: string | null; lines: Line[];
};

const usd = (n: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);

const TONE: Record<string, string> = {
  requested: "#fbbf24", approved: "#a78bfa", processing: "#22d3ee",
  paid: "#34d399", failed: "#fb7185", cancelled: "#94a3b8", draft: "#94a3b8",
};

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok?: true; error?: string; message?: string }>) => start(async () => {
    setMsg(null);
    const res = await fn();
    if (res.error) setMsg({ tone: "err", text: res.error });
    else { setMsg({ tone: "ok", text: res.message ?? "Done." }); router.refresh(); }
  });
  return { pending, msg, run };
}

/**
 * The per-row button on the "earned and unpaid" table.
 *
 * A NAMED export, not a property hung off the default one. Attaching
 * `PayoutQueue.OpenButton = OpenButton` looks tidy and renders as `undefined`
 * from a server component: what a server component imports across the client
 * boundary is a reference proxy, not the function object, so properties added
 * to it simply are not there.
 */
export function OpenButton({ guildId, disabled }: { guildId: string; disabled?: boolean }) {
  const { pending, run } = useRun();
  return (
    <button onClick={() => run(() => openServerPayout(guildId))} disabled={pending || disabled}
      className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-bold text-cyan-100 disabled:opacity-40">
      Open payout
    </button>
  );
}

export default function PayoutQueue({ payouts, guilds, providerLabel, manual }: {
  payouts: P[];
  guilds: { guildId: string; name: string }[];
  providerLabel: string;
  manual: boolean;
}) {
  const { pending, msg, run } = useRun();
  const [showManual, setShowManual] = useState(false);
  const field = "input-cosmic !py-1 text-xs";

  return (
    <div className="mt-4 space-y-4">
      {msg && (
        <div className={`rounded-xl border px-3 py-2 text-sm ${
          msg.tone === "ok" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-rose-400/30 bg-rose-500/10 text-rose-200"}`}>
          {msg.text}
        </div>
      )}

      <div>
        <button onClick={() => setShowManual((v) => !v)} className="text-xs text-cyan-300 hover:underline">
          {showManual ? "Hide" : "Pay something that isn't in the ledger"}
        </button>
        {showManual && (
          <form action={(fd) => run(() => openManualPayout(fd))}
            className="mt-2 flex flex-wrap items-end gap-2 rounded-2xl border border-white/10 bg-black/25 p-3">
            <label className="text-[10px] uppercase tracking-widest text-muted">
              Server
              <select name="guildId" required className={`${field} mt-0.5 block w-56`}>
                <option value="">Pick a server…</option>
                {guilds.map((g) => <option key={g.guildId} value={g.guildId}>{g.name}</option>)}
              </select>
            </label>
            <label className="text-[10px] uppercase tracking-widest text-muted">
              Type
              <select name="kind" defaultValue="bonus" className={`${field} mt-0.5 block w-32`}>
                <option value="bonus">Bonus</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </label>
            <label className="min-w-[16rem] flex-1 text-[10px] uppercase tracking-widest text-muted">
              What it&apos;s for — the owner reads this
              <input name="label" required placeholder="e.g. Launch bonus for hitting 1,000 linked" className={`${field} mt-0.5 block w-full`} />
            </label>
            <label className="text-[10px] uppercase tracking-widest text-muted">
              Amount
              <input name="amount" type="number" step="0.01" min="0.01" required className={`${field} mt-0.5 block w-28`} />
            </label>
            <button disabled={pending} className="rounded-full bg-cyan-500/25 px-4 py-1.5 text-xs font-bold text-cyan-100">Open</button>
          </form>
        )}
      </div>

      {payouts.length === 0 ? (
        <p className="text-sm text-muted">Nothing in the queue.</p>
      ) : payouts.map((p) => (
        <div key={p.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <b>{p.guildName ?? p.guildId}</b>
            <span className="text-lg font-black tabular-nums text-emerald-300">{usd(p.total, p.currency)}</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: `${TONE[p.status] ?? "#94a3b8"}22`, color: TONE[p.status] ?? "#94a3b8" }}>{p.status}</span>
            {p.providerRef && <span className="text-[11px] text-muted">{p.providerKey} · <code className="text-cyan-300">{p.providerRef}</code></span>}
            <span className="ml-auto text-[11px] text-muted">
              {new Date(p.paidAt ?? p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>

          {p.failedReason && (
            <div className="mt-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {p.failedReason}
            </div>
          )}

          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-cyan-300 hover:underline">{p.lines.length} lines</summary>
            <div className="mt-1.5 space-y-1 rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs">
              {p.lines.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3">
                  <span className={l.amount < 0 ? "text-emerald-200" : "text-muted"}>{l.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{usd(l.amount, p.currency)}</span>
                </div>
              ))}
            </div>
          </details>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            {(p.status === "requested" || p.status === "failed") && (
              <>
                <button onClick={() => run(() => releasePayout(p.id))} disabled={pending}
                  className="pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white"
                  style={{ background: "linear-gradient(90deg,#8b5cf6,#22d3ee)" }}>
                  {manual ? "Approve for manual transfer" : `Release via ${providerLabel}`}
                </button>
                <button onClick={() => run(() => cancelPayout(p.id))} disabled={pending}
                  className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-muted hover:text-ink">Cancel</button>
              </>
            )}
            {(p.status === "approved" || p.status === "processing") && (
              <>
                {p.collectUrl && (
                  <a href={p.collectUrl} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 hover:underline">
                    Collection link →
                  </a>
                )}
                <form action={(fd) => run(() => confirmPayoutPaid(p.id, fd))} className="flex flex-wrap items-end gap-2">
                  <input name="ref" placeholder="transfer reference" className={`${field} w-44`} />
                  <button disabled={pending} className="pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white"
                    style={{ background: "linear-gradient(90deg,#10b981,#22d3ee)" }}>Mark paid</button>
                </form>
              </>
            )}
            {p.status === "paid" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                <Icon name="check" size={13} /> Sent{p.providerRef ? ` · ${p.providerRef}` : ""}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
