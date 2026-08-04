"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Cp from "@/components/Cp";
import { purchaseTrophy, type BuyState } from "@/app/actions/marketplace";
import type { MarketTrophy, CpWallet } from "@/lib/marketplace";

// The shelf.
//
// The job this does beyond listing trophies: make the VALUE of Cluster Points
// legible. A gamer who sees "4,120 CP" on their profile has a number; a gamer
// who sees that it buys a $4 trophy they can cash out has a reason to keep
// playing after they've lost a challenge — which is exactly the gamer whose
// attention a brand already paid for.

const num = (n: number) => n.toLocaleString();

const TIER_RING: Record<string, string> = {
  legendary: "border-amber-300/60 shadow-[0_0_28px_-8px_rgba(252,211,77,.7)]",
  gold: "border-amber-400/45",
  silver: "border-slate-300/45",
  bronze: "border-orange-400/40",
};

export default function TrophyMarket({
  trophies, wallet, signedIn, compact = false, heading,
}: {
  trophies: MarketTrophy[];
  wallet: CpWallet;
  signedIn: boolean;
  /** Fewer rows and no filters — for the profile and quest pages. */
  compact?: boolean;
  heading?: string;
}) {
  const [state, buy, buying] = useActionState<BuyState, FormData>(purchaseTrophy, undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const [gift, setGift] = useState(false);
  const [tier, setTier] = useState<string>("all");
  const [afford, setAfford] = useState(false);

  // The balance moves as soon as a purchase lands, without a reload.
  const balance = state?.ok && typeof state.balance === "number" ? state.balance : wallet.balance;

  const tiers = useMemo(
    () => ["all", ...Array.from(new Set(trophies.map((t) => t.tier)))],
    [trophies],
  );
  const shown = trophies
    .filter((t) => tier === "all" || t.tier === tier)
    .filter((t) => !afford || balance >= t.cpPrice)
    .slice(0, compact ? 8 : 200);

  const chip = (v: string, label: string, on: boolean, set: () => void) => (
    <button key={v} type="button" onClick={set}
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
        on ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>
      {label}
    </button>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Icon name="trophy" size={18} className="text-amber-300" /> {heading ?? "Trophy marketplace"}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Every trophy on the platform, bought with the points you earn playing.
            Keep it on your profile or cash it out — a bought trophy redeems exactly like a won one.
          </p>
        </div>
        {/* The wallet, stated as value rather than as a score — and a LINK (B48).
            It is the most-looked-at number on this screen and it used to do
            nothing, on a page whose whole question is "how do I get more?". */}
        <Link href="/quests"
          className="group rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.06] px-4 py-2 text-right transition hover:border-cyan-400/60 hover:bg-cyan-500/[0.12]">
          <div className="text-cyan-200"><Cp amount={balance} size="lg" /></div>
          <div className="text-[10px] uppercase tracking-wider text-muted">
            {signedIn ? <>to spend · {num(wallet.earned)} earned all-time</> : "Sign in to see your balance"}
          </div>
          <div className="text-[10px] font-semibold text-cyan-300/70 group-hover:text-cyan-200">
            Earn more <Icon name="chevronRight" size={10} className="inline" />
          </div>
        </Link>
      </div>

      {/* Spending never costs a level. Worth saying where it is decided. */}
      <p className="text-[11px] text-muted">
        <Icon name="check" size={11} className="mr-1 inline text-emerald-300" />
        Spending points never lowers your level — your quest progress keeps everything you climbed.
      </p>

      {!compact && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tiers.map((t) => chip(t, t === "all" ? `All (${trophies.length})` : t, tier === t, () => setTier(t)))}
          <span className="mx-1 h-4 w-px bg-white/10" />
          {chip("afford", "I can afford", afford, () => setAfford((v) => !v))}
        </div>
      )}

      {state?.ok && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
          <Icon name="check" size={14} className="mr-1.5 inline" />
          {state.gifted
            ? <><b>{state.trophy}</b> is on {state.gifted}&apos;s profile. They&apos;ve been told it came from you.</>
            : <><b>{state.trophy}</b> is yours. It&apos;s on your profile now, and it can be redeemed for cash.</>}
        </div>
      )}
      {state?.error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">{state.error}</div>
      )}

      {shown.length === 0 ? (
        <div className="glass p-6 text-center text-sm text-muted">
          {afford ? "Nothing in reach yet — keep earning." : "No trophies on the shelf right now."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((t) => {
            const can = signedIn && balance >= t.cpPrice;
            const open = openId === t.id;
            return (
              <div key={t.id} data-trophy={t.id}
                className={`glass overflow-hidden border ${TIER_RING[t.tier] ?? "border-white/10"}`}>
                <div className="relative aspect-square bg-black/30 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.imageUrl} alt={t.name} className="h-full w-full object-contain" />
                  {t.brandName && (
                    <span className="absolute left-2 top-2 rounded-full border border-cyan-400/30 bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-cyan-200">
                      {t.brandName}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="truncate text-sm font-bold">{t.name}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{t.tier}</div>

                  {/* The redemption value, promoted (B48).
                      This is what makes a trophy an asset rather than a sticker,
                      and it used to be the smallest text on the card, set under
                      the price it justifies. The two numbers are two views of
                      ONE number — priceOf at the platform rate — so they are
                      shown together and must never be allowed to disagree. */}
                  {t.value > 0 && (
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-2xl font-black leading-none text-amber-200">${num(t.value)}</span>
                      <span className="text-[10px] uppercase tracking-wider text-amber-300/70">redeems for cash</span>
                    </div>
                  )}
                  <div className={`mt-1.5 text-sm font-black ${can ? "text-cyan-200" : "text-muted"}`}>
                    <Cp amount={t.cpPrice} />
                  </div>

                  {!signedIn ? (
                    <a href="/login" className="ghost-btn mt-2 block rounded-full px-3 py-1.5 text-center text-[11px]">
                      Sign in to buy
                    </a>
                  ) : !open ? (
                    <button type="button" onClick={() => { setOpenId(t.id); setGift(false); }}
                      disabled={!can}
                      className={`mt-2 w-full rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                        can ? "bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30" : "cursor-not-allowed bg-white/5 text-muted"}`}>
                      {can ? "Get it" : <><Cp amount={t.cpPrice - balance} /> to go</>}
                    </button>
                  ) : (
                    <form action={buy} className="mt-2 space-y-1.5">
                      <input type="hidden" name="trophyId" value={t.id} />
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setGift(false)}
                          className={`flex-1 rounded-full px-2 py-1 text-[10px] font-bold ${!gift ? "bg-cyan-500/25 text-cyan-100" : "bg-white/5 text-muted"}`}>
                          For me
                        </button>
                        <button type="button" onClick={() => setGift(true)}
                          className={`flex-1 rounded-full px-2 py-1 text-[10px] font-bold ${gift ? "bg-violet-500/25 text-violet-100" : "bg-white/5 text-muted"}`}>
                          Gift it
                        </button>
                      </div>
                      {gift && (
                        <>
                          <input name="recipientSlug" required placeholder="their profile name"
                            className="input-cosmic !py-1 w-full text-[11px]" />
                          <input name="message" placeholder="a note (optional)" maxLength={200}
                            className="input-cosmic !py-1 w-full text-[11px]" />
                        </>
                      )}
                      <div className="flex gap-1">
                        <button disabled={buying}
                          className="flex-1 rounded-full bg-emerald-500/25 px-2 py-1 text-[11px] font-bold text-emerald-100 disabled:opacity-50">
                          {buying ? "…" : `Spend ${num(t.cpPrice)}`}
                        </button>
                        <button type="button" onClick={() => setOpenId(null)}
                          className="rounded-full bg-white/5 px-2 py-1 text-[11px] text-muted">Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {compact && trophies.length > shown.length && (
        <a href="/marketplace" className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline">
          See all {trophies.length} trophies <Icon name="arrowRight" size={12} />
        </a>
      )}
    </section>
  );
}
