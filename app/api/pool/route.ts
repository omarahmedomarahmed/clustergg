// `/api/pool` — the live pool, for the homepage's in-place refresh.
//
// 00-TRUTH §10: the pool block "updates in place without a page reload", and
// it is the innovation — owners watch what they are earning while they earn
// it, and so does everybody else.
//
// It reads `poolDivisionFor`, which is **the same function that writes
// Friday's placements** (01-CYCLE). Not a lighter version of it, not a cached
// approximation: an owner who watched a number climb all week and received a
// different one on Saturday would be the end of the only thing that makes this
// model work.

import { getDb } from "../../../lib/db/index.ts";
import { poolDivisionFor } from "../../../lib/pool/score.ts";
import { weekFor } from "../../../lib/challenges/week.ts";
import { demoNow } from "../../../lib/site/clock.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const now = demoNow(params);
  const db = await getDb();
  const division = await poolDivisionFor(db, weekFor(now).start, now);

  return Response.json(
    {
      weekStart: division.weekStart,
      poolCents: division.poolCents,
      flatPoolCents: division.flatPoolCents,
      scoredPoolCents: division.scoredPoolCents,
      // M12 — the page names exactly which challenges fed this week's pool.
      contributingChallengeIds: division.contributingChallengeIds,
      shares: division.shares.map((s) => ({
        guildId: s.guildId,
        name: s.name,
        entrants: s.entrants,
        conversion: s.conversion,
        activation: s.activation,
        score: s.score,
        totalCents: s.totalCents,
      })),
      // K7 — a dropped server is not last place, and an API that omitted them
      // entirely would let a caller redraw them as one.
      dropped: division.dropped,
    },
    // Live means live. A cached pool is a pool that disagrees with the portal.
    { headers: { "cache-control": "no-store" } },
  );
}
