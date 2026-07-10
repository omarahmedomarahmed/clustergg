"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";

type Entry = {
  rank: number;
  points: number;
  status: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  inGameName: string;
};

// Polls the live leaderboard endpoint — standings move as syncs land.
export default function LiveChallengeBoard({ challengeId }: { challengeId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/challenges/${challengeId}/leaderboard`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d) setEntries(d.entries); })
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [challengeId]);

  if (!entries) return <div className="glass p-8 text-center text-muted text-sm">Scanning the sector…</div>;
  if (entries.length === 0) return <div className="glass p-8 text-center text-muted text-sm">No competitors yet — claim first place by joining.</div>;

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`);

  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-violet-400/15">
        <span className="text-xs text-muted uppercase tracking-widest">Auto-refreshing</span>
        <span className="flex items-center gap-1.5 text-xs text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> live
        </span>
      </div>
      <table className="w-full table-cosmic">
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.slug} className={e.status === "disqualified" ? "opacity-40 line-through" : ""}>
              <td className={`w-14 font-bold ${i < 3 ? "text-lg" : "text-muted"}`}>{medal(i)}</td>
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
  );
}
