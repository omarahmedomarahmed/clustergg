import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { weekBoard } from "@/lib/profile-week";

export const dynamic = "force-dynamic";

// The Profile of the Week board, as JSON.
//
// The band lives in the nav on every page, so it can't re-render the whole page
// to update — the refresh button and the periodic poll both come here. Whoever
// is asking is resolved from their session rather than passed in, so nobody can
// ask "has THIS person voted" about anyone but themselves.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const me = await getCurrentUser();
  const board = await weekBoard({
    weekKey: url.searchParams.get("week") ?? undefined,
    viewerId: me?.id ?? null,
    limit: Number(url.searchParams.get("limit")) || 25,
  });

  return NextResponse.json(
    {
      ...board,
      week: {
        ...board.week,
        startsAt: board.week.startsAt.toISOString(),
        votingEndsAt: board.week.votingEndsAt.toISOString(),
        endsAt: board.week.endsAt.toISOString(),
      },
      result: board.result
        ? { ...board.result, announcedAt: board.result.announcedAt?.toISOString() ?? null }
        : null,
      signedIn: !!me,
      me: me ? { id: me.id, slug: me.slug } : null,
    },
    // Never cached: a leaderboard people are actively voting on is the one
    // thing on the site where a stale answer is the whole failure.
    { headers: { "cache-control": "no-store" } },
  );
}
