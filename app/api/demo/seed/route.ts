// Seed the in-process demo database.
//
// Demo-mode only, and it refuses otherwise: a route that could reseed a real
// database is one deploy away from doing it. It exists so the browser band and
// a human clicking through both get a platform with real numbers in it,
// without either needing a terminal.

import { isDemoMode } from "../../../../lib/db/index.ts";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDemoMode) {
    return Response.json(
      { error: "Seeding is demo-mode only." },
      { status: 400 },
    );
  }
  const { seedDemo } = await import("../../../../lib/demo/seed.ts");
  const result = await seedDemo();
  return Response.json({
    ok: true,
    servers: result.guildIds.length,
    gamers: result.gamers,
    weekStart: result.weekStart.toISOString(),
    // The portal ids, so the browser band can open both portals without
    // guessing them. Safe here for the same reason the whole route is: it
    // refuses outright unless the database is the in-process demo. No key is
    // returned — the demo fence in `portalOpen` is what lets a screenshot run
    // walk a portal, and a route that handed out keys would be a route that
    // could hand out a real one the day somebody removes that fence.
    guildIds: result.guildIds,
    brandIds: result.brands,
    // The two seeded Discord identities — the first server's owner and one
    // administrator — so the band can photograph a portal opened by each.
    discord: result.discord,
  });
}
