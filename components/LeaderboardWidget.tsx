import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import { fmtNum } from "@/lib/utils";

type Board = typeof schema.leaderboards.$inferSelect;

// Full leaderboard block: stat-switcher pills, top-3 podium, scrollable top-N
// table with clickable gamer profiles. `basePath` receives ?stat=<metricKey>.
export default async function LeaderboardWidget({
  boards, activeMetric, basePath, limit = 25, compact = false,
}: {
  boards: Board[];
  activeMetric?: string;
  basePath: string;
  limit?: number;
  compact?: boolean;
}) {
  if (boards.length === 0) {
    return <div className="glass p-8 text-center text-muted text-sm">No leaderboards configured for this game yet.</div>;
  }
  const board = boards.find((b) => b.metricKey === activeMetric) ?? boards[0];

  const entries = await db_entries(board, limit);
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);

  return (
    <div>
      {boards.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
          {boards.map((b) => (
            <Link
              key={b.id}
              href={`${basePath}?stat=${encodeURIComponent(b.metricKey)}`}
              scroll={false}
              className={`stat-tab ${b.id === board.id ? "stat-tab-active" : ""}`}
            >
              {b.title.split("·")[1]?.trim() ?? b.title}
            </Link>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="glass p-10 text-center text-muted text-sm">
          No verified accounts on this board yet — <Link href="/settings/connections" className="text-cyan-300 underline">link yours</Link> and claim the crown.
        </div>
      ) : (
        <>
          {/* Podium */}
          {!compact && podium.length > 0 && (
            <div className="grid grid-cols-3 gap-3 items-end mb-4 mt-2">
              {podiumOrder.map((e) => {
                const place = podium.indexOf(e) + 1;
                const heights = { 1: "pt-6 pb-5", 2: "pt-4 pb-4", 3: "pt-3 pb-3" } as Record<number, string>;
                return (
                  <Link
                    key={e.user.id}
                    href={`/u/${e.user.slug}`}
                    className={`podium-step podium-${place} flex flex-col items-center px-2 text-center ${heights[place]}`}
                  >
                    {place === 1 && <Icon name="crown" size={20} className="text-amber-300 mb-1" />}
                    <Avatar name={e.user.displayName} src={e.user.avatarUrl} size={place === 1 ? 56 : 44} />
                    <div className="mt-2 font-semibold text-sm truncate max-w-full">{e.user.displayName}</div>
                    <div className="text-[11px] text-muted truncate max-w-full">{e.account.inGameName}</div>
                    <div className={`mt-1.5 font-bold ${place === 1 ? "text-amber-300 text-lg" : "text-cyan-200"}`}>
                      {e.rankLabel ?? fmtNum(e.value)}
                    </div>
                    <span className={`rank-chip rank-chip-${place} mt-2`}>#{place}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Table */}
          <div className="glass overflow-hidden">
            <div className={`overflow-y-auto ${compact ? "max-h-72" : "max-h-[28rem]"}`}>
              <table className="w-full table-cosmic">
                <tbody>
                  {(compact ? entries : rest).map((e, i) => {
                    const rank = compact ? i + 1 : i + 4;
                    return (
                      <tr key={`${e.user.id}-${rank}`}>
                        <td className="w-14"><span className={`rank-chip ${rank <= 3 ? `rank-chip-${rank}` : ""}`}>{rank}</span></td>
                        <td>
                          <Link href={`/u/${e.user.slug}`} className="flex items-center gap-2.5 hover:text-cyan-300">
                            <Avatar name={e.user.displayName} src={e.user.avatarUrl} size={28} />
                            <span className="font-semibold text-sm">{e.user.displayName}</span>
                            <span className="text-xs text-muted hidden sm:inline">{e.account.inGameName}</span>
                          </Link>
                        </td>
                        <td className="text-right font-bold text-cyan-200 text-sm">
                          {e.rankLabel ?? fmtNum(e.value)}
                          {board.unit && !e.rankLabel && <span className="text-[10px] font-normal text-muted"> {board.unit}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

async function db_entries(board: Board, limit: number) {
  const db = await getDb();
  return db.select({
    value: schema.statCurrent.metricValue,
    rankLabel: schema.statCurrent.rankLabel,
    user: schema.publicUserColumns,
    account: { inGameName: schema.linkedGameAccounts.inGameName },
  })
    .from(schema.statCurrent)
    .innerJoin(schema.linkedGameAccounts, eq(schema.statCurrent.linkedAccountId, schema.linkedGameAccounts.id))
    .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
    .where(and(
      eq(schema.statCurrent.game, board.game),
      eq(schema.statCurrent.metricKey, board.metricKey),
      eq(schema.users.status, "active"),
    ))
    .orderBy(board.sortDir === "asc" ? asc(schema.statCurrent.metricValue) : desc(schema.statCurrent.metricValue))
    .limit(limit);
}
