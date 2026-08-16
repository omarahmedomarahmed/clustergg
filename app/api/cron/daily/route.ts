// `/api/cron/daily` — the gun, the close, and milestones.
//
// The single most consequential endpoint on the platform: this is what makes
// Monday 00:00 and Friday 00:00 real events rather than computed offsets.
//
//   **The gun** stamps a baseline for everyone who joined early (B2) and
//   freezes which servers are eligible for the pool (12 §4).
//   **The close** runs a final sync first (B3), computes placements, awards
//   trophies, and opens payouts as **drafts**.
//
// A1 — it computes; a human releases. `runDailyJobs` opens draft payouts and
// stops. Nothing in this path can pay anybody, and that is the property the
// whole "a job never moves money on its own" rule rests on.

import { authoriseCron } from "../../../../lib/core/cron-auth.ts";
import { getDb } from "../../../../lib/db/index.ts";
import { runDailyJobs } from "../../../../lib/challenges/jobs.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const auth = authoriseCron(request.headers.get("authorization"));
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });

  const db = await getDb();
  const result = await runDailyJobs(db);
  return Response.json({ ok: true, ...result });
}

export const POST = GET;
