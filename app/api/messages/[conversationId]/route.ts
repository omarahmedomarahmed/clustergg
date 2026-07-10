import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const [membership] = await db.select().from(schema.conversationParticipants).where(and(
    eq(schema.conversationParticipants.conversationId, conversationId),
    eq(schema.conversationParticipants.userId, session.uid),
  )).limit(1);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const messages = await db.select().from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt))
    .limit(200);
  return NextResponse.json({ messages });
}
