// `/api/cron/announce` — drain the post queue, every five minutes.
//
// A3: **nothing fans out per-guild inline from a request.** An announcement to
// two hundred servers is two hundred rate-limited HTTP calls; doing that
// inside a server action means the action times out somewhere in the middle
// and half the servers never see it. 11-PORTED records that this bug class
// appeared three times before the queue existed.
//
// So announcing enqueues, and this drains. The batch is bounded for the same
// reason the sync's is.

import { authoriseCron } from "../../../../lib/core/cron-auth.ts";
import { drainPostQueue } from "../../../../lib/discord/post-queue.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const auth = authoriseCron(request.headers.get("authorization"));
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });

  const result = await drainPostQueue();
  return Response.json({ ok: true, ...result });
}

export const POST = GET;
