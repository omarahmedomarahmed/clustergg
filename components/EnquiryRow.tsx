"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { updateEnquiry, type EnquiryState } from "@/app/actions/brand-enquiry";
import { money } from "@/lib/pricing";

export type Row = {
  id: string;
  company: string;
  contactName: string;
  email: string;
  phone: string | null;
  website: string | null;
  message: string;
  tier: string;
  games: number;
  addon: boolean;
  billing: string;
  quotedMonthly: number;
  status: string;
  note: string | null;
  createdAt: string;
};

const STATUS: Record<string, string> = {
  new: "border-cyan-400/50 bg-cyan-500/10 text-cyan-200",
  contacted: "border-amber-400/50 bg-amber-500/10 text-amber-200",
  won: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
  lost: "border-white/15 bg-white/5 text-muted",
};

// One enquiry, collapsed to a line until you open it.
//
// Collapsed shows only what decides whether to open it: who, how much, how long
// ago. The message and the staff note are behind the click, because a queue you
// have to scroll past four paragraphs to read is a queue nobody works.
export default function EnquiryRow({ row, currency }: { row: Row; currency: string }) {
  const [open, setOpen] = useState(row.status === "new");
  const [state, action, pending] = useActionState<EnquiryState, FormData>(updateEnquiry, {});

  const tier = row.tier === "reach" ? "Reach" : row.tier === "ultimate" ? "Ultimate" : "Challenge";
  const when = new Date(row.createdAt);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left p-4 flex items-center gap-4 hover:bg-white/[0.03]">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider shrink-0 ${STATUS[row.status] ?? STATUS.lost}`}>
          {row.status}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold block truncate">{row.company}</span>
          <span className="text-xs text-muted truncate block">
            {row.contactName ? `${row.contactName} · ` : ""}{row.email}
          </span>
        </span>
        <span className="text-right shrink-0 hidden sm:block">
          <span className="font-bold text-cyan-300 block">{money(row.quotedMonthly, currency)}/mo</span>
          <span className="text-[11px] text-muted">
            {tier}{row.games > 0 ? ` · ${row.games} ${row.games === 1 ? "game" : "games"}` : ""}{row.addon ? " · +broadcast" : ""}
          </span>
        </span>
        <span className="text-[11px] text-muted shrink-0 hidden md:block">
          {when.toLocaleDateString()}
        </span>
        <Icon name="chevronDown" size={16} className={`text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-white/10 p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Detail label="Email"><a href={`mailto:${row.email}`} className="text-cyan-300 hover:underline">{row.email}</a></Detail>
            {row.phone && <Detail label="Phone">{row.phone}</Detail>}
            {row.website && (
              <Detail label="Website">
                <a href={row.website} target="_blank" rel="noreferrer noopener" className="text-cyan-300 hover:underline break-all">{row.website}</a>
              </Detail>
            )}
            <Detail label="Billing">{row.billing === "yearly" ? "Annual" : "Monthly"}</Detail>
            <Detail label="Plan">{tier}{row.games > 0 ? ` · ${row.games} games` : ""}{row.addon ? " · Sunday broadcast" : ""}</Detail>
            <Detail label="Sent">{when.toLocaleString()}</Detail>
          </div>

          {row.message && (
            <div className="rounded-xl bg-black/25 border border-white/10 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">What they wrote</div>
              {/* Rendered as text, never as markup — this is an anonymous submission. */}
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{row.message}</p>
            </div>
          )}

          <form action={action} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={row.id} />
            <div>
              <label className="text-xs text-muted block mb-1">Status</label>
              <select name="status" defaultValue={row.status} className="input-cosmic !w-auto">
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs text-muted block mb-1">Internal note</label>
              <input name="note" defaultValue={row.note ?? ""} className="input-cosmic" placeholder="Who's on it, what was agreed…" />
            </div>
            <button disabled={pending} className="ghost-btn pressable rounded-full px-5 py-2.5 text-sm disabled:opacity-60">
              {pending ? "Saving…" : "Save"}
            </button>
            {state?.ok && <span className="text-xs text-emerald-300">{state.ok}</span>}
            {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
          </form>
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-muted block">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}
