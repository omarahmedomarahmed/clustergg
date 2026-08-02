"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { remindChallenges, sendWeekUpdate, type BotActionState } from "@/app/actions/discord";
import type { ServerOption } from "@/components/AdBroadcast";

export type LiveChallenge = {
  id: string;
  title: string;
  game: string;
  /** Whole days remaining, rounded up — the number the post will say. */
  daysLeft: number;
  isPrivate: boolean;
};

/**
 * Sending a challenge round again, by hand.
 *
 * A challenge is announced once, on launch, and then has to survive two weeks
 * of a busy server's scrollback. The daily job posts a countdown; this is the
 * override — one challenge or all of them, everywhere or to chosen servers,
 * now rather than tomorrow.
 *
 * The server picker cannot leak a private challenge: the action narrows a
 * private one to the servers that own it regardless of what is ticked here, so
 * the worst a wrong tick can do is send nothing.
 */
function ServerPicker({ servers, all, setAll, label }: {
  servers: ServerOption[]; all: boolean; setAll: (v: boolean) => void; label: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Where it goes</div>
      <label className="mb-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-violet-500" />
        {label} ({servers.length})
      </label>
      {!all && (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
          {servers.length === 0
            ? <div className="text-xs text-muted">No server has the bot with announcements on yet.</div>
            : servers.map((s) => (
              <label key={s.guildId} className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="guildIds" value={s.guildId} className="accent-violet-500" />
                {s.name || s.guildId}
              </label>
            ))}
        </div>
      )}
    </div>
  );
}

export function ChallengeReminder({ challenges, servers }: {
  challenges: LiveChallenge[];
  servers: ServerOption[];
}) {
  const [state, act, busy] = useActionState<BotActionState, FormData>(remindChallenges, undefined);
  const [which, setWhich] = useState("all");
  const [all, setAll] = useState(true);
  const picked = challenges.find((c) => c.id === which);

  return (
    <form action={act} className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Which challenge</div>
        <select name="challengeId" value={which} onChange={(e) => setWhich(e.target.value)}
          className="input-cosmic w-full text-sm">
          <option value="all">Every challenge that&apos;s running ({challenges.length})</option>
          {challenges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {c.game} · {c.daysLeft} day{c.daysLeft === 1 ? "" : "s"} left{c.isPrivate ? " · private" : ""}
            </option>
          ))}
        </select>
        {picked?.isPrivate && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-amber-200">
            <Icon name="lock" size={12} className="mt-0.5 shrink-0" />
            This one is private, so it goes only to the servers that own it — whatever is ticked below.
          </p>
        )}
        {challenges.length === 0 && (
          <p className="mt-2 text-[11px] text-muted">Nothing is running, so there is nothing to remind anyone about.</p>
        )}
      </div>

      <ServerPicker servers={servers} all={all} setAll={setAll} label="Every server with the bot" />

      <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] leading-relaxed text-muted">
        The post says how long is left and that one game account can be entered in every challenge on that
        game at once — which is the argument, not the announcement: they are playing anyway.
      </div>

      <button disabled={busy || challenges.length === 0}
        className="glow-btn pressable rounded-full px-6 py-2.5 font-bold disabled:opacity-60">
        {busy ? "Sending…" : "Send the reminder"}
      </button>
      {state?.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
      {state?.error && <p className="text-sm text-amber-300">{state.error}</p>}
    </form>
  );
}

/** Push today's Profile of the Week standings out again. */
export function WeekBroadcast({ servers }: { servers: ServerOption[] }) {
  const [state, act, busy] = useActionState<BotActionState, FormData>(sendWeekUpdate, undefined);
  const [all, setAll] = useState(true);
  return (
    <form action={act} className="space-y-5">
      <ServerPicker servers={servers} all={all} setAll={setAll} label="Every server with the bot" />
      <p className="text-[11px] leading-relaxed text-muted">
        The daily job already posts this once per server. Pressing this sends it again anyway — use it when the
        standings changed after the morning post, or when a server was added mid-week and has never seen one.
      </p>
      <button disabled={busy} className="ghost-btn pressable rounded-full px-6 py-2.5 font-semibold disabled:opacity-60">
        {busy ? "Sending…" : "Post the weekly standings"}
      </button>
      {state?.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
      {state?.error && <p className="text-sm text-amber-300">{state.error}</p>}
    </form>
  );
}
