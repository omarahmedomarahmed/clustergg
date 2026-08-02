"use client";

import { useActionState } from "react";
import Icon from "@/components/Icon";
import {
  sweepServerWelcome, askServersForGames, grantFounderCredit,
  type OfferActionState,
} from "@/app/actions/offers";
import type { Offers } from "@/lib/offers";

// Running the two founding offers, from one panel.
//
// Both offers are retroactive, and retroactive is not a property of a database
// column — it is somebody pressing a button for the people who were already
// here. This is that button, twice, with the number of people still owed
// printed on it so it is impossible to forget.

const $ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function FoundingOffers({ offers }: { offers: Offers }) {
  const [serverState, sweep, sweeping] = useActionState<OfferActionState, FormData>(
    (prev) => sweepServerWelcome(prev), undefined,
  );
  const [askState, ask, asking] = useActionState<OfferActionState, FormData>(
    (prev) => askServersForGames(prev), undefined,
  );
  const [brandState, grant, granting] = useActionState<OfferActionState, FormData>(
    (prev) => grantFounderCredit(prev), undefined,
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* ===== Servers ===== */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-ink">The welcome challenge</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Every server carrying the bot gets one competition we fund — {$(offers.servers.value)} of prize
              money for its members, paid by us. It is the only offer that reaches members rather than owners,
              which is what turns an install into linked gamers.
            </p>
          </div>
          <Icon name="planet" size={18} className="shrink-0 text-cyan-300" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Given" value={offers.servers.claimed.toLocaleString()} />
          <Stat label="Owed one" value={offers.servers.waiting.toLocaleString()} warn={offers.servers.waiting > 0} />
          <Stat label="Left in the offer" value={offers.servers.remaining.toLocaleString()} />
        </div>

        {offers.servers.waiting > 0 && (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/5 p-2.5 text-[11px] leading-snug text-amber-200">
            {offers.servers.waiting.toLocaleString()} server{offers.servers.waiting === 1 ? " is" : "s are"} carrying
            the bot without having had a welcome challenge — including every one that installed before this offer
            existed. They are owed it.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <form action={sweep}>
            <button disabled={sweeping} className="cta-btn pressable rounded-full px-4 py-1.5 text-xs disabled:opacity-60">
              {sweeping ? "Creating…" : "Give it to every server that's owed one"}
            </button>
          </form>
          <form action={ask}>
            <button disabled={asking} className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs disabled:opacity-60">
              {asking ? "Asking…" : "Ask the rest what they play"}
            </button>
          </form>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-muted">
          Safe to press twice — a server that has one is skipped. A server that never told us what it plays is
          reported by name rather than guessed at: a Fortnite competition in a chess community is worse than none.
        </p>
        {serverState?.ok && <p className="mt-2 text-[11px] text-emerald-300">{serverState.ok}</p>}
        {serverState?.error && <p className="mt-2 text-[11px] text-rose-300">{serverState.error}</p>}
        {askState?.ok && <p className="mt-1 text-[11px] text-cyan-300">{askState.ok}</p>}
      </div>

      {/* ===== Brands ===== */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-ink">The founding brand offer</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              The first {offers.brands.cap} brands pay {$(offers.founderBase)} a month for placements — down from{" "}
              {$(offers.pricing.reachBase)} — and taking it unlocks {$(offers.founderCredit)} of challenge credit
              for their first month on one game.
            </p>
          </div>
          <Icon name="spark" size={18} className="shrink-0 text-amber-300" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Granted" value={offers.brands.claimed.toLocaleString()} />
          <Stat label="Owed it" value={offers.brands.waiting.toLocaleString()} warn={offers.brands.waiting > 0} />
          <Stat label="Left of 100" value={offers.brands.remaining.toLocaleString()} />
        </div>

        {offers.brands.waiting > 0 && (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/5 p-2.5 text-[11px] leading-snug text-amber-200">
            {offers.brands.waiting} brand{offers.brands.waiting === 1 ? " is" : "s are"} already paying and{" "}
            {offers.brands.waiting === 1 ? "hasn't" : "haven't"} had the founding credit. Giving it only to new
            signups teaches the brands who backed us first that waiting would have been the better move.
          </p>
        )}

        <form action={grant} className="mt-3">
          <button disabled={granting || !offers.brands.open} className="cta-btn pressable rounded-full px-4 py-1.5 text-xs disabled:opacity-60">
            {granting ? "Granting…" : `Grant ${$(offers.founderCredit)} to every brand that's owed it`}
          </button>
        </form>
        <p className="mt-2 text-[10px] leading-snug text-muted">
          Existing customers included, by design. Idempotent — a brand that has it is skipped, so a double-click
          cannot double-pay.
        </p>
        {brandState?.ok && <p className="mt-2 text-[11px] text-emerald-300">{brandState.ok}</p>}
        {brandState?.error && <p className="mt-2 text-[11px] text-rose-300">{brandState.error}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
      <div className={`text-lg font-bold tabular-nums ${warn ? "text-amber-300" : "text-ink"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}
