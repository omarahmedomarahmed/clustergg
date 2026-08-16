// `/api/challenges/[id]/leaderboard` — live standings.
//
// `standingsOf` is the same function the bot's standings card, the challenge
// page and Friday's placement all read. One implementation, because two would
// eventually disagree about who is winning — and the one people would believe
// is whichever they saw last.
//
// S4 — **matches played is always shown**, whether or not it is scored.

import { getDb } from "../../../../../lib/db/index.ts";
import { standingsOf } from "../../../../../lib/challenges/scoring.ts";
import { demoNow } from "../../../../../lib/site/clock.ts";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const db = await getDb();
  const standings = await standingsOf(db, id, demoNow(query));

  return Response.json(
    {
      challengeId: id,
      standings: standings.map((s) => ({
        // `place` is computed by `standingsOf`, not by this route's array
        // index. Two places that each decide a placement is exactly the drift
        // 01-CYCLE forbids.
        place: s.place,
        userId: s.participant.userId,
        points: s.points,
        // S4 — matches is always here, whether or not this challenge scores
        // it, which is why the whole delta map is returned rather than a
        // hand-picked pair the next metric would be missing from.
        deltas: s.deltas,
        // B6 — a gamer who unlinked mid-challenge is frozen at their last
        // sync and stays in the standings. Hiding that would make a frozen
        // score look like a live one.
        frozen: s.frozen,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
