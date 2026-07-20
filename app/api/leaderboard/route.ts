import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { gameAvatarOf } from "@/lib/game-identity";

export const dynamic = "force-dynamic";

// Live leaderboard for a game + metric: top entries + the signed-in gamer's own
// standing. Powers the feed dashboard "leaderboard" widget.
export async function GET(req: NextRequest) {
  const game = String(req.nextUrl.searchParams.get("game") ?? "");
  const metric = String(req.nextUrl.searchParams.get("metric") ?? "");
  if (!game || !metric) return NextResponse.json({ error: "game and metric required" }, { status: 400 });

  const db = await getDb();
  const [board] = await db.select().from(schema.leaderboards)
    .where(and(eq(schema.leaderboards.game, game), eq(schema.leaderboards.metricKey, metric))).limit(1);
  const sortDir = board?.sortDir === "asc" ? "asc" : "desc";
  const unit = board?.unit ?? null;

  const rows = await db.select({
    value: schema.statCurrent.metricValue,
    rankLabel: schema.statCurrent.rankLabel,
    userId: schema.users.id,
    name: schema.users.displayName,
    slug: schema.users.slug,
    avatarUrl: schema.users.avatarUrl,
    providerData: schema.linkedGameAccounts.providerData,
    inGameName: schema.linkedGameAccounts.inGameName,
  })
    .from(schema.statCurrent)
    .innerJoin(schema.linkedGameAccounts, eq(schema.statCurrent.linkedAccountId, schema.linkedGameAccounts.id))
    .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
    .where(and(eq(schema.statCurrent.game, game), eq(schema.statCurrent.metricKey, metric), eq(schema.users.status, "active")))
    .orderBy(sortDir === "asc" ? asc(schema.statCurrent.metricValue) : desc(schema.statCurrent.metricValue))
    .limit(500);

  const me = await getCurrentUser().catch(() => null);
  const myIdx = me ? rows.findIndex((r) => r.userId === me.id) : -1;

  return NextResponse.json({
    game, metric, unit, total: rows.length,
    entries: rows.slice(0, 10).map((r, i) => ({ rank: i + 1, name: r.name, slug: r.slug, avatarUrl: gameAvatarOf(r.providerData) ?? r.avatarUrl, inGameName: r.inGameName, value: r.value, rankLabel: r.rankLabel })),
    me: myIdx >= 0 ? { rank: myIdx + 1, value: rows[myIdx].value, rankLabel: rows[myIdx].rankLabel, name: rows[myIdx].name } : null,
  });
}
