"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { portalRequestChallenge, type PortalActionState } from "@/app/actions/server-portal";

// An owner building a challenge for their own community, on the web.
//
// The same request `/cluster show:admin` submits, with room to think. A Discord
// modal gives five short inputs and no help text — fine for a quick ask, wrong
// for the thing an owner is most anxious to get right, because it runs under
// their name in front of their members.
//
// It shows what happens after they press the button, in order, because the gap
// between submitting and going live is the part that makes owners nervous.

export type RequestableGame = { name: string; logoUrl: string | null };

export default function ServerChallengeRequest({
  guildId, keyStr, games, pending,
}: {
  guildId: string;
  keyStr: string;
  games: RequestableGame[];
  /** How many of theirs are already waiting on us. */
  pending: number;
}) {
  const [state, submit, sending] = useActionState<PortalActionState, FormData>(
    portalRequestChallenge.bind(null, guildId, keyStr), null,
  );
  const [game, setGame] = useState(games[0]?.name ?? "");
  const full = pending >= 3;

  if (state?.ok) {
    return (
      <div className="glass border border-emerald-400/30 bg-emerald-500/[0.06] p-6">
        <div className="flex items-start gap-3">
          <Icon name="check" size={20} className="mt-0.5 shrink-0 text-emerald-300" />
          <div>
            <h2 className="font-bold">{state.ok}</h2>
            <p className="mt-1 text-sm text-muted max-w-2xl">
              When we approve it you get an entry key only your members have, posted straight into your
              server. Nothing goes live under your name without a human here reading it first.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass p-6">
      <h2 className="font-bold flex items-center gap-2">
        <Icon name="trophy" size={16} className="text-amber-300" /> Run a challenge for your community
      </h2>
      <p className="mt-1 text-sm text-muted max-w-2xl">
        A week-long competition on a game your members already play, scored automatically from that game&apos;s
        own API. We review it, then post it in your server with an entry key only your members have.
      </p>

      {full ? (
        <p className="mt-4 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          You have three waiting on us already. We&apos;ll work through those first — it&apos;s a queue, not a
          limit on how many you can run.
        </p>
      ) : (
        <form action={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted sm:col-span-2">
            <span className="mb-1 block">Game</span>
            <div className="flex flex-wrap gap-2">
              {games.map((g) => (
                <button
                  key={g.name} type="button" onClick={() => setGame(g.name)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                    game === g.name ? "border-cyan-400 bg-cyan-500/15 text-ink" : "border-white/12 hover:border-white/30"
                  }`}
                >
                  {g.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ (
                    <img src={g.logoUrl} alt="" className="h-5 w-5 rounded object-cover" />
                  )}
                  {g.name}
                </button>
              ))}
            </div>
            <input type="hidden" name="game" value={game} />
          </label>

          <label className="text-xs text-muted sm:col-span-2">
            <span className="mb-1 block">What your members will see it called</span>
            <input name="title" required maxLength={120} placeholder="Friday Night Ladder" className="input-cosmic w-full" />
          </label>

          <label className="text-xs text-muted sm:col-span-2">
            <span className="mb-1 block">What it&apos;s about (optional)</span>
            <textarea name="description" rows={2} maxLength={600} placeholder="Most ranked wins between Friday and Sunday." className="input-cosmic w-full resize-y" />
          </label>

          <label className="text-xs text-muted">
            <span className="mb-1 block">How it&apos;s won</span>
            <select name="format" className="input-cosmic w-full">
              <option value="top3">Top 3 — a podium</option>
              <option value="top1">Winner takes it</option>
              <option value="threshold_race">First to a target</option>
            </select>
          </label>

          <label className="text-xs text-muted">
            <span className="mb-1 block">How long</span>
            <select name="days" defaultValue="7" className="input-cosmic w-full">
              {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>

          <label className="text-xs text-muted">
            <span className="mb-1 block">Prize pool you&apos;re putting up (USD)</span>
            <input name="prizeValue" type="number" min={0} step={5} defaultValue={0} className="input-cosmic w-full" />
          </label>

          <label className="text-xs text-muted">
            <span className="mb-1 block">Or describe the prize</span>
            <input name="prizeDescription" maxLength={120} placeholder="Server role + a month of Nitro" className="input-cosmic w-full" />
          </label>

          <div className="sm:col-span-2">
            <button disabled={sending} className="glow-btn pressable rounded-full px-6 py-2.5 font-bold disabled:opacity-60">
              {sending ? "Sending…" : "Send it for review"}
            </button>
            <p className="mt-2 text-[11px] text-muted">
              Free. We fund the trophies if you don&apos;t put up a pool — a challenge with nothing behind it is
              one nobody enters.
            </p>
            {state?.error && <p className="mt-2 text-xs text-rose-300">{state.error}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
