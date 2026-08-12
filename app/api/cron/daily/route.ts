import { NextRequest, NextResponse } from "next/server";
import { runAllJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300, like every other cron here. It was 60 — the Vercel default — while
// /api/cron/sync and /api/cron/announce both declared 300, and this is the
// route that does the MOST: the weekly close that pays server owners, guild
// snapshots, challenge reminders, the leaderboard feed and the ad pass.
//
// It has actually timed out in production (twice in the last fortnight,
// "Task timed out after 60 seconds"). A daily job that dies part-way is not a
// failed job you notice — it is some jobs having run and the rest silently
// not, and on a Monday the one that does not run is the one that pays people.
export const maxDuration = 300;

// The daily cron: everything that SPEAKS.
//
// Challenge reminders, the Profile of the Week post, the ad rotation, the bot
// lists. Once a day is the point — these are messages into other people's
// servers, and the fastest way to lose a bot is to post in someone's channel
// more often than they want to hear from you.
//
// Keeping the data fresh is a different job with a different answer, and lives
// on the hourly `/api/cron/sync`. Every job is idempotent and is also a button
// in Mission Control → Discord bot, so nothing has to wait for tomorrow.
//
// Auth matches /api/cron/sync: Vercel Cron sends CRON_SECRET automatically.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runAllJobs("daily");
  return NextResponse.json({ ok: true, results });
}
