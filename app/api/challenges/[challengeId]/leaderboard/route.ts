import { NextResponse } from "next/server";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { BOARD_LIMIT } from "@/lib/challenges";

export const dynamic = "force-dynamic";

// Live challenge feed: standings + the append-only scoring event ledger.
//
// ===== "AM I IN?" IS THE FIRST QUESTION AFTER ENTERING. G6. =====
//
// The audit reported that a gamer who had just entered was missing from the
// standings entirely. Reproducing it at this layer, that is NOT what happens:
// a fresh 0-point participant does come back, ranked last. I could not
// reproduce the disappearance and have not claimed it here.
//
// What IS wrong, and is verifiable, is what this query does at the edges:
//
//   * It took the top 50 and said nothing about there being a 51st. On a
//     challenge with more entrants than that, somebody who has just entered at
//     zero points really IS absent from the board — silently, with the page
//     showing a complete-looking list. That is the reported symptom's most
//     likely cause, and it is a defect on its own terms.
//
//   * Nothing marked which row was YOURS, so answering "did my entry work"
//     meant reading fifty names.
//
// So the response now carries the total, and `?me=<slug>` returns the viewer's
// own standing whether or not it fell inside the window.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  const { challengeId } = await params;
  const me = new URL(req.url).searchParams.get("me")?.trim() || null;
  const db = await getDb();
  const [rows, events, totals] = await Promise.all([
    db.select({
      points: schema.challengeParticipants.currentPoints,
      status: schema.challengeParticipants.status,
      user: schema.users,
      account: schema.linkedGameAccounts,
    })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .innerJoin(schema.linkedGameAccounts, eq(schema.challengeParticipants.linkedAccountId, schema.linkedGameAccounts.id))
      .where(eq(schema.challengeParticipants.challengeId, challengeId))
      .orderBy(desc(schema.challengeParticipants.currentPoints))
      .limit(BOARD_LIMIT),
    db.select({
      event: schema.challengeEvents,
      user: schema.users,
    })
      .from(schema.challengeEvents)
      .innerJoin(schema.challengeParticipants, eq(schema.challengeEvents.participantId, schema.challengeParticipants.id))
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .where(eq(schema.challengeEvents.challengeId, challengeId))
      .orderBy(desc(schema.challengeEvents.createdAt))
      .limit(25),
    db.select({ n: count() })
      .from(schema.challengeParticipants)
      .where(eq(schema.challengeParticipants.challengeId, challengeId)),
  ]);

  const total = totals[0]?.n ?? rows.length;
  const entry = (r: (typeof rows)[number], rank: number) => ({
    rank,
    points: r.points,
    status: r.status,
    displayName: r.user.displayName,
    slug: r.user.slug,
    avatarUrl: r.user.avatarUrl,
    inGameName: r.account.inGameName,
  });
  const entries = rows.map((r, i) => entry(r, i + 1));

  // The viewer's own row, when they entered but placed outside the window.
  //
  // Their real rank is counted rather than guessed: "you're 63rd" is worth
  // something, and "you're somewhere past 50th" is not. Only reached when they
  // are genuinely off the board, so the ordinary case costs one query, not two.
  let mine: (typeof entries)[number] | null = null;
  if (me && !entries.some((e) => e.slug === me)) {
    // Ordered slugs only — a narrow read whose sole job is to find the position.
    // Ranked in code rather than with a window function because PGlite backs
    // the test band, and the board is not the place to bet on its SQL surface.
    const ordered = await db.select({ slug: schema.users.slug })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .where(eq(schema.challengeParticipants.challengeId, challengeId))
      .orderBy(desc(schema.challengeParticipants.currentPoints));
    const at = ordered.findIndex((r) => r.slug === me);
    if (at >= 0) {
      const [row] = await db.select({
        points: schema.challengeParticipants.currentPoints,
        status: schema.challengeParticipants.status,
        user: schema.users,
        account: schema.linkedGameAccounts,
      })
        .from(schema.challengeParticipants)
        .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
        .innerJoin(schema.linkedGameAccounts, eq(schema.challengeParticipants.linkedAccountId, schema.linkedGameAccounts.id))
        // BOTH conditions: a gamer is in many challenges, and filtering on the
        // slug alone would fetch their standing in somebody else's.
        .where(and(
          eq(schema.challengeParticipants.challengeId, challengeId),
          eq(schema.users.slug, me),
        ))
        .limit(1);
      if (row) mine = entry(row, at + 1);
    }
  }

  return NextResponse.json({
    total,
    limit: BOARD_LIMIT,
    entries,
    mine,
    events: events.map((e) => ({
      id: e.event.id,
      who: e.user.displayName,
      slug: e.user.slug,
      type: e.event.eventType,
      points: e.event.pointsAwarded,
      at: e.event.createdAt,
    })),
  });
}
