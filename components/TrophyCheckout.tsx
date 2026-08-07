"use client";

import { useActionState, useEffect, useRef } from "react";
import Icon from "@/components/Icon";
import Cp from "@/components/Cp";
import { purchaseTrophy, type BuyState } from "@/app/actions/marketplace";
import type { MarketTrophy } from "@/lib/marketplace";

// The step that did not exist (B49, absorbing B5/B6/B19).
//
// Before this, "Spend 50,000" was a submit button. A click moved the points and
// the first thing a gamer knew about it was a different balance.
//
// So: one modal — what it is, what it costs, the balance before and after, one
// confirm.
//
// The gift half of this component is deleted (B72.3), and with it the search
// box, the recipient card and the type-ahead against `/api/gamers/search`. That
// endpoint is gone too: with nothing to gift, a signed-in gamer-name lookup is
// a member directory with no purpose, and the standing rule is that the gamer
// directory is admin-only.
//
// It looks like the platform rather than like a browser dialog, which is not
// decoration: a native `confirm()` is the thing people click through fastest.

const num = (n: number) => n.toLocaleString();

export default function TrophyCheckout({
  trophy, balance, onClose, onDone,
}: {
  trophy: MarketTrophy;
  balance: number;
  onClose: () => void;
  /** The new balance, so the shelf behind the modal updates without a reload. */
  onDone: (state: NonNullable<BuyState>) => void;
}) {
  const [state, buy, buying] = useActionState<BuyState, FormData>(purchaseTrophy, undefined);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const after = balance - trophy.cpPrice;
  const short = after < 0;
  const ready = !short;

  // Escape closes, and focus starts inside — a modal you cannot leave with the
  // keyboard is a modal that traps somebody mid-purchase.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    boxRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Hand the result back and close, once.
  useEffect(() => {
    if (state?.ok) { onDone(state); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok]);

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Buy ${trophy.name}`}
        data-checkout={trophy.id}
        className="glass max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/12 outline-none sm:rounded-3xl">

        {/* What you are buying */}
        <div className="flex items-start gap-3 border-b border-white/8 p-4">
          <div className="h-20 w-20 shrink-0 rounded-2xl bg-black/40 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={trophy.imageUrl} alt={trophy.name} className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-black">{trophy.name}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted">{trophy.tier}</div>
            {trophy.value > 0 && (
              <div className="mt-1 text-sm font-black text-amber-200">
                ${num(trophy.value)} <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/70">redeems for cash</span>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted hover:text-ink">
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* What it costs — before, price, after. All three, because a balance
            you have to do arithmetic on is a balance people get wrong. */}
        <div className="grid grid-cols-3 gap-px border-b border-white/8 bg-white/5 text-center">
          {[
            ["Balance now", <Cp key="b" amount={balance} />, "text-ink"],
            ["This costs", <Cp key="p" amount={trophy.cpPrice} />, "text-amber-200"],
            ["Left after", <Cp key="a" amount={Math.max(0, after)} />, short ? "text-rose-300" : "text-emerald-200"],
          ].map(([label, node, cls]) => (
            <div key={String(label)} className="bg-[#0b0f1a] px-2 py-3">
              <div className="text-[9px] uppercase tracking-wider text-muted">{label as string}</div>
              <div className={`mt-0.5 text-sm font-bold ${cls as string}`}>{node as React.ReactNode}</div>
            </div>
          ))}
        </div>

        <form action={buy} className="space-y-3 p-4">
          <input type="hidden" name="trophyId" value={trophy.id} />
          {short && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              You need <Cp amount={trophy.cpPrice - balance} /> more. <a href="/quests" className="underline">Earn it on a quest</a>.
            </div>
          )}
          {state?.error && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{state.error}</div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="rounded-full bg-white/5 px-4 py-2.5 text-xs font-semibold text-muted hover:text-ink">
              Cancel
            </button>
            <button disabled={!ready || buying} data-confirm
              className="flex-1 rounded-full bg-emerald-500/25 px-4 py-2.5 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40">
              {buying ? "Working…" : `Confirm — spend ${num(trophy.cpPrice)}`}
            </button>
          </div>

          {/* The two things that make the economy trustworthy, said where the
              money moves rather than in a footer (B6). */}
          <p className="text-[10px] leading-relaxed text-muted">
            <Icon name="check" size={10} className="mr-1 inline text-emerald-300" />
            Spending points never lowers your level.
            <br />
            <Icon name="check" size={10} className="mr-1 inline text-emerald-300" />
            We never see your bank details — you choose how to get paid on the provider&apos;s own page.
          </p>
        </form>
      </div>
    </div>
  );
}
