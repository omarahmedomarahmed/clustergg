import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getContent } from "@/lib/cms";
import GameLogo from "@/components/GameLogo";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import { fmtNum } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboards" };

export default async function LeaderboardsHub() {
  const db = await getDb();
  const [boards, gameRows, c] = await Promise.all([
    db.select().from(schema.leaderboards).where(eq(schema.leaderboards.isActive, true)),
    db.select().from(schema.games).where(eq(schema.games.isActive, true)),
    getContent(["section.leaderboards.title", "section.leaderboards.subtitle"]),
  ]);
  const gameByName = new Map(gameRows.map((g) => [g.name, g]));
  const byGame = new Map<string, typeof boards>();
  for (const b of boards) {
    if (!byGame.has(b.game)) byGame.set(b.game, []);
    byGame.get(b.game)!.push(b);
  }

  // Top-3 preview for each game's first board
  const previews = new Map<string, { name: string; slug: string; avatarUrl: string | null; value: number; rankLabel: string | null }[]>();
  for (const [game, list] of byGame) {
    const first = list[0];
    const rows = await db.select({
      value: schema.statCurrent.metricValue,
      rankLabel: schema.statCurrent.rankLabel,
      user: schema.users,
    })
      .from(schema.statCurrent)
      .innerJoin(schema.linkedGameAccounts, eq(schema.statCurrent.linkedAccountId, schema.linkedGameAccounts.id))
      .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
      .where(and(
        eq(schema.statCurrent.game, game),
        eq(schema.statCurrent.metricKey, first.metricKey),
        eq(schema.users.status, "active"),
      ))
      .orderBy(desc(schema.statCurrent.metricValue))
      .limit(3);
    previews.set(game, rows.map((r) => ({
      name: r.user.displayName, slug: r.user.slug, avatarUrl: r.user.avatarUrl,
      value: r.value, rankLabel: r.rankLabel,
    })));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold">{c["section.leaderboards.title"].split(" ")[0]} <span className="grad-text">standings</span></h1>
      <p className="text-muted mt-2 max-w-xl">{c["section.leaderboards.subtitle"]}</p>

      <div className="mt-6"><AdSlot placement="leaderboard_top_banner" /></div>

      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[...byGame.entries()].map(([game, list]) => {
          const g = gameByName.get(game);
          const top = previews.get(game) ?? [];
          return (
            <Link
              key={game}
              href={`/leaderboards/${encodeURIComponent(game)}`}
              className="glass card-lift p-5 flex flex-col"
            >
              <div className="flex items-center gap-3">
                <GameLogo logoUrl={g?.logoUrl} name={game} size={44} />
                <div className="min-w-0">
                  <h2 className="font-bold truncate">{game}</h2>
                  <div className="text-xs text-muted">{list.length} stat board{list.length === 1 ? "" : "s"}</div>
                </div>
                <Icon name="chevronRight" size={18} className="ml-auto text-muted" />
              </div>
              <div className="mt-4 space-y-2 flex-1">
                {top.length === 0 && <div className="text-xs text-muted">Be the first on this board.</div>}
                {top.map((t, i) => (
                  <div key={t.slug} className="flex items-center gap-2 text-sm">
                    <span className={`rank-chip rank-chip-${i + 1} !h-6 !min-w-6 text-xs`}>{i + 1}</span>
                    <Avatar name={t.name} src={t.avatarUrl} size={22} />
                    <span className="truncate">{t.name}</span>
                    <span className="ml-auto text-cyan-200 font-semibold text-xs">{t.rankLabel ?? fmtNum(t.value)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {list.slice(0, 4).map((b) => (
                  <span key={b.id} className="text-[10px] uppercase tracking-wider text-muted border border-violet-400/20 rounded-full px-2 py-0.5">
                    {b.title.split("·")[1]?.trim() ?? b.metricKey}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
