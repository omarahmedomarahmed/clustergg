"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { buyPrivateChallengeAction, type BuyState } from "@/app/actions/private-challenge";
import { quotePrivate, MIN_PRIZE_POOL, PRIVATE_FEE_PCT } from "@/lib/private-quote";

// An owner buying a competition for their own members. B90.4.
//
// The loop the whole server-owner product rests on: earn from the weekly pool,
// spend it back into your own server. It is a PURCHASE, not a transfer of their
// own money — they buy a product and we then owe the prize as our own
// obligation, which is what keeps this advertising rather than money
// transmission.
//
// So the fee is shown, plainly, before the button. A margin discovered after
// the fact is worse than one that was never charged.

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function BuyPrivateChallenge({ guildId, available, games }: {
  guildId: string;
  available: number;
  games: { name: string }[];
}) {
  const [state, act, busy] = useActionState<BuyState | undefined, FormData>(buyPrivateChallengeAction, undefined);
  const [pool, setPool] = useState(100);

  const quote = quotePrivate(pool);
  const afford = quote.total <= available + 0.005;
  const monday = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d.toISOString().slice(0, 10);
  })();

  if (state?.ok) {
    return (
      <div className="glass border border-emerald-400/30 bg-emerald-500/[0.06] p-6">
        <div className="flex items-center gap-2 text-lg font-black text-emerald-200">
          <Icon name="check" size={18} /> It&apos;s bought
        </div>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={act} className="glass p-6">
      <input type="hidden" name="guildId" value={guildId} />
      <h3 className="font-bold">Run one just for your members</h3>
      <p className="mt-1 text-sm text-muted">
        A competition only your server can enter, with real prize money, paid out of your balance.
        Nobody else sees it and it does not affect what the weekly pool pays you — it is yours.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-[10px] uppercase tracking-widest text-muted">
          What it&apos;s called
          <input name="title" required maxLength={160} placeholder="Friday night blitz"
            className="input-cosmic mt-1 block w-full text-sm" />
        </label>
        <label className="block text-[10px] uppercase tracking-widest text-muted">
          Game
          <select name="game" className="input-cosmic mt-1 block w-full text-sm">
            {games.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </label>
        <label className="block text-[10px] uppercase tracking-widest text-muted">
          Starts
          <input name="startAt" type="date" defaultValue={monday}
            className="input-cosmic mt-1 block w-full text-sm" />
        </label>
        <label className="block text-[10px] uppercase tracking-widest text-muted">
          Runs for
          <select name="days" defaultValue="7" className="input-cosmic mt-1 block w-full text-sm">
            {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
      </div>

      <label className="mt-4 block text-[10px] uppercase tracking-widest text-muted">
        Prize money
        <input
          name="prizePool" type="number" min={MIN_PRIZE_POOL} step={10} value={pool}
          onChange={(e) => setPool(Math.max(0, Number(e.target.value) || 0))}
          className="input-cosmic mt-1 block w-40 text-sm tabular-nums"
        />
      </label>

      {/* The fee, before the button. A margin discovered afterwards is worse
          than one that was never charged. */}
      <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm">
        <div className="flex justify-between"><span className="text-muted">Prizes for your members</span><b className="tabular-nums">{usd(quote.prizePool)}</b></div>
        <div className="mt-1 flex justify-between"><span className="text-muted">Our {quote.feePct}% for running it</span><b className="tabular-nums">{usd(quote.fee)}</b></div>
        <div className="mt-2 flex justify-between border-t border-white/10 pt-2">
          <span>Out of your balance</span>
          <b className={`tabular-nums ${afford ? "" : "text-rose-300"}`}>{usd(quote.total)}</b>
        </div>
        <div className="mt-1 text-[11px] text-muted">Your balance is {usd(available)}.</div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          disabled={busy || !afford || quote.prizePool < MIN_PRIZE_POOL}
          className="money-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Buying…" : `Buy it for ${usd(quote.total)}`}
        </button>
        <span className="text-[11px] leading-relaxed text-muted">
          We set the scoring and write the rules, then it goes out to your server before it starts.
          The {PRIVATE_FEE_PCT}% is what makes this something we sell you rather than us moving your
          money around — it is why we can owe your members the prize.
        </span>
      </div>

      {state?.error && (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-rose-300">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{state.error}</span>
        </p>
      )}
    </form>
  );
}
