import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncDueAccounts } from "@/lib/sync";
import { recomputeExpertScores } from "@/lib/experts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron target: syncs due accounts, finalizes ended challenges, and
// recomputes Space expert tiers. Also callable manually by an admin.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const db = await getDb();
  const result = await syncDueAccounts(db, 25);
  try { await recomputeExpertScores(db); } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
}
