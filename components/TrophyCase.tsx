"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import { useTr } from "@/components/LocaleProvider";
import { requestRedeem, cancelRedeem, confirmRedeem } from "@/app/actions/trophies";
import type { TrophyAward, RedeemView } from "@/lib/trophies";

// The gamer's trophy case: a glorified trigger (feed card or profile button)
// opening a full popup — trophy balance as individual trophies, select &
// redeem with a payout method (USD→ACH, EGP→Wallet/InstaPay), live request
// tracking (pending → approved → paid with the admin's payment proof), and
// previous-trophies history. Mobile-first: full-screen sheet on phones.
export default function TrophyCase({
  awards, redeems, savedMethod, changesUsed, variant,
}: {
  awards: TrophyAward[];
  redeems: RedeemView[];
  savedMethod: { currency: string; method: string; details: Record<string, string> } | null;
  changesUsed: number;
  variant: "card" | "button";
}) {
  const tr = useTr();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<"shelf" | "payout">("shelf");
  const [currency, setCurrency] = useState<"USD" | "EGP">((savedMethod?.currency as "USD" | "EGP") || "USD");
  const [method, setMethod] = useState<string>(savedMethod?.method || "ach");
  const [details, setDetails] = useState<Record<string, string>>(savedMethod?.details ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setMounted(true), []);

  const shelf = awards.filter((a) => a.status !== "redeemed");
  const held = shelf.filter((a) => a.status === "held");
  const history = awards.filter((a) => a.status === "redeemed");
  const totalValue = useMemo(() => shelf.reduce((s, a) => s + a.value, 0), [shelf]);
  const selected = held.filter((a) => sel[a.id]);
  const selectedTotal = selected.reduce((s, a) => s + a.value, 0);
  const activeRedeems = redeems.filter((r) => r.status === "pending" || r.status === "approved");
  const locked = changesUsed >= 3;
  const place = (p: number) => (p === 1 ? tr("1st place") : p === 2 ? tr("2nd place") : tr("3rd place"));
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const submit = () => start(async () => {
    setError(null);
    const res = await requestRedeem({ awardIds: selected.map((a) => a.id), currency, method: method as "ach" | "wallet" | "instapay", details });
    if (res.error) { setError(res.error); return; }
    setSel({}); setStep("shelf"); router.refresh();
  });
  const act = (fn: () => Promise<{ ok?: true; error?: string }>) => start(async () => {
    setError(null);
    const res = await fn();
    if (res.error) setError(res.error); else router.refresh();
  });

  useEffect(() => {
    if (currency === "USD") setMethod("ach");
    else if (method === "ach") setMethod("wallet");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  const statusChip = (s: string) => {
    const map: Record<string, [string, string]> = {
      pending: [tr("Pending admin approval"), "#fbbf24"], approved: [tr("Approved — confirm payout"), "#22d3ee"],
      paid: [tr("Paid"), "#34d399"], rejected: [tr("Declined"), "#fb7185"], cancelled: [tr("Cancelled"), "#94a3b8"],
    };
    const [label, color] = map[s] ?? [s, "#94a3b8"];
    return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: `${color}22`, color }}>{label}</span>;
  };

  const trigger = variant === "card" ? (
    <button onClick={() => setOpen(true)}
      className="relative w-full overflow-hidden rounded-2xl border border-amber-400/30 p-4 text-left transition-transform hover:scale-[1.01] glow-sweep"
      style={{ background: "linear-gradient(100deg, rgba(251,191,36,0.12), rgba(4,5,26,0.7))" }}>
      <div className="flex items-center gap-3">
        {shelf[0]
          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={shelf[0].imageUrl} alt="" className="h-14 w-14 object-contain float-y shrink-0" />
          : <Icon name="trophy" size={34} className="text-amber-300 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="font-bold flex items-center gap-2">{tr("My trophies")}
            <span className="rounded-full bg-amber-400/20 text-amber-200 px-2 py-0.5 text-[11px] font-black">{shelf.length}</span>
          </div>
          <div className="text-xs text-muted mt-0.5">
            {totalValue > 0 ? <>{tr("Balance")} <b className="text-emerald-300">${totalValue.toLocaleString()}</b> · {tr("tap to view & redeem")}</> : tr("Win challenges to earn redeemable trophies")}
          </div>
        </div>
        {activeRedeems.length > 0 && (
          <span className="relative flex h-3 w-3 shrink-0"><span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 animate-ping opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" /></span>
        )}
        <Icon name="chevronRight" size={16} className="text-muted shrink-0" />
      </div>
    </button>
  ) : (
    <button onClick={() => setOpen(true)}
      className="pressable inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white"
      style={{ background: "linear-gradient(90deg, #f59e0b, #fbbf24)", boxShadow: "0 8px 22px -10px #f59e0b" }}>
      <Icon name="trophy" size={14} /> {tr("Redeem trophies")}
      {activeRedeems.length > 0 && <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-black/40" />}
    </button>
  );

  const popup = open && mounted ? createPortal(
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center sm:justify-center" onClick={() => setOpen(false)}>
      <div aria-hidden className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl border border-amber-400/25 bg-[#070826] p-5"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><Icon name="trophy" size={18} className="text-amber-300" /> {tr("My trophy case")}</h3>
          <button onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 text-white"><Icon name="x" size={16} /></button>
        </div>

        {/* Balance strip */}
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span>{shelf.length} {tr(shelf.length === 1 ? "trophy" : "trophies")}</span>
          <span className="font-bold text-emerald-300">${totalValue.toLocaleString()} {tr("total value")}</span>
          {selected.length > 0 && <span className="text-cyan-300 font-bold">{selected.length} {tr("selected")} · ${selectedTotal.toLocaleString()}</span>}
        </div>
        {error && <div className="mb-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

        {step === "shelf" && (
          <>
            {/* The shelf — tap to select redeemable trophies */}
            {shelf.length === 0 ? (
              <div className="rounded-2xl border border-white/10 p-6 text-center text-sm text-muted">{tr("No trophies yet — win a challenge podium to earn your first.")}</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {shelf.map((a) => {
                  const selectable = a.status === "held" && a.value > 0;
                  const on = !!sel[a.id];
                  return (
                    <button key={a.id} disabled={!selectable}
                      onClick={() => setSel((s) => ({ ...s, [a.id]: !s[a.id] }))}
                      className={`relative rounded-2xl border p-3 text-center transition-all ${on ? "scale-[1.03]" : ""} ${selectable ? "" : "opacity-75"}`}
                      style={{ borderColor: on ? "#34d399cc" : "rgba(255,255,255,0.12)", background: on ? "#10b98114" : "rgba(0,0,0,0.35)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.imageUrl} alt={a.name} className="mx-auto h-24 object-contain float-y" />
                      <div className="text-xs font-bold mt-1.5 truncate">{a.name}</div>
                      <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px] text-muted">
                        {a.gameLogoUrl && <GameLogo logoUrl={a.gameLogoUrl} name={a.game ?? ""} size={14} rounded="rounded" />}
                        <span className="truncate">{a.challengeTitle ?? tr("Challenge")}</span>
                      </div>
                      <div className="text-[10px] font-bold text-amber-300 mt-0.5">{place(a.placement)}</div>
                      {a.value > 0 && <span className="absolute top-1.5 right-1.5 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-black text-white">${a.value.toLocaleString()}</span>}
                      {a.status === "pending" && <span className="absolute top-1.5 left-1.5 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-black text-black uppercase">{tr("in redeem")}</span>}
                      {on && <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px] font-black ring-2 ring-[#070826]">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {held.length > 0 && (
              <button disabled={selected.length === 0 || pending} onClick={() => setStep("payout")}
                className="mt-4 w-full pressable rounded-full px-6 py-3 font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(90deg, #10b981, #22d3ee)", boxShadow: "0 10px 26px -12px #10b981" }}>
                {selected.length === 0 ? tr("Select trophies to redeem") : `${tr("Redeem")} ${selected.length} · $${selectedTotal.toLocaleString()}`}
              </button>
            )}

            {/* Active + past redeem requests */}
            {redeems.length > 0 && (
              <div className="mt-5">
                <div className="text-[10px] uppercase tracking-widest text-muted mb-2">{tr("Redeem requests")}</div>
                <div className="space-y-2">
                  {redeems.map((r) => (
                    <div key={r.id} className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-emerald-300">${r.amount.toLocaleString()} {r.currency}</b>
                        <span className="text-muted text-xs">{r.method === "ach" ? "ACH" : r.method === "wallet" ? tr("Mobile Wallet") : "InstaPay"} ···{r.last4}</span>
                        {statusChip(r.status)}
                        <span className="text-[10px] text-muted ml-auto">{fmt(r.createdAt)}</span>
                      </div>
                      {r.status === "pending" && (
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <span className="text-muted">{tr("Payout takes 5–7 business days after approval.")}</span>
                          <button onClick={() => act(() => cancelRedeem(r.id))} disabled={pending} className="text-rose-300 hover:underline ml-auto">{tr("Cancel")}</button>
                        </div>
                      )}
                      {r.status === "approved" && !r.gamerConfirmedAt && (
                        <div className="mt-2">
                          <p className="text-xs text-cyan-200 mb-2">{tr("Admin approved — please confirm your payout details ending in")} ···{r.last4}.</p>
                          <button onClick={() => act(() => confirmRedeem(r.id))} disabled={pending}
                            className="pressable rounded-full px-4 py-1.5 text-xs font-bold text-white" style={{ background: "linear-gradient(90deg, #06b6d4, #22d3ee)" }}>
                            {tr("Confirm & proceed")}
                          </button>
                        </div>
                      )}
                      {r.status === "approved" && r.gamerConfirmedAt && (
                        <p className="mt-1.5 text-xs text-muted">{tr("Confirmed — payment on the way (5–7 business days).")}</p>
                      )}
                      {r.status === "paid" && r.proofUrl && (
                        <a href={r.proofUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-300 hover:underline">
                          <Icon name="check" size={13} /> {tr("View payment confirmation")}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Previously redeemed trophies */}
            {history.length > 0 && (
              <div className="mt-5">
                <div className="text-[10px] uppercase tracking-widest text-muted mb-2">{tr("Previous trophies (redeemed)")}</div>
                <div className="flex flex-wrap gap-2">
                  {history.map((a) => (
                    <div key={a.id} className="w-20 text-center opacity-70">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.imageUrl} alt={a.name} className="mx-auto h-14 object-contain grayscale-[0.4]" />
                      <div className="text-[9px] text-muted truncate mt-0.5">{a.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === "payout" && (
          <div className="space-y-3">
            <button onClick={() => setStep("shelf")} className="text-xs text-muted hover:text-ink inline-flex items-center gap-1"><Icon name="arrowLeft" size={12} /> {tr("Back to trophies")}</button>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 px-3 py-2 text-sm">
              {tr("Redeeming")} <b>{selected.length}</b> {tr(selected.length === 1 ? "trophy" : "trophies")} — <b className="text-emerald-300">${selectedTotal.toLocaleString()}</b>
            </div>
            <label className="block text-xs text-muted">{tr("Payout currency")}
              <select value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "EGP")} disabled={locked} className="input-cosmic mt-1 w-full">
                <option value="USD">USD — {tr("ACH bank transfer")}</option>
                <option value="EGP">EGP — {tr("Mobile Wallet / InstaPay")}</option>
              </select>
            </label>
            {currency === "USD" ? (
              <div className="grid sm:grid-cols-2 gap-2.5">
                <input value={details.holderName ?? ""} onChange={(e) => setDetails((d) => ({ ...d, holderName: e.target.value }))} disabled={locked} placeholder={tr("Account holder name")} className="input-cosmic sm:col-span-2" />
                <input value={details.routing ?? ""} onChange={(e) => setDetails((d) => ({ ...d, routing: e.target.value }))} disabled={locked} placeholder={tr("Routing number (9 digits)")} inputMode="numeric" className="input-cosmic" />
                <input value={details.account ?? ""} onChange={(e) => setDetails((d) => ({ ...d, account: e.target.value }))} disabled={locked} placeholder={tr("Account number")} inputMode="numeric" className="input-cosmic" />
                <select value={details.accountType ?? "checking"} onChange={(e) => setDetails((d) => ({ ...d, accountType: e.target.value }))} disabled={locked} className="input-cosmic sm:col-span-2">
                  <option value="checking">{tr("Checking")}</option>
                  <option value="savings">{tr("Savings")}</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex gap-2">
                  {(["wallet", "instapay"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMethod(m)} disabled={locked}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${method === m ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted"}`}>
                      {m === "wallet" ? tr("Mobile Wallet") : "InstaPay"}
                    </button>
                  ))}
                </div>
                <input value={details.mobile ?? ""} onChange={(e) => setDetails((d) => ({ ...d, mobile: e.target.value }))} disabled={locked} placeholder={tr("Mobile number")} inputMode="tel" className="input-cosmic w-full" />
              </div>
            )}
            <p className="text-[11px] text-muted">
              {tr("Payouts arrive in 5–7 business days after admin approval.")}{" "}
              {locked
                ? <b className="text-rose-300">{tr("Your payout method is locked (3 changes used) — it will be charged to the saved method.")}</b>
                : savedMethod
                  ? <>{tr("Changing your saved method uses one of your")} {Math.max(0, 3 - changesUsed)} {tr("remaining changes.")}</>
                  : tr("Your method is saved for next time (up to 3 changes).")}
            </p>
            <button onClick={submit} disabled={pending}
              className="w-full pressable rounded-full px-6 py-3 font-bold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(90deg, #10b981, #22d3ee)", boxShadow: "0 10px 26px -12px #10b981" }}>
              {pending ? tr("Submitting…") : `${tr("Request payout")} · $${selectedTotal.toLocaleString()} ${currency}`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return <>{trigger}{popup}</>;
}
