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
  });
}
