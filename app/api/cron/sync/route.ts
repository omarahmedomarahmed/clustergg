// `/api/cron/sync` — the hourly stat pull. Phase 2 of the cycle.
//
// A1: it **computes**. It reads each due linked account's stats from the
// provider and appends observations; it moves no money and awards nothing.
//
// The batch is bounded by `syncDueAccounts`, which is deliberate and is written
// up in 10-SETUP §8: an unbounded sync opened a connection per account and
// took the database down with *"too many database connection attempts"*.

import { authoriseCron } from "../../../../lib/core/cron-auth.ts";
import { getDb } from "../../../../lib/db/index.ts";
import { syncDueAccounts } from "../../../../lib/core/sync.ts";
import { recordCronRun } from "../../../../lib/site/preflight.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const auth = authoriseCron(request.headers.get("authorization"));
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });

  const db = await getDb();
  const report = await syncDueAccounts(db);
  // Stamped after the work, not before: "it last ran" should mean it last
  // finished. A job that starts, stamps and then dies would report healthy
  // forever while doing nothing.
  await recordCronRun(db, "sync");
  return Response.json({ ok: true, ...report });
}

/** Vercel Cron sends GET; a manual re-run from the console sends POST. */
export const POST = GET;
