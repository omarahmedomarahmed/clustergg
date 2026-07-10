import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import GameLogo from "@/components/GameLogo";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import LeaderboardWidget from "@/components/LeaderboardWidget";

export const dynamic = "force-dynamic";

export default async function GameLeaderboardPage({
  params, searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<{ stat?: string }>;
}) {
  const { game: gameRaw } = await params;
  const { stat } = await searchParams;
  const game = decodeURIComponent(gameRaw);
  const db = await getDb();

  const [boards, [gameRow]] = await Promise.all([
    db.select().from(schema.leaderboards).where(and(
      eq(schema.leaderboards.game, game), eq(schema.leaderboards.isActive, true))),
    db.select().from(schema.games).where(eq(schema.games.name, game)).limit(1),
  ]);
  if (boards.length === 0) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/leaderboards" className="text-sm text-muted hover:text-cyan-300 inline-flex items-center gap-1.5">
        <Icon name="arrowLeft" size={14} /> All leaderboards
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="flex items-center gap-4 mb-6">
            <GameLogo logoUrl={gameRow?.logoUrl} name={game} size={56} />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{game} <span className="grad-text">Leaderboards</span></h1>
              <p className="text-sm text-muted">Live standings from API-verified accounts. Switch stats below.</p>
            </div>
          </div>

          <LeaderboardWidget
            boards={boards}
            activeMetric={stat}
            basePath={`/leaderboards/${encodeURIComponent(game)}`}
            limit={50}
          />

          <div className="mt-8"><AdSlot placement="leaderboard_inline" /></div>
        </div>

        <aside className="space-y-6">
          {gameRow && (
            <Link href={`/games/${gameRow.slug}`} className="glass card-lift block p-5">
              <div className="text-xs uppercase tracking-widest text-muted mb-2">Game hub</div>
              <div className="flex items-center gap-3">
                <GameLogo logoUrl={gameRow.logoUrl} name={game} size={36} />
                <div className="font-semibold">{game}</div>
                <Icon name="chevronRight" size={16} className="ml-auto text-muted" />
              </div>
              <p className="text-xs text-muted mt-3">Spaces, challenges and players — the whole {game} sector.</p>
            </Link>
          )}
          <AdSlot placement="leaderboard_sidebar" />
        </aside>
      </div>
    </div>
  );
}
