import { NextRequest, NextResponse } from "next/server";
import { drainPostQueue, DRAIN_BATCH } from "@/lib/discord/post-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * The number B33 exists to declare.
 *
 * The fan-out this drains used to run inside server actions that named no
 * duration at all, which is why a hundred servers was a killed request and a
 * plausible, wrong reach number. A queue is only half the fix — the other half
 * is a route that says out loud how long it may take.
 */
export const maxDuration = 300;

// Drain the announcement queue.
//
// Separate from /api/cron/daily on purpose. Daily is "everything that SPEAKS"
// on a once-a-day cadence, because posting into somebody else's server more
// often than they want is how a bot gets removed. This is different: the
// message was already decided by a human pressing publish, and the only
// question left is whether it has physically been delivered yet. That wants
// minutes, not a day.
//
// Idempotent, bounded, and resumable: each run takes `DRAIN_BATCH` rows that are
// due, and `more` tells the caller whether to come back sooner.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await drainPostQueue(DRAIN_BATCH);
  return NextResponse.json({ ok: true, ...result });
}
