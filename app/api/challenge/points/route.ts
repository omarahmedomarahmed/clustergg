import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

// The point-history log for one gamer in one challenge: every scoring event that
// added up to their total (from challengeEvents). Public — challenge standings
// are public. Powers the "how did they earn it" view on the planet hero, the
// planet leaderboard, and /leaderboards.
export async function GET(req: NextRequest) {
  const challengeId = String(req.nextUrl.searchParams.get("challenge") ?? "");
  const slug = String(req.nextUrl.searchParams.get("slug") ?? "");
  if (!challengeId || !slug) return NextResponse.json({ error: "challenge and slug required" }, { status: 400 });

  const db = await getDb();
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user) return NextResponse.json({ error: "gamer not found" }, { status: 404 });

  const [part] = await db.select({ id: schema.challengeParticipants.id, total: schema.challengeParticipants.currentPoints })
    .from(schema.challengeParticipants)
    .where(and(eq(schema.challengeParticipants.challengeId, challengeId), eq(schema.challengeParticipants.userId, user.id)))
    .limit(1);
  if (!part) return NextResponse.json({ total: 0, events: [] });

  const events = await db.select({ eventType: schema.challengeEvents.eventType, points: schema.challengeEvents.pointsAwarded, at: schema.challengeEvents.createdAt })
    .from(schema.challengeEvents)
    .where(eq(schema.challengeEvents.participantId, part.id))
    .orderBy(asc(schema.challengeEvents.createdAt))
    .limit(200);

  return NextResponse.json({ total: part.total, events: events.map((e) => ({ eventType: e.eventType, points: e.points, at: e.at })) });
}
