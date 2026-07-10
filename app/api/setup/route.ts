import { NextRequest, NextResponse } from "next/server";
import { getDb, isDemoMode } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One-shot bootstrap for a real Neon database: creates the schema and seeds
// platform defaults (+ demo universe with ?demo=1). Idempotent — refuses to
// run if tables already exist. Protect with SETUP_TOKEN in production.
export async function POST(req: NextRequest) {
  if (isDemoMode) {
    return NextResponse.json({
      ok: true, mode: "demo",
      note: "No DATABASE_URL set — running on in-memory PGlite, already migrated and seeded.",
    });
  }

  const token = process.env.SETUP_TOKEN;
  if (token && req.nextUrl.searchParams.get("token") !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const existing = await db.execute(
    sql`SELECT to_regclass('public.users') AS t`
  ) as unknown as { rows?: { t: string | null }[] };
  const already = (existing.rows ?? (existing as unknown as { t: string | null }[]))
    .some?.((r) => r.t) ?? false;
  if (already) {
    return NextResponse.json({ ok: true, note: "Schema already exists — nothing to do." });
  }

  const { DDL_STATEMENTS } = await import("@/lib/db/ddl");
  for (const statement of DDL_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }

  const { seed } = await import("@/lib/db/seed");
  const demo = req.nextUrl.searchParams.get("demo") === "1";
  await seed(db, { demo });

  return NextResponse.json({
    ok: true, migrated: true, seeded: true, demoData: demo,
    note: demo
      ? "Schema created + demo universe seeded. First real signup still gets superadmin if you skip demo next time."
      : "Schema created + platform defaults seeded. The FIRST user to sign up becomes superadmin.",
  });
}
