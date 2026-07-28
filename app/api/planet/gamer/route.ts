import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PROVIDERS } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

// One gamer's stats for one game, for the planet hero.
//
// Clicking a gamer on a planet used to show their in-game name and a line
// telling them to go and open the profile — unless the game was League, which
// had a bespoke card. So six of seven planets answered "who is this?" with "look
// somewhere else", which is the opposite of what an explorer is for.
//
// Everything needed is already in `stat_current`: every synced metric for every
// linked account, with its rank label. This reads the ones that belong to this
// game and hands them over. No provider-specific code, so a game we add
// tomorrow works the day it syncs.

type Row = { key: string; label: string; value: number; rank: string | null };

// `win_rate` → "Win rate". The metric keys are already written to be readable;
// they just need the underscores taken out.
function label(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Whole numbers stay whole; ratios keep two places. A win rate of 51.7 rendered
// as "52" is a different number, and one of "1,284.0000000002" is a bug report.
function num(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (Number.isInteger(v)) return v.toLocaleString();
  return abs < 100 ? v.toFixed(2).replace(/\.?0+$/, "") : Math.round(v).toLocaleString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim();
  const game = (url.searchParams.get("game") ?? "").trim();
  if (!slug || !game) return NextResponse.json({ error: "slug and game required" }, { status: 400 });

  try {
    const db = await getDb();
    const [user] = await db.select({ id: schema.users.id, name: schema.users.displayName })
      .from(schema.users)
      .where(and(eq(schema.users.slug, slug), eq(schema.users.status, "active")))
      .limit(1);
    if (!user) return NextResponse.json({ stats: [], accounts: [] });

    // A game can be played through several providers (Chess is Chess.com AND
    // Lichess), so the account lookup goes through the registry rather than
    // guessing a provider id from the game name.
    const providerIds = PROVIDERS.filter((p) => p.game === game).map((p) => p.id);
    if (!providerIds.length) return NextResponse.json({ stats: [], accounts: [] });

    const accounts = await db.select({
      id: schema.linkedGameAccounts.id,
      provider: schema.linkedGameAccounts.provider,
      inGameName: schema.linkedGameAccounts.inGameName,
      region: schema.linkedGameAccounts.region,
      verified: schema.linkedGameAccounts.verified,
      lastSyncedAt: schema.linkedGameAccounts.lastSyncedAt,
    }).from(schema.linkedGameAccounts)
      .where(and(
        eq(schema.linkedGameAccounts.userId, user.id),
        inArray(schema.linkedGameAccounts.provider, providerIds),
      ));
    if (!accounts.length) return NextResponse.json({ stats: [], accounts: [] });

    const rows = await db.select({
      accountId: schema.statCurrent.linkedAccountId,
      key: schema.statCurrent.metricKey,
      value: schema.statCurrent.metricValue,
      rankLabel: schema.statCurrent.rankLabel,
    }).from(schema.statCurrent)
      .where(and(
        eq(schema.statCurrent.game, game),
        inArray(schema.statCurrent.linkedAccountId, accounts.map((a) => a.id)),
      ))
      .orderBy(desc(schema.statCurrent.metricValue))
      .limit(60);

    const byAccount = new Map<string, Row[]>();
    for (const r of rows) {
      const list = byAccount.get(r.accountId) ?? [];
      list.push({ key: r.key, label: label(r.key), value: r.value, rank: r.rankLabel });
      byAccount.set(r.accountId, list);
    }

    return NextResponse.json({
      name: user.name,
      accounts: accounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        inGameName: a.inGameName,
        region: a.region,
        verified: a.verified,
        syncedAt: a.lastSyncedAt?.toISOString() ?? null,
        stats: (byAccount.get(a.id) ?? []).map((s) => ({ ...s, display: num(s.value) })),
      })),
    });
  } catch {
    return NextResponse.json({ stats: [], accounts: [] });
  }
}
