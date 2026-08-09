import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncDueAccounts } from "@/lib/sync";
import { runAllJobs } from "@/lib/jobs";

/** Accounts per run. Sequential, so this is bounded by `maxDuration`. */
const SYNC_BATCH = 60;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The hourly pass: pull fresh stats, then let anything that finished finish.
//
// This used to run once a day, which meant a gamer could play all evening and
// watch a challenge board that had not moved since six in the morning — the
// standings ARE the product, and a scoreboard that updates tomorrow is a
// scoreboard nobody refreshes. It now runs every hour.
//
// Nothing here posts into a server. Announcements stay on the daily cron, on
// purpose: a bot that speaks hourly gets muted, and "keep the data fresh" and
// "keep talking" are different jobs with different right answers.
//
// The batch is what one run can finish inside `maxDuration`, and accounts are
// picked oldest-due first, so a backlog drains in order rather than starving
// whoever is at the end of the list.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const db = await getDb();
  const result = await syncDueAccounts(db, SYNC_BATCH);
  // B111. `recomputeExpertScores` ran here. Expert tiers were scored
  // entirely from posts, comments and likes — with those gone the function had
  // no inputs, so it was deleted rather than left computing zero every hour.
  // Idempotent, and cheap when nothing is due — a challenge that ended at 3pm
  // should not still be calling itself live at midnight.
  const jobs = await runAllJobs("hourly");
  return NextResponse.json({ ok: true, ...result, jobs, at: new Date().toISOString() });
}
