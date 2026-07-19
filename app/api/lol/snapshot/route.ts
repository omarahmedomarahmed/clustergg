import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getLolSnapshot } from "@/lib/providers/riot-lol-rich";

export const dynamic = "force-dynamic";

// Public LoL snapshot for a linked account (profiles are public). Resolves the
// account id → puuid + platform server-side so neither the puuid nor the Riot
// key is ever exposed to the client. Server-cached to respect rate limits.
export async function GET(req: NextRequest) {
  const accountId = String(req.nextUrl.searchParams.get("account") ?? "");
  if (!accountId) return NextResponse.json({ ok: false, error: "account required" }, { status: 400 });

  const db = await getDb();
  const [acct] = await db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.id, accountId)).limit(1);
  if (!acct || acct.provider !== "riot-lol") return NextResponse.json({ ok: false, error: "not a League account" }, { status: 404 });

  const snap = await getLolSnapshot(acct.providerAccountId, acct.region || "euw1");
  return NextResponse.json(snap);
}
