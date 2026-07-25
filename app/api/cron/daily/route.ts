import { NextRequest, NextResponse } from "next/server";
import { runAllJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The one daily maintenance cron.
//
// Vercel's Hobby plan allows two cron entries, each daily only — so rather than
// one cron per job, this runs the whole job list. Every job is idempotent and is
// also available as a button in Mission Control → Discord bot, so nothing has to
// wait for tomorrow.
//
// Auth matches /api/cron/sync: Vercel Cron sends CRON_SECRET automatically.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runAllJobs();
  return NextResponse.json({ ok: true, results });
}
