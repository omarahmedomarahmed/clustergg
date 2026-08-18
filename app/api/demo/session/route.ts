// Sign in as a seeded gamer, in the demo, without a password nobody set.
//
// ===== THE FENCE IS THE WHOLE DESIGN =====
//
// This mints a real session for any user id it is given. That is an
// authentication bypass, stated plainly, and the only thing that makes it
// acceptable is `isDemoMode` — which is true exactly when the database is the
// in-process PGlite one that is thrown away with the process, and false
// everywhere a real gamer exists.
//
// It is a `POST` and it takes no secret deliberately: a route that accepted a
// token would be a route somebody could be tempted to enable in production
// "just for support", and the guard would then be a string comparison rather
// than an environment that cannot hold a real account.
//
// ===== WHY THE BAND NEEDS IT =====
//
// The seeder's gamers have no password. They were created the way a real gamer
// is created — a Discord press or a link — and 09's gamer shots 16 to 21 are
// all *"this gamer, looking at their own trophies"*. Without this the pass
// would have to sign one up from scratch and then hand them a trophy, which
// photographs a fixture rather than the platform.

import { isDemoMode, getDb, schema } from "../../../../lib/db/index.ts";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { SESSION_COOKIE, createSession, SESSION_TTL_MS } from "../../../../lib/auth/session.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDemoMode) {
    return Response.json({ error: "Demo mode only." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId) {
    return Response.json({ error: "Which gamer?" }, { status: 400 });
  }

  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id, slug: schema.users.slug })
    .from(schema.users)
    .where(eq(schema.users.id, body.userId));
  if (!user) return Response.json({ error: "No such gamer." }, { status: 404 });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSession(db, user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  return Response.json({ ok: true, slug: user.slug });
}
