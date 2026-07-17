"use client";

import { useState } from "react";
import { saveLeaderboard } from "@/app/actions/admin";

export type MetricOpt = { key: string; label: string };
export type Board = {
  id: string; game: string; metricKey: string; title: string; unit: string | null; sortDir: string; isActive: boolean;
};

// Leaderboard create/edit. Picking a game filters the metric list to only that
// game's trackable metrics (instead of every metric for every game).
export default function LeaderboardForm({
  board, metricsByGame,
}: {
  board?: Board;
  metricsByGame: Record<string, MetricOpt[]>;
}) {
  const games = Object.keys(metricsByGame).sort();
  const [game, setGame] = useState(board?.game ?? games[0] ?? "");
  const [metric, setMetric] = useState(board?.metricKey ?? "");
  const metrics = metricsByGame[game] ?? [];

  return (
    <form action={saveLeaderboard} className="grid sm:grid-cols-2 gap-3">
      {board && <input type="hidden" name="lbId" value={board.id} />}
      <label className="text-xs text-muted">Game
        <select name="game" required value={game} onChange={(e) => { setGame(e.target.value); setMetric(""); }} className="input-cosmic mt-1">
          {games.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted">Metric (only {game || "this game"}&apos;s trackable stats)
        <select name="metricKey" required value={metric} onChange={(e) => setMetric(e.target.value)} className="input-cosmic mt-1">
          <option value="">— pick a metric —</option>
          {metrics.map((m) => <option key={m.key} value={m.key}>{m.label} ({m.key})</option>)}
        </select>
      </label>
      <input name="title" required defaultValue={board?.title} placeholder="Title (e.g. Chess · Blitz Rating)" className="input-cosmic" />
      <input name="unit" defaultValue={board?.unit ?? ""} placeholder="Unit (e.g. elo)" className="input-cosmic" />
      <select name="sortDir" defaultValue={board?.sortDir ?? "desc"} className="input-cosmic">
        <option value="desc">Highest first</option>
        <option value="asc">Lowest first</option>
      </select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={board?.isActive ?? true} className="accent-violet-500" /> Active</label>
      <div className="sm:col-span-2">
        <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">{board ? "Save leaderboard" : "Create leaderboard"}</button>
      </div>
    </form>
  );
}
