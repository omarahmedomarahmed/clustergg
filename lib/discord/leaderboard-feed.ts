import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { reportToHq } from "@/lib/discord/hq";

// Leaderboard movement, into HQ.
//
// Every board we run, not one — a game usually has several (rank, wins, KDA),
// and picking a single "main" board silently hides the rest. So this walks the
// `leaderboards` table and posts the current top of each into that game's feed
// channel, which is also what makes the per-game channels worth having.

export type BoardPost = { game: string; board: string; rows: number };

const TOP_N = 5;

export async function postLeaderboardUpdates(limit = 40): Promise<{ posted: number; boards: BoardPost[] }> {
  const out: BoardPost[] = [];
  try {
    const db = await getDb();
    const boards = await db.select()
      .from(schema.leaderboards)
      .where(eq(schema.leaderboards.isActive, true))
      .limit(limit);

    for (const b of boards) {
      const rows = await topOf(db, b.game, b.metricKey, b.sortDir);
      // A board with nobody on it is noise, not news.
      if (rows.length === 0) continue;

      const body = rows
        .map((r, i) => `${["🥇", "🥈", "🥉"][i] ?? `**${i + 1}.**`} ${r.name} — ${fmt(r.value)}${b.unit ? ` ${b.unit}` : ""}`)
        .join("\n");

      await reportToHq({ type: "leaderboard", game: b.game, board: b.title, body });
      out.push({ game: b.game, board: b.title, rows: rows.length });
    }
  } catch { /* a failed feed is not worth failing a cron over */ }
  return { posted: out.length, boards: out };
}

async function topOf(
  db: Awaited<ReturnType<typeof getDb>>,
  game: string,
  metricKey: string,
  sortDir: string,
): Promise<{ name: string; value: number }[]> {
  try {
    const rows = await db.select({
      name: schema.users.displayName,
      value: schema.statCurrent.metricValue,
    })
      .from(schema.statCurrent)
      .innerJoin(schema.linkedGameAccounts, eq(schema.statCurrent.linkedAccountId, schema.linkedGameAccounts.id))
      .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
      .where(and(eq(schema.statCurrent.game, game), eq(schema.statCurrent.metricKey, metricKey)))
      .orderBy(sortDir === "asc" ? schema.statCurrent.metricValue : desc(schema.statCurrent.metricValue))
      .limit(TOP_N);
    return rows.map((r) => ({ name: r.name, value: r.value }));
  } catch { return []; }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : (Math.round(n * 100) / 100).toLocaleString();
}
