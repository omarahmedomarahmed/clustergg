// Apply every generated migration to the real database.
//
// Runs at deploy, never by hand and never by the owner — house rule: the owner
// has no terminal, ever. On Vercel this is the build command's first step; the
// generated SQL in `drizzle/` is the only thing that has ever created a table.
//
// House rule 6 — a production database is read-only to a session — is about
// data, not about schema: this script may create and alter, and it may not
// touch a row.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { isNeonUrl } from "../lib/db/index.ts";

const folder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
);

const url = process.env.DATABASE_URL;
if (!url) {
  // The demo database migrates itself on boot. Failing loudly here is better
  // than a deploy that silently migrates nothing and reports success.
  console.error(
    "DATABASE_URL is not set. Nothing to migrate — the demo database " +
      "applies these same files in-process on boot.",
  );
  process.exit(1);
}

if (isNeonUrl(url)) {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(drizzle(neon(url)), { migrationsFolder: folder });
} else {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: folder });
  await pool.end();
}

console.log("Migrations applied.");
