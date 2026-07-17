import { getDb, schema } from "@/lib/db";
import { saveLeaderboard, deleteLeaderboard } from "@/app/actions/admin";
import { PROVIDERS } from "@/lib/providers/registry";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Leaderboards" };

type Board = typeof schema.leaderboards.$inferSelect;

function LeaderboardForm({ board, games, metrics }: { board?: Board; games: string[]; metrics: string[] }) {
  return (
    <form action={saveLeaderboard} className="grid sm:grid-cols-2 gap-3">
      {board && <input type="hidden" name="lbId" value={board.id} />}
      <input name="game" required defaultValue={board?.game} placeholder="Game (e.g. Chess)" className="input-cosmic" list="games" />
      <datalist id="games">{games.map((g) => <option key={g} value={g} />)}</datalist>
      <input name="metricKey" required defaultValue={board?.metricKey} placeholder="metric_key (e.g. blitz_rating)" className="input-cosmic" list="metrics" />
      <datalist id="metrics">{metrics.map((k) => <option key={k} value={k} />)}</datalist>
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

export default async function AdminLeaderboardsPage() {
  const db = await getDb();
  const boards = await db.select().from(schema.leaderboards);
  const metricOptions = PROVIDERS.flatMap((p) => p.capabilities.map((c) => ({ game: p.game, key: c.key })));
  const games = [...new Set(metricOptions.map((m) => m.game))];
  const metrics = [...new Set(metricOptions.map((m) => m.key))];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Leaderboards</h1>
      <p className="text-sm text-muted mb-5">Create and edit the ranked boards shown on each game planet and the Leaderboards page.</p>

      <details className="glass p-6 mb-6 group">
        <summary className="font-bold cursor-pointer list-none flex items-center gap-2">
          <Icon name="spark" size={16} className="text-cyan-300" /> Create a leaderboard
          <span className="ml-auto text-xs text-muted group-open:hidden">Open form</span>
        </summary>
        <div className="mt-4 border-t border-violet-400/15 pt-4"><LeaderboardForm games={games} metrics={metrics} /></div>
      </details>

      <div className="text-xs uppercase tracking-widest text-muted mb-3">{boards.length} leaderboards</div>
      <div className="space-y-3">
        {boards.map((b) => (
          <details key={b.id} className="glass overflow-hidden">
            <summary className="flex items-center gap-3 p-4 cursor-pointer list-none">
              <Icon name="chart" size={18} className="text-cyan-300 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm">{b.title} {!b.isActive && <span className="text-xs text-rose-300">(hidden)</span>}</div>
                <div className="text-xs text-muted truncate">{b.game} · <span className="font-mono text-cyan-300">{b.metricKey}</span></div>
              </div>
              <span className="text-xs text-cyan-300">Edit</span>
            </summary>
            <div className="border-t border-violet-400/15 p-5 space-y-3">
              <LeaderboardForm board={b} games={games} metrics={metrics} />
              <form action={deleteLeaderboard.bind(null, b.id)}>
                <button className="text-xs text-rose-300 hover:underline">Delete leaderboard</button>
              </form>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
