"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { requestWithdrawalAction, type WalletState } from "@/app/actions/server-wallet";

// B89.1 / B90.9 — the wallet IS the billing page.
//
// One tab, both directions. Money arrives from the weekly pool and leaves two
// ways: withdrawn to a bank, or spent back into the server on a private
// challenge. Splitting those into "earnings" and "billing" would mean an owner
// deciding whether they can afford a challenge on one page using a number
// printed on another.
//
// The number that governs everything here is AVAILABLE, and it is the only one
// rendered big. Earned is history; available is what they can act on. The three
// subtractions are shown next to it rather than in a footnote, because a
// balance that is smaller than the earnings above it and does not say why is
// the shape of a support ticket.

export type WalletView = {
  guildId: string;
  earned: number;
  paid: number;
  pending: number;
  spent: number;
  available: number;
};

export type StatementRowView = {
  at: string;
  kind: "earned" | "withdrawn" | "spent";
  label: string;
  amount: number;
  status?: string;
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const TONE: Record<StatementRowView["kind"], { color: string; icon: string; word: string }> = {
  earned: { color: "text-emerald-300", icon: "diamond", word: "In" },
  withdrawn: { color: "text-cyan-300", icon: "zap", word: "Out" },
  spent: { color: "text-violet-300", icon: "trophy", word: "Spent" },
};

export default function ServerWallet({
  wallet, statement, minWithdrawal, hasPayoutMethod, holdPhrase,
}: {
  wallet: WalletView;
  statement: StatementRowView[];
  minWithdrawal: number;
  hasPayoutMethod: boolean;
  holdPhrase: string;
}) {
  return (
    <div className="space-y-6">
      <div className="glass border border-emerald-400/25 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted">Your balance</div>
            <div className="mt-1 text-4xl font-black tabular-nums text-emerald-300">{usd(wallet.available)}</div>
            <p className="mt-1 text-xs text-muted">
              Yours to withdraw, or to spend on a challenge for your own members.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fig label="Earned from the pool" value={usd(wallet.earned)} />
            <Fig label="Already paid to you" value={usd(wallet.paid)} sub />
            <Fig label="On its way out" value={usd(wallet.pending)} sub />
            <Fig label="Spent on challenges" value={usd(wallet.spent)} sub />
          </div>
        </div>
        {/* The arithmetic, written out. Every term above is a sum over things
            that already happened, so an owner can check the balance rather
            than believe it. */}
        <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-muted">
          {usd(wallet.earned)} earned − {usd(wallet.paid)} paid − {usd(wallet.pending)} on its way
          − {usd(wallet.spent)} spent = <b className="text-ink">{usd(wallet.available)}</b>.
          Nothing here is a stored number; every line is added up from the weeks and the charges below.
        </p>
        <p className="mt-2 text-[11px] text-muted">{holdPhrase}</p>
      </div>

      <Withdraw
        guildId={wallet.guildId}
        available={wallet.available}
        pending={wallet.pending}
        min={minWithdrawal}
        hasPayoutMethod={hasPayoutMethod}
      />

      <div className="glass p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold">Statement</h3>
          <span className="text-[11px] uppercase tracking-widest text-muted">newest first</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Every movement, both directions. A week you earned and then withdrew shows as two lines,
          not one — you should be able to see both events, not their net.
        </p>
        {statement.length === 0 ? (
          <p className="mt-5 text-sm text-muted">
            Nothing yet. The first line appears the Monday after your server carries a challenge.
          </p>
        ) : (
          <div className="mt-4 space-y-1.5">
            {statement.map((r, i) => {
              const t = TONE[r.kind];
              return (
                <div key={`${r.kind}-${r.at}-${i}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5">
                    <Icon name={t.icon} size={12} className={t.color} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.label}</div>
                    <div className="text-[11px] text-muted">
                      {new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {r.status && r.status !== "paid" ? ` · ${r.status}` : ""}
                    </div>
                  </div>
                  <div className={`shrink-0 text-sm font-black tabular-nums ${t.color}`}>
                    {r.amount > 0 ? "+" : "−"}{usd(Math.abs(r.amount))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Withdraw({ guildId, available, pending, min, hasPayoutMethod }: {
  guildId: string; available: number; pending: number; min: number; hasPayoutMethod: boolean;
}) {
  const [state, act, busy] = useActionState<WalletState, FormData>(requestWithdrawalAction, undefined);
  const [amount, setAmount] = useState(String(available >= min ? available : min));

  const tooSmall = available < min;

  return (
    <form action={act} className="glass p-6">
      <input type="hidden" name="guildId" value={guildId} />
      <h3 className="font-bold">Take it out</h3>
      <p className="mt-1 text-xs text-muted">
        We open the transfer and a person here releases it. The moment you ask, the amount stops
        being spendable — so it can never go out twice.
      </p>

      {tooSmall ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs leading-relaxed text-muted">
          The smallest withdrawal is <b className="text-ink">{usd(min)}</b> — a transfer smaller than that
          spends most of itself in fees. Your {usd(available)} keeps sitting here until then, and you can
          still spend it on a challenge for your own members.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-[10px] uppercase tracking-widest text-muted">
              Amount
              <input
                name="amount" type="number" min={min} max={available} step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-cosmic !py-1 mt-0.5 block w-40 text-sm tabular-nums"
              />
            </label>
            <button
              type="button"
              onClick={() => setAmount(String(available))}
              className="mb-1 rounded-full border border-white/12 px-3 py-1 text-[11px] font-bold text-muted hover:text-ink"
            >
              All of it
            </button>
            <button
              disabled={busy || !hasPayoutMethod}
              className="money-btn pressable mb-0.5 rounded-full px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Asking…" : "Ask for it"}
            </button>
          </div>
          {!hasPayoutMethod && (
            <p className="mt-2 text-[11px] text-amber-200">
              Pick how you want to be paid first — the form is further down this page. We can&apos;t send
              money we have no route for.
            </p>
          )}
        </>
      )}

      {pending > 0 && (
        <p className="mt-3 text-[11px] text-cyan-200">
          {usd(pending)} is already on its way to you. It has to land before you can ask for another.
        </p>
      )}

      {state?.error && (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-rose-300">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{state.error}</span>
        </p>
      )}
      {state?.ok && (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-300">
          <Icon name="check" size={13} className="mt-0.5 shrink-0" /> <span>{state.message}</span>
        </p>
      )}
    </form>
  );
}

function Fig({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-0.5 text-sm font-black tabular-nums ${sub ? "text-muted" : ""}`}>{value}</div>
    </div>
  );
}
