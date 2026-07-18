import { getDb, schema } from "@/lib/db";
import { deleteLeaderboard } from "@/app/actions/admin";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import Icon from "@/components/Icon";
import LeaderboardForm, { type MetricOpt } from "@/components/LeaderboardForm";
import MetricsGuide from "@/components/MetricsGuide";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Leaderboards" };

export default async function AdminLeaderboardsPage() {
  const db = await getDb();
  const boards = await db.select().from(schema.leaderboards);

  // Trackable metrics grouped by game — so the form only offers a game's own stats.
  const metricsByGame: Record<string, MetricOpt[]> = {};
  for (const p of PROVIDERS) {
    if (!p.capabilities.length) continue;
    const arr = metricsByGame[p.game] ?? (metricsByGame[p.game] = []);
    for (const c of p.capabilities) if (!arr.some((x) => x.key === c.key)) arr.push({ key: c.key, label: c.label });
  }
  // Keep any game/metric already saved on a board selectable, even if its
  // provider exposes no capabilities in the registry.
  for (const b of boards) {
    const arr = metricsByGame[b.game] ?? (metricsByGame[b.game] = []);
    if (!arr.some((x) => x.key === b.metricKey)) arr.push({ key: b.metricKey, label: b.metricKey });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Leaderboards</h1>
      <p className="text-sm text-muted mb-5">Create and edit ranked boards. Pick a game and only that game&apos;s trackable metrics appear.</p>

      <details className="glass p-6 mb-6 group">
        <summary className="font-bold cursor-pointer list-none flex items-center gap-2">
          <Icon name="spark" size={16} className="text-cyan-300" /> Create a leaderboard
          <span className="ml-auto text-xs text-muted group-open:hidden">Open form</span>
        </summary>
        <div className="mt-4 border-t border-violet-400/15 pt-4"><LeaderboardForm metricsByGame={metricsByGame} /></div>
      </details>

      {/* Metrics guide — exactly what each game's API pulls */}
      <details className="glass p-6 mb-6 group">
        <summary className="font-bold cursor-pointer list-none flex items-center gap-2">
          <Icon name="satellite" size={16} className="text-cyan-300" /> Metrics guide — what each game tracks
          <span className="ml-auto text-xs text-muted group-open:hidden">Open reference</span>
        </summary>
        <div className="mt-4 border-t border-violet-400/15 pt-4 grid md:grid-cols-2 gap-2">
          {PROVIDERS.filter((p) => p.capabilities.length > 0).map((p) => (
            <MetricsGuide key={p.id} providerName={p.name} game={p.game} live={isProviderLive(p)} authType={p.authType} docsUrl={p.docsUrl}
              capabilities={p.capabilities.map((c) => ({ key: c.key, label: c.label, unit: c.unit, higherIsBetter: c.higherIsBetter }))} />
          ))}
        </div>
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
              <LeaderboardForm board={{ id: b.id, game: b.game, metricKey: b.metricKey, title: b.title, unit: b.unit, sortDir: b.sortDir, isActive: b.isActive }} metricsByGame={metricsByGame} />
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
