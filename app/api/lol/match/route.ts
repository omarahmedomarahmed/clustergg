import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getLolMatchDetail } from "@/lib/providers/riot-lol-rich";

export const dynamic = "force-dynamic";

// Full detail of one LoL match (both teams, every player) for the click-through
// view on the connected-account card. Public; resolves the account server-side.
export async function GET(req: NextRequest) {
  const accountId = String(req.nextUrl.searchParams.get("account") ?? "");
  const matchId = String(req.nextUrl.searchParams.get("match") ?? "");
  if (!accountId || !matchId) return NextResponse.json({ ok: false, error: "account and match required" }, { status: 400 });

  const db = await getDb();
  const [acct] = await db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.id, accountId)).limit(1);
  if (!acct || acct.provider !== "riot-lol") return NextResponse.json({ ok: false, error: "not a League account" }, { status: 404 });

  const detail = await getLolMatchDetail(matchId, acct.providerAccountId, acct.region || "euw1");
  return NextResponse.json(detail);
}
