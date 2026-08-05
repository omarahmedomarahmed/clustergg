"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import Cp from "@/components/Cp";
import { purchaseTrophy, type BuyState } from "@/app/actions/marketplace";
import type { GiftCandidate } from "@/lib/gift-search";
import type { MarketTrophy } from "@/lib/marketplace";

// The step that did not exist (B49, absorbing B5/B6/B19).
//
// Before this, "Spend 50,000" was a submit button. A click moved the points and
// the first thing a gamer knew about it was a different balance — and in the
// gift case, a typed profile name went straight to the server, so a
// near-miss on somebody's handle put a cash-redeemable trophy on a stranger's
// profile. There is no refund path for that and there should not be one: the
// trophy is on their profile and is already theirs.
//
// So: one modal, two questions, and the irreversible one is the person.
//
//   Buying for yourself — what it is, what it costs, your balance before and
//   after, one confirm.
//   Gifting — search, pick, and then SEE them (avatar, cover art, display name,
//   @slug) before any CP moves.
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
  const [mode, setMode] = useState<"self" | "gift">("self");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GiftCandidate[]>([]);
  const [picked, setPicked] = useState<GiftCandidate | null>(null);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const after = balance - trophy.cpPrice;
  const short = after < 0;
  // A gift cannot be confirmed until a PERSON is chosen — not a string that
  // looks like one. This is the whole point of the item.
  const ready = mode === "self" ? !short : !!picked && !short;

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

  // Debounced type-ahead. 200ms is short enough to feel live and long enough
  // that a fast typist does not fire a request per keystroke.
  useEffect(() => {
    if (mode !== "gift") return;
    const term = q.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/gamers/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch { /* aborted or offline — the list simply does not change */ }
      finally { setSearching(false); }
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, mode]);

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
          <input type="hidden" name="recipientSlug" value={mode === "gift" && picked ? picked.slug : ""} />

          <div className="flex gap-1.5">
            <button type="button" onClick={() => setMode("self")}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-bold transition ${mode === "self" ? "bg-cyan-500/25 text-cyan-100" : "bg-white/5 text-muted hover:text-ink"}`}>
              Keep it
            </button>
            <button type="button" onClick={() => setMode("gift")}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-bold transition ${mode === "gift" ? "bg-violet-500/25 text-violet-100" : "bg-white/5 text-muted hover:text-ink"}`}>
              Gift it
            </button>
          </div>

          {mode === "gift" && !picked && (
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-muted" htmlFor="gift-search">
                Who is it for?
              </label>
              <input id="gift-search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
                placeholder="name, @profile or Discord handle"
                className="input-cosmic w-full text-sm" />
              {q.trim().length >= 2 && (
                <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
                  {results.map((g) => (
                    <button key={g.slug} type="button" onClick={() => { setPicked(g); setResults([]); }}
                      data-candidate={g.slug}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5">
                      <Avatar name={g.displayName} src={g.avatarUrl} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{g.displayName}</span>
                        <span className="block truncate text-[11px] text-muted">
                          @{g.slug}{g.discordUsername ? ` · ${g.discordUsername}` : ""}
                        </span>
                      </span>
                      <Icon name="chevronRight" size={12} className="shrink-0 text-muted" />
                    </button>
                  ))}
                  {results.length === 0 && (
                    <div className="px-3 py-3 text-xs text-muted">
                      {searching ? "Searching…" : <>Nobody by that name. Try their <b>@profile</b> or their Discord handle — a private profile will not show up here, but their exact @profile still works.</>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* THE confirmation. Their face, their cover art, their name — because
              sending a cash-redeemable trophy to the wrong person cannot be
              undone, and a slug in a text box is not a person. */}
          {mode === "gift" && picked && (
            <div data-recipient={picked.slug} className="overflow-hidden rounded-2xl border border-violet-400/35">
              <div className="relative h-16 bg-gradient-to-br from-violet-600/40 to-cyan-600/30">
                {picked.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={picked.coverUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex items-center gap-3 px-3 pb-3 -mt-6">
                <Avatar name={picked.displayName} src={picked.avatarUrl} size={48} className="ring-2 ring-[#0b0f1a]" />
                <div className="min-w-0 flex-1 pt-6">
                  <div className="truncate text-sm font-black">{picked.displayName}</div>
                  <div className="truncate text-[11px] text-muted">@{picked.slug}</div>
                </div>
                <button type="button" onClick={() => { setPicked(null); setQ(""); }}
                  className="pt-6 text-[11px] font-semibold text-violet-300 hover:underline">Change</button>
              </div>
              <div className="border-t border-white/8 px-3 py-2 text-[11px] text-violet-200/90">
                <Icon name="alert" size={11} className="mr-1 inline" />
                It goes onto their profile immediately and it is theirs to cash out. There is no undo.
              </div>
              <div className="p-3 pt-0">
                <input name="message" placeholder="say something (optional)" maxLength={200}
                  className="input-cosmic w-full text-xs" />
              </div>
            </div>
          )}

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
              {buying ? "Working…"
                : mode === "gift"
                  ? picked ? `Send it to ${picked.displayName}` : "Pick who it's for"
                  : `Confirm — spend ${num(trophy.cpPrice)}`}
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
