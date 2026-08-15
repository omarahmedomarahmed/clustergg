// Seed the demo database from a terminal.
//
// The seeder itself lives in `lib/demo/seed.ts` so that Next can compile it —
// webpack does not parse `.mts`, and the demo seed route imports the same
// function. One implementation, two entry points.

import { seedDemo } from "../lib/demo/seed.ts";

const result = await seedDemo();
console.log(
  `Seeded: ${result.guildIds.length} servers, ${result.gamers} gamers, ` +
    `week of ${result.weekStart.toISOString().slice(0, 10)}.`,
);
