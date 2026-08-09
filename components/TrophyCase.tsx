"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import { useTr } from "@/components/LocaleProvider";
import { requestRedeem, cancelRedeem, confirmRedeem } from "@/app/actions/trophies";
import type { TrophyAward, RedeemView } from "@/lib/trophies";
import { stackTrophies } from "@/lib/trophy-stack";

// The gamer's trophy case: select trophies, ask to cash them out, and collect.
//
// The payout half of this used to be a form asking for a routing number and an
// account number, which was wrong twice over — it stored the most sensitive
// thing a gamer has, and it could only pay Americans. It now asks one question,
// "how would you like to be paid", and the actual destination is chosen by the
// gamer on the payout provider's own page after staff release the money. There
// is nothing here to mask because there is nothing here to protect.

// How a gamer says they want it. The same list as METHOD_OPTIONS in
// lib/payouts.ts, kept here as literals so the popup stays a client component.
const METHODS: { key: string; label: string; icon: string; note: string }[] = [
  { key: "bank", label: "Bank transfer", icon: "diamond", note: "Straight to your bank, wherever you are." },
  { key: "paypal", label: "PayPal", icon: "zap", note: "Fast, works almost everywhere." },
  { key: "wallet", label: "Mobile wallet", icon: "messages", note: "Vodafone Cash, InstaPay and the like." },
  { key: "giftcard", label: "Gift / prepaid card", icon: "trophy", note: "No bank account needed." },
  { key: "other", label: "Something else", icon: "spark", note: "Tell us and we'll sort it." },
];

export default function TrophyCase({
  awards, redeems, savedMethod, changesUsed, variant,
}: {
  awards: TrophyAward[];
  redeems: RedeemView[];
  /** A preference, never a destination. */
  savedMethod: { currency: string; method: string } | null;
  changesUsed: number;
  variant: "card" | "button";
}) {
  const tr = useTr();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<"shelf" | "payout">("shelf");
  const [currency, setCurrency] = useState<string>(savedMethod?.currency || "USD");
  // B37: asked for HERE and nowhere else. Playing has no age gate; being paid
  // does, and a birthday field on a signup form is one most people lie in and
  // all of them resent. The fields appear only when the server says it needs
  // them, so a gamer who has already answered never sees them again.
  const [needs, setNeeds] = useState<("age" | "country")[]>([]);
  const [ageBand, setAgeBand] = useState("");
  const [country, setCountry] = useState("");
  const [method, setMethod] = useState<string>(
    METHODS.some((m) => m.key === savedMethod?.method) ? savedMethod!.method : "bank",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setMounted(true), []);

  const shelf = awards.filter((a) => a.status !== "redeemed");
  // B62.1. Grouped by the SAME key the bot card and the public profile use —
  // `stackTrophies` in `lib/trophies.ts` — so one gamer's shelf reads the same
  // in all three places. The awards ride along because selection here is
  // per-award and the redeem request must keep sending individual ids.
  const shelfStacks = useMemo(() => stackTrophies(shelf), [shelf]);
  const held = shelf.filter((a) => a.status === "held");
  const history = awards.filter((a) => a.status === "redeemed");
  const totalValue = useMemo(() => shelf.reduce((s, a) => s + a.value, 0), [shelf]);
  const selected = held.filter((a) => sel[a.id]);
  const selectedTotal = selected.reduce((s, a) => s + a.value, 0);
  const activeRedeems = redeems.filter((r) => ["pending", "approved", "sent"].includes(r.status));
  const locked = changesUsed >= 3;
  const place = (p: number) => (p === 1 ? tr("1st place") : p === 2 ? tr("2nd place") : tr("3rd place"));
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const submit = () => start(async () => {
    setError(null);
    const res = await requestRedeem({
      awardIds: selected.map((a) => a.id), currency, method,
      ageBand: ageBand || undefined, country: country || undefined,
    });
    if (res.error) { setError(res.error); setNeeds(res.needs ?? []); return; }
    setNeeds([]);
    setSel({}); setStep("shelf"); router.refresh();
  });
  const act = (fn: () => Promise<{ ok?: true; error?: string }>) => start(async () => {
    setError(null);
    const res = await fn();
    if (res.error) setError(res.error); else router.refresh();
  });

  const statusChip = (s: string) => {
    const map: Record<string, [string, string]> = {
      pending: [tr("Waiting on approval"), "#fbbf24"],
      approved: [tr("Approved — sending"), "#a78bfa"],
      sent: [tr("Ready to collect"), "#22d3ee"],
      paid: [tr("Paid"), "#34d399"],
      rejected: [tr("Declined"), "#fb7185"],
      cancelled: [tr("Cancelled"), "#94a3b8"],
    };
    const [label, color] = map[s] ?? [s, "#94a3b8"];
    return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: `${color}22`, color }}>{label}</span>;
  };
  const methodLabel = (k: string) => METHODS.find((m) => m.key === k)?.label ?? k;

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
                {shelfStacks.map((st) => {
                  // B62.1. One tile per trophy, not per award row.
                  //
                  // SELECTION STAYS PER-AWARD underneath: the redeem request
                  // still sends individual ids, so nothing about the payout
                  // path changed. What a tap does is select every REDEEMABLE
                  // copy in the stack, because three identical trophies of
                  // identical value are not a choice anybody wants to make one
                  // at a time.
                  const usable = st.awards.filter((a) => a.status === "held" && a.value > 0);
                  const selectable = usable.length > 0;
                  const chosen = usable.filter((a) => sel[a.id]).length;
                  const on = chosen > 0 && chosen === usable.length;
                  const partial = chosen > 0 && !on;
                  const stackValue = usable.reduce((n, a) => n + a.value, 0);
                  const inRedeem = st.awards.filter((a) => a.status === "pending").length;
                  return (
                    <button key={st.key} disabled={!selectable}
                      onClick={() => setSel((prev) => {
                        const next = { ...prev };
                        // All-or-nothing on the stack, and "some selected"
                        // means the next tap selects the rest rather than
                        // clearing — the direction somebody part-way through
                        // is heading.
                        for (const a of usable) next[a.id] = !on;
                        return next;
                      })}
                      className={`relative rounded-2xl border p-3 text-center transition-all ${on || partial ? "scale-[1.03]" : ""} ${selectable ? "" : "opacity-75"}`}
                      style={{ borderColor: on ? "#34d399cc" : partial ? "#34d39966" : "rgba(255,255,255,0.12)", background: on || partial ? "#10b98114" : "rgba(0,0,0,0.35)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={st.imageUrl} alt={st.name} className="mx-auto h-24 object-contain float-y" />
                      <div className="text-xs font-bold mt-1.5 truncate">{st.name}</div>
                      <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px] text-muted">
                        {st.gameLogoUrl && <GameLogo logoUrl={st.gameLogoUrl} name={st.game ?? ""} size={14} rounded="rounded" />}
                        <span className="truncate">{st.challengeTitle ?? tr("Challenge")}</span>
                      </div>
                      <div className="text-[10px] font-bold text-amber-300 mt-0.5">{place(st.placement)}</div>
                      {/* The count, top-left, where the "in redeem" flag used
                          to sit alone. A stack of three where one is already in
                          a payout is a real state and it has to READ as one —
                          "×3" with nothing else would promise three redeemable
                          trophies when only two are. */}
                      {st.count > 1 && (
                        <span className="absolute top-1.5 left-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-[#0b1020]">×{st.count}</span>
                      )}
                      {inRedeem > 0 && (
                        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-black text-black uppercase">
                          {inRedeem === st.count ? tr("in redeem") : `${inRedeem} ${tr("in redeem")}`}
                        </span>
                      )}
                      {/* The value of what a tap actually selects, not of one
                          copy — pressing this adds the whole stack. */}
                      {stackValue > 0 && <span className="absolute top-1.5 right-1.5 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-black text-white">${stackValue.toLocaleString()}</span>}
                      {(on || partial) && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-white text-[11px] font-black ring-2 ring-[#070826]">
                          {on && usable.length === 1 ? <Icon name="check" size={11} /> : chosen}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {held.length > 0 && (
              <button disabled={selected.length === 0 || pending} onClick={() => setStep("payout")}
                className="money-btn mt-4 w-full pressable rounded-full px-6 py-3 font-bold text-white disabled:opacity-50">
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
                        <span className="text-muted text-xs">{tr("prefers")} {methodLabel(r.method).toLowerCase()}</span>
                        {statusChip(r.status)}
                        <span className="text-[10px] text-muted ml-auto">{fmt(r.createdAt)}</span>
                      </div>
                      {r.status === "pending" && (
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <span className="text-muted">{tr("We check every request before it's sent — usually within a day.")}</span>
                          <button onClick={() => act(() => cancelRedeem(r.id))} disabled={pending} className="text-rose-300 hover:underline ml-auto">{tr("Cancel")}</button>
                        </div>
                      )}
                      {r.status === "approved" && (
                        <p className="mt-1.5 text-xs text-muted">{tr("Approved — we're releasing the money now.")}</p>
                      )}
                      {/* The moment it becomes real. The gamer opens the
                          provider's page and chooses for themselves; we never
                          learn which option they took. */}
                      {r.status === "sent" && r.collectUrl && (
                        <div className="mt-2">
                          <p className="text-xs text-cyan-200 mb-2">
                            {tr("It's yours — open this to choose how you want it: bank transfer, PayPal, a prepaid card, or a gift card in your own currency.")}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <a href={r.collectUrl} target="_blank" rel="noreferrer"
                              className="money-btn pressable inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold text-white">
                              <Icon name="zap" size={12} /> {tr("Collect")} ${r.amount.toLocaleString()}
                            </a>
                            <button onClick={() => act(() => confirmRedeem(r.id))} disabled={pending}
                              className="text-xs text-muted hover:text-ink">
                              {tr("I've collected it")}
                            </button>
                          </div>
                        </div>
                      )}
                      {r.status === "sent" && !r.collectUrl && (
                        <p className="mt-1.5 text-xs text-muted">
                          {tr("Sent by")} {methodLabel(r.method).toLowerCase()} — {tr("it should land shortly.")}
                        </p>
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
                  {stackTrophies(history).map((a) => (
                    <div key={a.key} className="relative w-20 text-center opacity-70">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.imageUrl} alt={a.name} className="mx-auto h-14 object-contain grayscale-[0.4]" />
                      {a.count > 1 && (
                        <span className="absolute top-0 right-1 rounded-full bg-white/15 px-1.5 text-[9px] font-black">×{a.count}</span>
                      )}
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
            {/* One question, and it is not "what is your account number". The
                answer is a hint for the provider, not a destination — nothing
                on this screen can be used to move money. */}
            <div>
              <div className="text-xs text-muted mb-1.5">{tr("How would you like to be paid?")}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {METHODS.map((m) => (
                  <button key={m.key} type="button" onClick={() => setMethod(m.key)} disabled={locked}
                    className={`rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                      method === m.key ? "border-cyan-400/60 bg-cyan-500/10" : "border-white/12 hover:border-white/25"}`}>
                    <div className={`flex items-center gap-2 text-sm font-semibold ${method === m.key ? "text-cyan-200" : ""}`}>
                      <Icon name={m.icon} size={14} /> {tr(m.label)}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">{tr(m.note)}</div>
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-xs text-muted">{tr("Currency")}
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={locked} className="input-cosmic mt-1 w-full">
                {["USD", "EUR", "GBP", "EGP", "SAR", "AED"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {needs.length > 0 && (
              <div className="rounded-xl border border-amber-400/35 bg-amber-500/5 px-3 py-3 space-y-2">
                <div className="text-xs font-semibold text-amber-200">
                  {tr("Two things before we can pay you")}
                </div>
                <p className="text-[11px] text-muted">
                  {tr("Being paid is a contract, so we need your age and where you live. We ask once, and only here — your points and trophies were never affected by this.")}
                </p>
                {/* Was a `type="date"`. B72.4 made the server take a BAND, and
                    leaving the date input here would have shipped a field that
                    posts "2003-04-11" to something that only accepts one of
                    three words — a redemption that fails on a value the gamer
                    typed correctly. A range answers the only question a payout
                    asks. */}
                {needs.includes("age") && (
                  <fieldset className="block">
                    <legend className="mb-1 block text-xs text-muted">{tr("Your age range")}</legend>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[["teen", "13–17"], ["adult", "18+"]].map(([v, label]) => (
                        <button key={v} type="button" onClick={() => setAgeBand(v)}
                          className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                            ageBand === v ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                              : "border-white/12 bg-white/5 text-muted hover:text-ink"}`}>
                          {tr(label)}
                        </button>
                      ))}
                    </div>
                    <span className="mt-1 block text-[10px] text-muted">
                      {tr("We never ask for your date of birth — only which range you are in.")}
                    </span>
                  </fieldset>
                )}
                {needs.includes("country") && (
                  <label className="block text-xs text-muted">{tr("Country you live in")}
                    <input type="text" maxLength={2} placeholder="EG" value={country}
                      onChange={(e) => setCountry(e.target.value.toUpperCase())}
                      className="input-cosmic mt-1 w-full uppercase" />
                  </label>
                )}
              </div>
            )}
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-[11px] text-muted">
              <b className="text-ink">{tr("We never ask for your bank details.")}</b>{" "}
              {tr("Once staff approve this, you get a link that opens our payout partner's own page — you pick exactly where the money goes there, from thousands of options in your country. Nothing about your account is ever stored on Cluster.")}
            </div>
            <p className="text-[11px] text-muted">
              {locked
                ? <b className="text-rose-300">{tr("Your payout preference is locked (3 changes used) — message support to change it.")}</b>
                : savedMethod
                  ? <>{tr("Changing it uses one of your")} {Math.max(0, 3 - changesUsed)} {tr("remaining changes.")}</>
                  : tr("We'll remember this for next time (up to 3 changes).")}
            </p>
            <button onClick={submit} disabled={pending}
              className="money-btn w-full pressable rounded-full px-6 py-3 font-bold text-white disabled:opacity-60">
              {pending ? tr("Submitting…") : `${tr("Request payout")} · $${selectedTotal.toLocaleString()} ${currency}`}
            </button>
            <p className="text-center text-[10px] text-muted">
              <a href="/legal/economy" className="underline hover:text-ink">{tr("Economy & payout terms")}</a>
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return <>{trigger}{popup}</>;
}
