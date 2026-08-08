"use client";

import { useActionState } from "react";
import Icon from "@/components/Icon";
import { createInvoice } from "@/app/actions/billing";

// Opening a month's bill.
//
// This was an inline server-action form: `action={async (fd) => { await
// createInvoice(fd) }}`. The action's return value was discarded, so every
// refusal it could produce was invisible — press the button, nothing happens,
// no invoice, no message. An action that can say no needs somewhere to say it,
// or its refusal is indistinguishable from a broken button.
//
// That mattered the moment `createInvoice` learned to refuse a brand with no
// live campaign, which is the ordinary case now that the placements base is
// retired: without this component the fix would have turned one silent bug
// (a $0 invoice) into another (a button that does nothing).

export default function OpenInvoice({ brands }: { brands: { id: string; name: string }[] }) {
  type Res = Awaited<ReturnType<typeof createInvoice>>;
  const [state, act, busy] = useActionState<Res | undefined, FormData>(
    async (_prev, fd) => createInvoice(fd),
    undefined,
  );

  return (
    <div className="mt-4">
      <form action={act} className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
        <label className="text-[10px] uppercase tracking-widest text-muted">
          Brand
          <select name="brandId" required className="input-cosmic !py-1 mt-0.5 block w-56 text-xs">
            <option value="">Pick a brand…</option>
            {brands.map((br) => <option key={br.id} value={br.id}>{br.name}</option>)}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-widest text-muted">
          Terms (days)
          <input name="termsDays" type="number" min={0} max={120} defaultValue={30} className="input-cosmic !py-1 mt-0.5 block w-24 text-xs" />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted">
          <input type="checkbox" name="addon" /> Sunday Broadcast add-on
        </label>
        <button
          disabled={busy}
          className="glow-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Opening…" : "Open this month's bill"}
        </button>
      </form>

      {state?.error && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] px-3 py-2.5 text-xs leading-relaxed text-amber-100">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{state.error}</span>
        </p>
      )}
      {state?.message && !state.error && (
        <p className="mt-2 flex items-center gap-2 text-xs text-emerald-300">
          <Icon name="check" size={13} /> {state.message}
        </p>
      )}
    </div>
  );
}
