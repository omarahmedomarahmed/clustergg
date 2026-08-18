// Who holds what, in the demo — so the browser band does not have to guess.
//
// ===== WHY THIS EXISTS AT ALL =====
//
// 09's gamer flow ends in five shots that are all about **one gamer's
// trophies**: blocked under 18, email verification, method chosen, paid, and
// refused on a $0 trophy. Photographing them means signing in as a gamer who
// is 13–17 and holds money, and then as one who is 18+ and holds money, and
// then as anybody holding a $0 collectable.
//
// The seeder decides who those are by scoring a week, which is the point — a
// demo where the winner was appointed would prove nothing about placement. So
// the pass has to *ask*, and this is the asking. Hard-coding a display name
// here would be a fixture that silently stops matching the day the metrics or
// the entrant spread change, and it would fail as "the page did not render"
// rather than as "nobody won".
//
// Demo-mode only, like every route under `/api/demo`. It returns user ids and
// trophy values, which is a gamer directory — house rule 7's whole subject —
// and the fence is what keeps it out of a real database's reach.

import { isDemoMode, getDb, schema } from "../../../../lib/db/index.ts";
import { eq, isNull, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDemoMode) {
    return Response.json({ error: "Demo mode only." }, { status: 400 });
  }
  const db = await getDb();

  const rows = await db
    .select({
      holdingId: schema.userTrophies.id,
      userId: schema.users.id,
      slug: schema.users.slug,
      displayName: schema.users.displayName,
      ageBand: schema.users.ageBand,
      country: schema.users.country,
      email: schema.users.email,
      valueCents: schema.trophies.valueCents,
      place: schema.trophies.place,
      trophyName: schema.trophies.name,
    })
    .from(schema.userTrophies)
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .innerJoin(schema.users, eq(schema.userTrophies.userId, schema.users.id))
    // R2 — a trophy already redeemed is not a trophy to redeem. The pass needs
    // one it can actually walk, and on a second run against the same server the
    // first one is spent.
    .where(and(isNull(schema.userTrophies.redeemedAt), eq(schema.users.status, "active")));

  return Response.json({
    holders: rows.map((r) => ({ ...r, valueCents: r.valueCents ?? 0 })),
  });
}
