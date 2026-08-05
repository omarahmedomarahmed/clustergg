import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A signed-in cookie for the measurement harness (B55.8).
 *
 * Gated on PERF_COUNT, exactly like /api/perf-count — with the flag unset this
 * is a 404 and cannot mint a session. It exists because measuring an admin page
 * while logged out measures the redirect to /login, which is fast and
 * meaningless.
 */
export async function POST() {
  if (process.env.PERF_COUNT !== "1") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { getDb, schema } = await import("@/lib/db");
  const { eq } = await import("drizzle-orm");
  const { createSession } = await import("@/lib/auth");
  const db = await getDb();
  const [admin] = await db.select().from(schema.users)
    .where(eq(schema.users.email, "admin@clustergg.com")).limit(1);
  if (!admin) return NextResponse.json({ error: "no admin" }, { status: 404 });
  // createSession writes the cookie onto the outgoing response for us.
  await createSession(admin.id, admin.role);
  return NextResponse.json({ ok: true });
}
