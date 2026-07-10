import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  const { challengeId } = await params;
  const db = await getDb();
  const rows = await db.select({
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
    .limit(50);

  return NextResponse.json({
    entries: rows.map((r, i) => ({
      rank: i + 1,
      points: r.points,
      status: r.status,
      displayName: r.user.displayName,
      slug: r.user.slug,
      avatarUrl: r.user.avatarUrl,
      inGameName: r.account.inGameName,
    })),
  });
}
