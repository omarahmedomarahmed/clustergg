import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import Avatar from "@/components/Avatar";
import AdSlot from "@/components/AdSlot";
import { fmtNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  params, searchParams,
}: {
  params: Promise<{ game: string; metric: string }>;
  searchParams: Promise<{ friends?: string }>;
}) {
  const { game: gameRaw, metric: metricRaw } = await params;
  const { friends } = await searchParams;
  const game = decodeURIComponent(gameRaw);
  const metric = decodeURIComponent(metricRaw);

  const db = await getDb();
  const [board] = await db.select().from(schema.leaderboards).where(and(
    eq(schema.leaderboards.game, game), eq(schema.leaderboards.metricKey, metric))).limit(1);
  if (!board) notFound();

  const viewer = await getCurrentUser();
  let friendIds: string[] | null = null;
  if (friends === "1" && viewer) {
    const rows = await db.select({ id: schema.follows.followingId })
      .from(schema.follows).where(eq(schema.follows.followerId, viewer.id));
    friendIds = [...rows.map((r) => r.id), viewer.id];
  }

  const entries = await db.select({
    value: schema.statCurrent.metricValue,
    rankLabel: schema.statCurrent.rankLabel,
    user: schema.users,
    account: schema.linkedGameAccounts,
  })
    .from(schema.statCurrent)
    .innerJoin(schema.linkedGameAccounts, eq(schema.statCurrent.linkedAccountId, schema.linkedGameAccounts.id))
    .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
    .where(and(
      eq(schema.statCurrent.game, game),
      eq(schema.statCurrent.metricKey, metric),
      eq(schema.users.status, "active"),
      ...(friendIds ? [inArray(schema.users.id, friendIds.length ? friendIds : ["-"])] : []),
    ))
    .orderBy(board.sortDir === "asc" ? asc(schema.statCurrent.metricValue) : desc(schema.statCurrent.metricValue))
    .limit(100);

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link href="/leaderboards" className="text-sm text-muted hover:text-cyan-300">← All leaderboards</Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">{board.title}</h1>
        {viewer && (
          <Link
            href={friends === "1" ? `?` : `?friends=1`}
            className={`rounded-full px-4 py-1.5 text-sm border ${friends === "1" ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200" : "border-violet-400/25 text-muted"}`}
          >
            Friends only
          </Link>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="glass p-10 text-center text-muted">
          No entries yet — be the first to <Link href="/settings/connections" className="text-cyan-300 underline">link an account</Link>.
        </div>
      ) : (
        <div className="glass overflow-hidden">
          <table className="w-full table-cosmic">
            <thead>
              <tr><th className="w-16">Rank</th><th>Gamer</th><th>In-game</th><th className="text-right">{board.unit || "Value"}</th></tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <>
                  <tr key={`${e.user.id}-${i}`}>
                    <td className={`font-bold ${i < 3 ? "text-lg" : "text-muted"}`}>{medal(i)}</td>
                    <td>
                      <Link href={`/u/${e.user.slug}`} className="flex items-center gap-2.5 hover:text-cyan-300">
                        <Avatar name={e.user.displayName} src={e.user.avatarUrl} size={30} />
                        <span className="font-semibold">{e.user.displayName}</span>
                      </Link>
                    </td>
                    <td className="text-muted text-sm">{e.account.inGameName}</td>
                    <td className="text-right font-bold text-cyan-200">{e.rankLabel ?? fmtNum(e.value)}</td>
                  </tr>
                  {(i + 1) % 10 === 0 && i + 1 < entries.length && (
                    <tr key={`ad-${i}`}>
                      <td colSpan={4} className="!p-2"><AdSlot placement="leaderboard_inline" /></td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
