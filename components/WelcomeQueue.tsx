"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import {
  adminCompleteWelcome, adminCancelWelcome, adminCreateWelcome, type OfferActionState,
} from "@/app/actions/offers";

// The welcome challenges, as a work queue (B43).
//
// B31 assumed the owner would log into their portal and pick a game. Many never
// will, and a draft only its owner can finish is a cost already booked against a
// competition that never runs. So every row says what is stuck and carries the
// action that unsticks it — the same shape as the stuck-money console (B39),
// for the same reason: a list without an action is an inventory.
//
// Types are declared here rather than imported from `lib/welcome-admin`, which
// reaches the database. A client component does not import from a server module,
// including for a type — that has cost three builds in this session.

type Row = {
  challengeId: string;
  guildId: string | null;
  serverName: string;
  game: string;
  state: "ready" | "needs_game" | "running" | "done" | "cancelled";
  blocker: string;
  value: number;
  ownerOnboarded: boolean;
  billed: boolean;
};

const STATE_STYLE: Record<Row["state"], string> = {
  ready: "border-emerald-400/40 text-emerald-200",
  needs_game: "border-amber-400/40 text-amber-200",
  running: "border-cyan-400/40 text-cyan-200",
  done: "border-white/20 text-muted",
  cancelled: "border-rose-400/30 text-rose-200",
};
const STATE_LABEL: Record<Row["state"], string> = {
  ready: "Ready to publish",
  needs_game: "Needs a game",
  running: "Running",
  done: "Finished",
  cancelled: "Cancelled",
};

export default function WelcomeQueue({
  rows, games, serversWithoutOne, defaultValue,
}: {
  rows: Row[];
  games: string[];
  serversWithoutOne: { guildId: string; name: string }[];
  defaultValue: number;
}) {
  const [complete, completeAction] = useActionState<OfferActionState, FormData>(adminCompleteWelcome, undefined);
  const [cancel, cancelAction] = useActionState<OfferActionState, FormData>(adminCancelWelcome, undefined);
  const [create, createAction] = useActionState<OfferActionState, FormData>(adminCreateWelcome, undefined);
  const [open, setOpen] = useState(false);
  const msg = complete ?? cancel ?? create;

  const stuck = rows.filter((r) => r.state === "needs_game").length;

  return (
    <section className="glass p-5" data-welcome-queue>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <Icon name="trophy" size={16} className="text-violet-300" /> Welcome challenges
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Every one, from the moment it is drafted — whether or not the owner has ever opened their portal.
          </p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} data-new-welcome
          className="rounded-full bg-cyan-500/25 px-4 py-2 text-xs font-black text-cyan-100">
          {open ? "Close" : "New for a server"}
        </button>
      </div>

      {msg?.ok && (
        <div className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
          <Icon name="check" size={14} className="mr-1.5 inline" />{msg.ok}
        </div>
      )}
      {msg?.error && (
        <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">{msg.error}</div>
      )}

      {/* B43.2 — one for any server, at any time. The path for a server whose
          draft was cancelled before we knew its games. */}
      {open && (
        <form action={createAction} className="mb-4 grid gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.05] p-3 sm:grid-cols-4">
          <label className="text-[11px] text-muted sm:col-span-2">
            <span className="mb-1 block font-semibold text-white">Server</span>
            <select name="guildId" className="input-cosmic w-full text-sm" required>
              <option value="">Pick a server…</option>
              {serversWithoutOne.map((s) => <option key={s.guildId} value={s.guildId}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-muted">
            <span className="mb-1 block font-semibold text-white">Game</span>
            <select name="game" className="input-cosmic w-full text-sm" required>
              <option value="">Pick…</option>
              {games.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-muted">
            <span className="mb-1 block font-semibold text-white">Prize pool</span>
            <div className="flex gap-1">
              <input name="value" type="number" min={0} step="0.01" defaultValue={defaultValue}
                className="input-cosmic w-full text-sm" />
              <button className="shrink-0 rounded-full bg-cyan-500/25 px-3 text-xs font-black text-cyan-100">Draft</button>
            </div>
          </label>
          <p className="text-[10px] text-muted sm:col-span-4">
            Only servers without one are listed. It bills to Cluster exactly like the automatic ones — it is the
            same thing arriving by a different door.
          </p>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 p-6 text-center text-sm text-muted">
          No welcome challenges yet.
        </div>
      ) : (
        <>
          {stuck > 0 && (
            <p className="mb-2 text-xs text-amber-200">
              <Icon name="alert" size={11} className="mr-1 inline" />
              {stuck} {stuck === 1 ? "is" : "are"} waiting on a game. Nobody else is going to pick one.
            </p>
          )}
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.challengeId} data-welcome={r.challengeId}
                className="rounded-xl border border-white/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.serverName}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATE_STYLE[r.state]}`}
                    data-welcome-state={r.state}>
                    {STATE_LABEL[r.state]}
                  </span>
                  {r.game && <span className="text-xs text-muted">{r.game}</span>}
                  <span className="ml-auto text-sm font-bold text-amber-200">
                    ${r.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[10px] ${r.billed ? "text-emerald-300" : "text-rose-300"}`}>
                    {r.billed ? "on Cluster's bill" : "not billed"}
                  </span>
                </div>

                {r.blocker && <p className="mt-1 text-[11px] text-amber-200/90">{r.blocker}</p>}
                {!r.ownerOnboarded && r.state !== "cancelled" && (
                  <p className="mt-0.5 text-[10px] text-muted">
                    The owner has not finished their community profile.
                  </p>
                )}

                {(r.state === "needs_game" || r.state === "ready") && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={completeAction} className="flex gap-1">
                      <input type="hidden" name="challengeId" value={r.challengeId} />
                      <select name="game" defaultValue={r.game} className="input-cosmic !py-1 text-xs">
                        {games.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <button data-complete className="rounded-full bg-emerald-500/25 px-3 py-1 text-[11px] font-bold text-emerald-100">
                        Set the game
                      </button>
                    </form>
                    <form action={cancelAction} className="flex gap-1">
                      <input type="hidden" name="challengeId" value={r.challengeId} />
                      <input name="reason" placeholder="why" maxLength={80}
                        className="input-cosmic !py-1 w-32 text-xs" />
                      <button data-cancel className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-muted hover:text-ink">
                        Cancel
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
