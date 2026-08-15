// The one place that decides which database this process is talking to.
//
// There are three, and the difference matters enough that every caller reads
// it from here rather than sniffing the environment itself:
//
//   * DEMO — no `DATABASE_URL`. An in-process PGlite database, migrated from
//     the same SQL files production is migrated from. This is what the test
//     band and the local demo run against, and it is why the suite needs
//     nothing running.
//   * NEON — a `DATABASE_URL` pointing at Neon. Reads go over the HTTP driver,
//     which is fast and stateless. Money paths open a pooled connection of
//     their own in `lib/db/tx.ts`, because the HTTP driver cannot open an
//     interactive transaction.
//   * PLAIN POSTGRES — any other `DATABASE_URL`. node-postgres, pooled.
//
// The handle is created once per runtime and reused. `getDb()` is async
// because two of the three drivers are dynamic imports: a demo run must not
// pull Neon's driver into the bundle, and production must not pull PGlite's
// WASM.

import * as schema from "./schema";

export { schema };

/** The query surface every caller programs against, whichever driver is under it. */
export type DB = Awaited<ReturnType<typeof createDb>>;

/**
 * True when this process has no database of its own and runs one in-process.
 *
 * Deliberately derived from the absence of `DATABASE_URL` rather than from a
 * `DEMO=1` flag. A flag can disagree with reality; this cannot.
 */
export const isDemoMode = !process.env.DATABASE_URL;

/** Neon's serverless endpoints, which need the HTTP or WebSocket drivers. */
export function isNeonUrl(url: string): boolean {
  return /(^|[.@])neon\.tech([:/]|$)/.test(url) || url.includes("neon.tech");
}

declare global {
  // eslint-disable-next-line no-var
  var __clusterDb: Promise<unknown> | undefined;
}

async function createDb() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    // In-process. `migrateDemo` runs the same generated SQL production runs,
    // so a table that exists here exists there — which is the only reason a
    // test against this database says anything about production.
    // `webpackIgnore` leaves this import alone for Node to resolve at runtime.
    // PGlite loads its WebAssembly through `new URL(...)` and `fs.readFile`;
    // bundled, webpack rewrites that URL into its own class and Node rejects
    // it with "must be of type string or Buffer or URL. Received an instance
    // of URL" — an error that reads as impossible until you know why. It cost
    // an hour, so it is written down. `serverExternalPackages` alone did not
    // fix it; the import has to be invisible to the bundler.
    const { PGlite } = await import(
      /* webpackIgnore: true */ "@electric-sql/pglite"
    );
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrateDemo(db);
    return db as unknown as PlatformDb;
  }

  if (isNeonUrl(url)) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema }) as unknown as PlatformDb;
  }

  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  return drizzle(new Pool({ connectionString: url, max: 8 }), {
    schema,
  }) as unknown as PlatformDb;
}

// The three drivers have structurally identical query builders but nominally
// different types. Naming the shape once keeps `DB` from resolving to a union
// that no helper can accept.
type PlatformDb = Awaited<
  ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>
>;

/** The connection for this runtime, created once. */
export function getDb(): Promise<DB> {
  if (!globalThis.__clusterDb) {
    globalThis.__clusterDb = createDb().catch((e) => {
      globalThis.__clusterDb = undefined;
      throw e;
    });
  }
  return globalThis.__clusterDb as Promise<DB>;
}

/**
 * Apply every generated migration to the in-process database.
 *
 * Reads the same `drizzle/` folder `db:migrate` pushes to production. A demo
 * database built by `CREATE TABLE` statements written by hand would drift from
 * production the first time somebody forgot one, and the suite would keep
 * passing while doing so.
 */
async function migrateDemo(db: unknown): Promise<void> {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const path = await import("node:path");
  // From the working directory, not from `import.meta.url`. A bundler rewrites
  // module URLs — Next's server build turns this file's own URL into something
  // `fileURLToPath` will not accept — and the demo database is only ever run
  // from the project root, by the suite or by `next start`. Production never
  // reaches here: it has a DATABASE_URL and migrates through
  // `scripts/migrate.mts` at deploy.
  await migrate(db as never, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
}

/**
 * Throw away the in-process database and start a clean one.
 *
 * Test-band only, and it refuses to run against anything else — a suite that
 * could drop a real database is one environment variable away from doing it.
 */
export async function resetDemoDb(): Promise<DB> {
  if (!isDemoMode) throw new Error("resetDemoDb is demo-mode only");

  // Truncate rather than rebuild. Standing up a fresh PGlite instance takes
  // about a second — which is nothing until a suite calls this a hundred and
  // fifty times and the band takes four minutes, at which point breaking a
  // guard to prove it costs eight. The tables are emptied instead, which is
  // the same isolation for a hundredth of the time.
  //
  // The table list comes from the database, not from a list here. A guard with
  // a hand-maintained list only guards the tables somebody remembered, and the
  // table somebody forgets is the one that leaks a row into the next test.
  const existing = globalThis.__clusterDb;
  if (existing) {
    const db = (await existing) as DB;
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    );
    const list = (Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])) as {
      tablename: string;
    }[];
    const names = list
      .map((r) => r.tablename)
      .filter((n) => !n.startsWith("__drizzle"))
      .map((n) => `"${n}"`)
      .join(", ");
    if (names) await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
    return db;
  }

  return getDb();
}
