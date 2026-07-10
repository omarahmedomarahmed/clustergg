import { getDb, schema } from "@/lib/db";
import { saveLeaderboard, deleteLeaderboard } from "@/app/actions/admin";
import { PROVIDERS } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Leaderboards" };

export default async function AdminLeaderboardsPage() {
  const db = await getDb();
  const boards = await db.select().from(schema.leaderboards);
  const metricOptions = PROVIDERS.flatMap((p) =>
    p.capabilities.map((c) => ({ game: p.game, key: c.key, label: `${p.game} · ${c.label}` })));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Leaderboards</h1>

      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-4">Create leaderboard</h2>
        <form action={saveLeaderboard} className="grid sm:grid-cols-2 gap-3">
          <input name="game" required placeholder="Game (e.g. Chess)" className="input-cosmic" list="games" />
          <datalist id="games">
            {[...new Set(metricOptions.map((m) => m.game))].map((g) => <option key={g} value={g} />)}
          </datalist>
          <input name="metricKey" required placeholder="metric_key (e.g. blitz_rating)" className="input-cosmic" list="metrics" />
          <datalist id="metrics">
            {[...new Set(metricOptions.map((m) => m.key))].map((k) => <option key={k} value={k} />)}
          </datalist>
          <input name="title" required placeholder="Title (e.g. Chess · Blitz Rating)" className="input-cosmic" />
          <input name="unit" placeholder="Unit (e.g. elo)" className="input-cosmic" />
          <select name="sortDir" className="input-cosmic">
            <option value="desc">Highest first</option>
            <option value="asc">Lowest first</option>
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked className="accent-violet-500" /> Active</label>
          <div className="sm:col-span-2">
            <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Create</button>
          </div>
        </form>
      </div>

      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic">
          <thead><tr><th>Title</th><th>Game</th><th>Metric</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {boards.map((b) => (
              <tr key={b.id}>
                <td className="font-semibold text-sm">{b.title}</td>
                <td className="text-sm text-muted">{b.game}</td>
                <td className="font-mono text-xs text-cyan-300">{b.metricKey}</td>
                <td className="text-sm">{b.isActive ? "✓" : "—"}</td>
                <td>
                  <form action={deleteLeaderboard.bind(null, b.id)}>
                    <button className="text-xs text-rose-300 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
