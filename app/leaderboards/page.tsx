import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboards" };

export default async function LeaderboardsHub() {
  const db = await getDb();
  const boards = await db.select().from(schema.leaderboards)
    .where(eq(schema.leaderboards.isActive, true));
  const byGame = new Map<string, typeof boards>();
  for (const b of boards) {
    if (!byGame.has(b.game)) byGame.set(b.game, []);
    byGame.get(b.game)!.push(b);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold">Global <span className="grad-text">Leaderboards</span></h1>
      <p className="text-muted mt-2 max-w-xl">
        Built from live stat syncs — every number here came from a real game API, not a form.
      </p>
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[...byGame.entries()].map(([game, list]) => (
          <div key={game} className="glass glass-hover p-5">
            <h2 className="font-bold text-lg mb-3">{game}</h2>
            <ul className="space-y-2">
              {list.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/leaderboards/${encodeURIComponent(game)}/${encodeURIComponent(b.metricKey)}`}
                    className="flex items-center justify-between text-sm text-muted hover:text-cyan-300 transition-colors"
                  >
                    <span>{b.title.split("·")[1]?.trim() ?? b.title}</span>
                    <span>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
