"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { moveBetweenVaults, type TransferState } from "@/app/actions/vaults";
import { VAULTS, type Vault } from "@/lib/vaults";

const LABEL: Record<Vault, string> = {
  prize: "Prize vault",
  server: "Server pool",
  cp: "CP vault",
  cluster: "Cluster revenue",
};

export default function VaultTransfer({ balances }: { balances: Record<Vault, number> }) {
  const [state, act, busy] = useActionState<TransferState, FormData>(moveBetweenVaults, undefined);
  const [from, setFrom] = useState<Vault>("cluster");
  const [to, setTo] = useState<Vault>("cp");
  const [amount, setAmount] = useState("");

  const n = Number(amount);
  // Shown, not enforced. The server owns the refusal; this exists so an
  // operator does not discover the problem after pressing the button.
  const over = n > 0 && n > balances[from];
  const same = from === to;

  return (
    <form action={act} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <label className="block text-xs">
          <span className="mb-1 block text-muted">From</span>
          <select name="from" value={from} onChange={(e) => setFrom(e.target.value as Vault)} className="input-cosmic w-full">
            {VAULTS.map((v) => (
              <option key={v} value={v}>
                {LABEL[v]} — {balances[v].toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
              </option>
            ))}
          </select>
        </label>
        <div className="hidden items-end pb-2.5 sm:flex">
          <Icon name="link" size={14} className="text-muted" />
        </div>
        <label className="block text-xs">
          <span className="mb-1 block text-muted">To</span>
          <select name="to" value={to} onChange={(e) => setTo(e.target.value as Vault)} className="input-cosmic w-full">
            {VAULTS.map((v) => <option key={v} value={v}>{LABEL[v]}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
        <label className="block text-xs">
          <span className="mb-1 block text-muted">Amount (USD)</span>
          <input
            name="amount" type="number" min="0.01" step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-cosmic w-full tabular-nums" required
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-muted">Why</span>
          <input
            name="reason" required
            placeholder="e.g. topping up the CP vault ahead of a quiet sales month"
            className="input-cosmic w-full"
          />
        </label>
      </div>

      {/* An overdraw is allowed by the ledger — the rows would simply take a
          vault negative — and that is the right behaviour for a ledger and the
          wrong thing to do by accident. Warned, not blocked. */}
      {over && (
        <p className="text-[11px] text-amber-200">
          <Icon name="alert" size={11} className="mr-1 inline" />
          That is more than {LABEL[from]} holds. The ledger will take it negative rather than refuse —
          which is correct for a ledger, and almost never what you meant.
        </p>
      )}

      <button
        disabled={busy || same || !(n > 0)}
        className="pressable rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold disabled:opacity-40"
      >
        {busy ? "Moving…" : same ? "Pick two different vaults" : "Move it"}
      </button>

      {state?.error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{state.message}</p>
      )}
    </form>
  );
}
