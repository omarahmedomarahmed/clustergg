import * as schema from "./schema";

export type DB = ReturnType<typeof import("drizzle-orm/neon-http").drizzle<typeof schema>> |
  ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __clusterDb: Promise<DB> | undefined;
}

export const isDemoMode = !process.env.DATABASE_URL;

async function createDb(): Promise<DB> {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const sql = neon(process.env.DATABASE_URL);
    return drizzle(sql, { schema }) as DB;
  }
  // Demo mode: in-memory Postgres (PGlite). Fully functional; resets on cold start.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = drizzle(client, { schema }) as DB;
  const { DDL } = await import("./ddl");
  await client.exec(DDL);
  const { seed } = await import("./seed");
  await seed(db, { demo: true });
  return db;
}

export function getDb(): Promise<DB> {
  if (!globalThis.__clusterDb) globalThis.__clusterDb = createDb();
  return globalThis.__clusterDb;
}

export { schema };
