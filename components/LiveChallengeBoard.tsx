"use client";

import { Fragment, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import { timeAgo } from "@/lib/utils";

type Entry = {
  rank: number;
  points: number;
  status: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  inGameName: string;
};
type Ev = { id: string; who: string; slug: string; type: string; points: number; at: string };
type Board = { entries: Entry[]; events: Ev[]; total?: number; limit?: number; mine?: Entry | null };

// Polls standings + the scoring ledger — the board and history move in real time.
//
// ===== THE VIEWER'S OWN ROW. G6. =====
//
// "Did my entry work?" is the first question a gamer has after joining, and
// this board used to answer it by handing them fifty names to read — or, past
// fifty entrants, by not containing them at all while looking complete.
//
// `meSlug` is the signed-in gamer's slug, or null for a visitor. It does two
// things: highlights their row where it already is, and asks the API for it
// when it isn't. It is NOT authorization — every row on this board is public,
// which is why passing a slug through the query string is fine here and would
// not be anywhere that returns something private.
export default function LiveChallengeBoard({ challengeId, meSlug = null }: { challengeId: string; meSlug?: string | null }) {
  const [data, setData] = useState<Board | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/challenges/${challengeId}/leaderboard${meSlug ? `?me=${encodeURIComponent(meSlug)}` : ""}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d) setData(d); })
        .catch(() => {});
    load();
    const t = setInterval(load, 12000);
    return () => { alive = false; clearInterval(t); };
  }, [challengeId, meSlug]);

  if (!data) return <div className="glass p-8 text-center text-muted text-sm">Scanning the sector…</div>;

  // Everything the board shows, plus the viewer's row when it fell outside the
  // window. Rendered through one list so a pinned row is a real row — same
  // markup, same expandable points log — rather than a second thing that looks
  // like a row and behaves differently.
  const shown: Entry[] = data.mine ? [...data.entries, data.mine] : data.entries;
  const total = data.total ?? shown.length;
  const truncated = total > data.entries.length;

  return (
    <div className="space-y-4">
      {shown.length === 0 ? (
        <div className="glass p-8 text-center text-muted text-sm">No competitors yet — claim first place by joining.</div>
      ) : (
        <div className="glass overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-violet-400/15">
            <span className="text-xs text-muted uppercase tracking-widest">
              {/* Say when the list is a window, not the whole field. Without
                  this, fifty rows read as "these are all the competitors" and a
                  gamer in 51st concludes their entry failed. */}
              Standings{truncated ? ` · top ${data.entries.length} of ${total}` : ""}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> live
            </span>
          </div>
          <table className="w-full table-cosmic">
            <tbody>
              {shown.map((e) => {
                const open = openSlug === e.slug;
                const isMe = !!meSlug && e.slug === meSlug;
                const pinned = !!data.mine && e.slug === data.mine.slug;
                const log = data.events.filter((ev) => ev.slug === e.slug);
                return (
                  <Fragment key={e.slug}>
                    {/* A pinned row is out of sequence by definition, so it gets
                        a divider — otherwise "50, 51" reads as contiguous when
                        the viewer is actually 63rd. */}
                    {pinned && (
                      <tr><td colSpan={3} className="!py-1 text-center text-[10px] uppercase tracking-widest text-muted">···</td></tr>
                    )}
                    <tr
                      className={`${e.status === "disqualified" ? "opacity-40 line-through" : ""} ${isMe ? "bg-cyan-400/10" : ""} cursor-pointer hover:bg-violet-500/8`}
                      onClick={() => setOpenSlug(open ? null : e.slug)}
                    >
                      {/* The rank comes from the server. It used to be the array
                          index, which is the same number right up until a row is
                          pinned from outside the window — and then it silently
                          renumbers 63rd place as 51st. */}
                      <td className="w-14"><span className={`rank-chip ${e.rank <= 3 ? `rank-chip-${e.rank}` : ""}`}>{e.rank}</span></td>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <Avatar name={e.displayName} src={e.avatarUrl} size={28} />
                          <span className="font-semibold">{e.displayName}</span>
                          {isMe && <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200">you</span>}
                          <span className="text-xs text-muted hidden sm:inline">({e.inGameName})</span>
                          <Icon name={open ? "chevronDown" : "chevronRight"} size={13} className="text-muted" />
                        </span>
                      </td>
                      <td className="text-right font-bold text-cyan-200">{e.points} pts</td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={3} className="!py-2 bg-black/20">
                          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5 px-1">{e.displayName}&apos;s points log · <a href={`/u/${e.slug}`} className="text-cyan-300 hover:underline">profile →</a></div>
                          {log.length === 0 ? <div className="text-xs text-muted px-1">No scored events yet.</div> : (
                            <div className="space-y-1">
                              {log.map((ev) => (
                                <div key={ev.id} className="flex items-center gap-2 text-xs px-1">
                                  <Icon name={ev.points >= 0 ? "arrowUp" : "arrowDown"} size={11} className={ev.points >= 0 ? "text-emerald-300" : "text-rose-300"} />
                                  <span className="text-muted flex-1 truncate">{ev.type.replace(/_/g, " ")}</span>
                                  <span className="text-muted/70">{timeAgo(ev.at)}</span>
                                  <span className={`font-bold w-12 text-right ${ev.points >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{ev.points >= 0 ? "+" : ""}{ev.points}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Scoring history ledger */}
      <div className="glass overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-violet-400/15">
          <Icon name="wave" size={13} className="text-cyan-300" />
          <span className="text-xs text-muted uppercase tracking-widest">Scoring history</span>
        </div>
        <div className="max-h-56 overflow-y-auto p-3 space-y-1.5">
          {data.events.length === 0 && (
            <p className="text-xs text-muted px-1 py-2">No scored events yet — the ledger fills as players rack up stats.</p>
          )}
          {data.events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 hover:bg-violet-500/8">
              <Icon name={ev.points >= 0 ? "arrowUp" : "arrowDown"} size={12} className={ev.points >= 0 ? "text-emerald-300" : "text-rose-300"} />
              <a href={`/u/${ev.slug}`} className="font-semibold hover:text-cyan-300">{ev.who}</a>
              <span className="text-muted">{ev.type.replace("_", " ")}</span>
              <span className={`font-bold ${ev.points >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {ev.points >= 0 ? "+" : ""}{ev.points} pts
              </span>
              <span className="ml-auto text-muted/70">{timeAgo(ev.at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
