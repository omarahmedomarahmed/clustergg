"use client";

import { useEffect, useState } from "react";
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

// Polls standings + the scoring ledger — the board and history move in real time.
export default function LiveChallengeBoard({ challengeId }: { challengeId: string }) {
  const [data, setData] = useState<{ entries: Entry[]; events: Ev[] } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/challenges/${challengeId}/leaderboard`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d) setData(d); })
        .catch(() => {});
    load();
    const t = setInterval(load, 12000);
    return () => { alive = false; clearInterval(t); };
  }, [challengeId]);

  if (!data) return <div className="glass p-8 text-center text-muted text-sm">Scanning the sector…</div>;

  return (
    <div className="space-y-4">
      {data.entries.length === 0 ? (
        <div className="glass p-8 text-center text-muted text-sm">No competitors yet — claim first place by joining.</div>
      ) : (
        <div className="glass overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-violet-400/15">
            <span className="text-xs text-muted uppercase tracking-widest">Standings</span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> live
            </span>
          </div>
          <table className="w-full table-cosmic">
            <tbody>
              {data.entries.map((e, i) => (
                <tr key={e.slug} className={e.status === "disqualified" ? "opacity-40 line-through" : ""}>
                  <td className="w-14"><span className={`rank-chip ${i < 3 ? `rank-chip-${i + 1}` : ""}`}>{i + 1}</span></td>
                  <td>
                    <a href={`/u/${e.slug}`} className="flex items-center gap-2.5 hover:text-cyan-300">
                      <Avatar name={e.displayName} src={e.avatarUrl} size={28} />
                      <span className="font-semibold">{e.displayName}</span>
                      <span className="text-xs text-muted hidden sm:inline">({e.inGameName})</span>
                    </a>
                  </td>
                  <td className="text-right font-bold text-cyan-200">{e.points} pts</td>
                </tr>
              ))}
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
