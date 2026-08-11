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

  // ===== A GREEN CRON MUST MEAN A GREEN CRON. F1 =====
  //
  // This answered `{ok: true, synced: 7, failed: 53}` and the scheduler saw
  // success. The standings are the product; a run that failed 88% of its work
  // and reported health is a run nobody will ever look at again.
  //
  // The health signal is NOT a failure count — that number gets tuned upwards
  // the first time it pages somebody and never comes back. It is whether any
  // single provider failed everything it attempted, which is the difference
  // between "the Riot key expired" (act tonight) and "3% scattered" (a normal
  // hour). Non-2xx so the scheduler's own alerting sees it, with the detail in
  // the body rather than in a log somebody has to go and find.
  const down = result.down;
  const body = {
    ok: down.length === 0,
    ...result,
    jobs,
    at: new Date().toISOString(),
    ...(down.length ? {
      problem: `Every account synced for ${down.length === 1 ? "this provider" : "these providers"} failed: `
        + `${down.join(", ")}. Usually an expired or missing API key.`,
    } : {}),
  };
  return NextResponse.json(body, { status: down.length ? 500 : 200 });
}
