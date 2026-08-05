"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import {
  adjustWeekVotes, announceWeekAgain, closeWeekNow, postWeekUpdateNow, reopenWeekNow,
  saveWeekSettings, saveWeekStream, setWeekDisqualified,
  type WeekAdminState,
} from "@/app/actions/profile-week-admin";

// Running Profile of the Week.
//
// Every control here changes a public leaderboard while people are looking at
// it, so each one says what it did rather than silently reloading — and the
// destructive ones (disqualify, close, reopen) ask for the reason in the same
// breath as the button, because a reason box you have to remember to fill in is
// a reason box that stays empty.

const Note = ({ state }: { state: WeekAdminState }) =>
  state?.error ? <span className="text-[11px] font-semibold text-rose-300">{state.error}</span>
    : state?.ok ? <span className="text-[11px] font-semibold text-emerald-300">{state.ok}</span>
      : null;

// ===== Settings =====

const ZONES = [
  "UTC", "Africa/Cairo", "Europe/London", "Europe/Berlin", "Asia/Dubai",
  "Asia/Riyadh", "Asia/Karachi", "Asia/Kolkata", "Asia/Singapore",
  "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Sao_Paulo",
];

export function WeekSettings({ timezone, frozen, prizeIds, trophies }: {
  timezone: string;
  frozen: boolean;
  /** One trophy id per place, 1st → 3rd. Empty string means "no prize". */
  prizeIds: string[];
  trophies: { id: string; name: string; tier: string; value: number }[];
}) {
  const [state, action, pending] = useActionState<WeekAdminState, FormData>(saveWeekSettings, undefined);

  return (
    <form action={action} className="glass p-5">
      <h2 className="flex items-center gap-2 font-bold"><Icon name="settings" size={15} /> Competition settings</h2>
      <p className="mt-1 text-xs text-muted">
        These decide when a week starts, what happens on announcement day, and what the podium wins.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="text-xs text-muted">
          <span className="mb-1 block font-semibold text-white">Competition clock</span>
          <input name="timezone" defaultValue={timezone} list="week-zones" placeholder="UTC" className="input-cosmic w-full" />
          <datalist id="week-zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
          <span className="mt-1 block">One clock for everyone. Monday 00:00 here starts the week.</span>
        </label>

        {/* One trophy PER PLACE (B51).
            There used to be one for the whole podium, so all three winners got
            the same object — which is not a podium, it is three copies of a
            participation prize. Each is optional: a place with nothing set
            awards nothing rather than falling back to first place's. */}
        <div className="text-xs text-muted md:col-span-1">
          <span className="mb-1 block font-semibold text-white">Podium trophies</span>
          <div className="space-y-1.5">
            {["1st", "2nd", "3rd"].map((label, i) => (
              <label key={label} className="flex items-center gap-2">
                <span className="w-7 shrink-0 font-black text-white">{label}</span>
                <select name={i === 0 ? "trophyId" : `trophyId${i + 1}`} defaultValue={prizeIds[i] ?? ""}
                  className="input-cosmic w-full !py-1.5 text-xs">
                  <option value="">No trophy</option>
                  {trophies.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} · {t.tier} · ${t.value.toLocaleString()}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <span className="mt-1 block">
            Shown on the band all week as &ldquo;if the week ended now&rdquo;, and awarded when the week is called.
          </span>
        </div>

        <label className="flex cursor-pointer flex-col text-xs text-muted">
          <span className="mb-1 block font-semibold text-white">Announcement day</span>
          <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
            <input type="checkbox" name="freeze" defaultChecked={frozen} className="h-4 w-4 accent-cyan-400" />
            <span className="text-white">Freeze all voting on Sunday</span>
          </span>
          <span className="mt-1 block">
            Off means Sunday votes still count toward lifetime totals — never toward a week.
          </span>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60">
          {pending ? "Saving…" : "Save settings"}
        </button>
        <Note state={state} />
      </div>
    </form>
  );
}

// ===== Sunday =====

export function WeekStream({ weekKey, url, live, closed, podium, announcedAt }: {
  weekKey: string;
  url: string;
  live: boolean;
  closed: boolean;
  podium: { slug: string; displayName: string; votes: number }[];
  announcedAt: string | null;
}) {
  const [stream, saveStream, savingStream] = useActionState<WeekAdminState, FormData>(saveWeekStream, undefined);
  const [close, doClose, closing] = useActionState<WeekAdminState, FormData>(closeWeekNow, undefined);
  const [reopen, doReopen, reopening] = useActionState<WeekAdminState, FormData>(reopenWeekNow, undefined);
  const [again, doAgain, againing] = useActionState<WeekAdminState, FormData>(announceWeekAgain, undefined);

  return (
    <div className="glass p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Icon name="play" size={15} /> Sunday — the announcement
        {live && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> live
          </span>
        )}
      </h2>
      <p className="mt-1 text-xs text-muted">
        Going live puts the stream above the leaderboard on every page and pushes the board beneath it.
      </p>

      <form action={saveStream} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="weekKey" value={weekKey} />
        <label className="min-w-[280px] flex-1 text-xs text-muted">
          <span className="mb-1 block font-semibold text-white">Stream link</span>
          <input name="url" defaultValue={url} placeholder="https://www.youtube.com/watch?v=… or twitch.tv/…"
            className="input-cosmic w-full" />
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm">
          <input type="checkbox" name="live" defaultChecked={live} className="h-4 w-4 accent-rose-400" />
          We&apos;re live now
        </label>
        <button disabled={savingStream} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60">
          {savingStream ? "Saving…" : "Save stream"}
        </button>
        <Note state={stream} />
      </form>

      <div className="mt-5 border-t border-white/10 pt-4">
        {closed ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px]">
              <div className="text-sm font-bold text-amber-200">
                <span className="inline-flex items-center gap-1.5"><Icon name="trophy" size={14} /> Called{announcedAt ? ` · ${announcedAt}` : ""}</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {podium.map((p, i) => `#${i + 1} ${p.displayName} (${p.votes.toLocaleString()})`).join(" · ") || "No podium recorded."}
              </div>
            </div>
            <form action={doAgain}>
              <input type="hidden" name="weekKey" value={weekKey} />
              <button disabled={againing}
                className="rounded-full border border-cyan-400/40 px-4 py-1.5 text-sm text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-60"
                title="Re-post the winners into every server running the bot">
                {againing ? "Announcing…" : "Announce again"}
              </button>
            </form>
            <form action={doReopen}>
              <input type="hidden" name="weekKey" value={weekKey} />
              <button disabled={reopening}
                className="rounded-full border border-amber-400/40 px-4 py-1.5 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-60">
                {reopening ? "Reopening…" : "Reopen this week"}
              </button>
            </form>
            <Note state={again} />
            <Note state={reopen} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px] text-xs text-muted">
              Freezes the top three as they stand, awards the podium trophy, and notifies the winners.
              Safe to press twice.
            </div>
            <form action={doClose}>
              <input type="hidden" name="weekKey" value={weekKey} />
              <button disabled={closing} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-60">
                {closing ? "Calling…" : "Call the winners"}
              </button>
            </form>
            <Note state={close} />
          </div>
        )}
      </div>
    </div>
  );
}

// ===== The bot =====

export function WeekBroadcast({ guilds }: { guilds: number }) {
  const [state, action, pending] = useActionState<WeekAdminState, FormData>(postWeekUpdateNow, undefined);
  return (
    <div className="glass p-5">
      <h2 className="flex items-center gap-2 font-bold"><Icon name="send" size={15} /> The daily post</h2>
      <p className="mt-1 text-xs text-muted">
        Every server running the bot gets one post a day: the placements, the countdown, and the two buttons that put
        somebody in the competition — link an account, make your profile yours. The daily cron sends it; this sends it now.
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60">
          {pending ? "Posting…" : "Post the update now"}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input type="checkbox" name="force" value="1" className="h-4 w-4 accent-cyan-400" />
          Send even to servers that already had today&apos;s
        </label>
        <span className="ml-auto text-xs text-muted">
          {guilds ? `${guilds} server${guilds === 1 ? "" : "s"} receiving` : "No server has announcements on yet"}
        </span>
      </form>
      <div className="mt-2"><Note state={state} /></div>
    </div>
  );
}

// ===== One gamer =====

export function EntryAdmin({ weekKey, entry }: {
  weekKey: string;
  entry: {
    rank: number; userId: string; slug: string; displayName: string; avatarUrl: string | null;
    accent: string; weekVotes: number; lifetimeVotes: number; adjustment: number; disqualified: boolean;
  };
}) {
  const [adj, doAdjust, adjusting] = useActionState<WeekAdminState, FormData>(adjustWeekVotes, undefined);
  const [dq, doDq, dqing] = useActionState<WeekAdminState, FormData>(setWeekDisqualified, undefined);
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-2xl border p-3 ${entry.disqualified ? "border-rose-400/30 bg-rose-500/5" : "border-white/10 bg-black/20"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-8 shrink-0 text-center text-sm font-black"
          style={{ color: entry.disqualified ? "#fb7185" : entry.rank <= 3 ? "#fbbf24" : undefined }}>
          {entry.disqualified ? "—" : entry.rank}
        </span>
        {entry.avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={entry.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black"
              style={{ background: `${entry.accent}33`, color: entry.accent }}>{entry.displayName.slice(0, 1)}</span>}

        <a href={`/u/${entry.slug}`} className="min-w-0 flex-1 truncate text-sm font-bold hover:text-cyan-300">
          {entry.displayName} <span className="font-normal text-muted">@{entry.slug}</span>
        </a>

        <span className="text-sm">
          <b style={{ color: entry.accent }}>{entry.weekVotes.toLocaleString()}</b>
          <span className="text-muted"> this week</span>
          {entry.adjustment !== 0 && (
            <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
              {entry.adjustment > 0 ? "+" : ""}{entry.adjustment} by staff
            </span>
          )}
        </span>
        <span className="text-xs text-muted">{entry.lifetimeVotes.toLocaleString()} lifetime</span>

        {entry.disqualified && (
          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-200">
            disqualified
          </span>
        )}

        <button onClick={() => setOpen(!open)}
          className="rounded-full border border-white/15 px-3 py-1 text-xs hover:bg-white/5"
          aria-expanded={open}>
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 border-t border-white/10 pt-3 md:grid-cols-2">
          <form action={doAdjust} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="weekKey" value={weekKey} />
            <input type="hidden" name="userId" value={entry.userId} />
            <label className="text-[11px] text-muted">
              <span className="mb-1 block">Add / remove votes</span>
              <input name="delta" type="number" step={1} placeholder="-5" className="input-cosmic w-24" />
            </label>
            <label className="min-w-[140px] flex-1 text-[11px] text-muted">
              <span className="mb-1 block">Reason</span>
              <input name="reason" placeholder="Vote ring — removed 5" className="input-cosmic w-full" />
            </label>
            <button disabled={adjusting}
              className="rounded-full border border-cyan-400/40 px-4 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-60">
              {adjusting ? "…" : "Apply"}
            </button>
            <Note state={adj} />
          </form>

          <form action={doDq} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="weekKey" value={weekKey} />
            <input type="hidden" name="userId" value={entry.userId} />
            <input type="hidden" name="action" value={entry.disqualified ? "reinstate" : "disqualify"} />
            <label className="min-w-[140px] flex-1 text-[11px] text-muted">
              <span className="mb-1 block">{entry.disqualified ? "Note (optional)" : "Reason"}</span>
              <input name="reason" placeholder={entry.disqualified ? "Appeal upheld" : "Bought votes"} className="input-cosmic w-full" />
            </label>
            <button disabled={dqing}
              className={`rounded-full border px-4 py-1.5 text-xs font-bold disabled:opacity-60 ${entry.disqualified
                ? "border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/10"
                : "border-rose-400/40 text-rose-200 hover:bg-rose-500/10"}`}>
              {dqing ? "…" : entry.disqualified ? "Reinstate" : "Disqualify"}
            </button>
            <Note state={dq} />
          </form>
        </div>
      )}
    </div>
  );
}
