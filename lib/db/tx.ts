// B74 — the only place on this platform where a transaction is possible.
//
// THE FINDING, stated exactly, because it is the one that makes every other
// number untrustworthy: the app talks to Postgres over `drizzle-orm/neon-http`
// (`lib/db/index.ts`), and the HTTP driver **cannot open an interactive
// transaction**. Not "does not" — cannot. Every statement is its own request.
// So every money path on the platform was a read-then-write race:
//
//   * `awardQuestAction` read what a gamer had earned today, then inserted.
//     Two requests that land together both read the same number, both find the
//     same room under the 500 ceiling, and both pay. The ceiling is the entire
//     cost model.
//   * `buyTrophy` read the balance, then inserted the order. Two purchases
//     together spend the same CP twice.
//   * `requestRedeem` did the same for real money.
//
// A row lock does not help without a transaction to hold it in, so the fix is
// necessarily this layer first and the callers second.
//
// WHAT THIS MODULE DOES: it opens a SECOND connection to the same database
// using the POOLED driver (`neon-serverless` over WebSocket), which does
// support interactive transactions. Reads stay on the HTTP driver, which is
// faster and is most of the traffic. Only the money paths pay for a pool.
//
// Demo mode already had transactions — PGlite supports them natively — so the
// same code runs in the suite and in production, which is what makes the
// concurrency test meaningful at all.

import type { DB } from "./index";
import { isDemoMode, isNeonUrl, schema } from "./index";
import { eq, sql } from "drizzle-orm";

/**
 * A transaction handle.
 *
 * Typed as `DB` on purpose. The query-builder surface is identical, so every
 * existing helper that takes a `DB` — `cpEarnedToday`, `cpWallet`, `priceOf`'s
 * rate lookup — can be called with a transaction handle unchanged and will run
 * INSIDE the transaction. That is the property that makes converting a caller a
 * small diff instead of a rewrite, and it is why this alias exists rather than
 * a new type nobody's helpers accept.
 */
export type Tx = DB;

declare global {
  // eslint-disable-next-line no-var
  var __clusterTxDb: Promise<DB> | undefined;
}

async function createTxDb(): Promise<DB> {
  // An ordinary Postgres (CI, local, self-hosted). node-postgres pools real
  // connections, so `FOR UPDATE` here is a genuine cross-connection lock — this
  // is the driver under which `tests/db/concurrency.mts` actually exercises the
  // contention it claims to test, rather than getting serialisation for free
  // from PGlite.
  if (process.env.DATABASE_URL && !isNeonUrl(process.env.DATABASE_URL)) {
    const { Pool: PgPool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    return drizzle(new PgPool({ connectionString: process.env.DATABASE_URL, max: 8 }),
      { schema }) as unknown as DB;
  }

  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");

  // The pooled driver speaks WebSocket, and this is the sharpest thing the
  // round-2 review found — a defect introduced BY the fix above.
  //
  // Node 22+ (see `engines`, and `.nvmrc`) provides a global WebSocket and
  // every edge runtime we deploy to does too. On Node 20 there is none, so
  // every money path on the platform would throw: loudly on a purchase or a
  // redemption, and on a CP award only into the logs, because that path
  // deliberately does not block the action underneath it. A silent total stop
  // to CP earning is the worst failure mode in this file, and it would have
  // been one project-settings click away.
  //
  // So: pinned AND polyfilled. The pin is the intent; this is what happens when
  // somebody overrides it.
  if (typeof globalThis.WebSocket === "undefined") {
    const ws = await import("ws");
    neonConfig.webSocketConstructor = (ws.default ?? ws) as unknown as typeof WebSocket;
  }
  // Small on purpose: this pool serves money paths only, and a serverless
  // function that holds ten idle sockets is a bill, not a feature.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  return drizzle(pool, { schema }) as unknown as DB;
}

/**
 * The pooled connection, created once per runtime and reused.
 *
 * Production only. In demo mode there is nothing to pool — PGlite is one
 * in-process database — and calling `getDb()` from here would DEADLOCK: the
 * boot seed awards CP while `getDb()`'s own promise is still unresolved, so a
 * money path would await the very bootstrap that is calling it. Found by
 * running the suite, not by reading. Demo mode uses the caller's handle
 * instead, which it already has.
 */
export function getTxDb(): Promise<DB> {
  if (!globalThis.__clusterTxDb) {
    globalThis.__clusterTxDb = createTxDb().catch((e) => {
      globalThis.__clusterTxDb = undefined;
      throw e;
    });
  }
  return globalThis.__clusterTxDb;
}

/**
 * Run `fn` inside a real transaction.
 *
 * **Errors are NOT swallowed.** That is deliberate and it is half the fix: the
 * report's finding was not only that there were no transactions but that money
 * paths sat under bare `catch {}`, so a failed write and a successful one were
 * indistinguishable to the caller. A money path that cannot complete must throw
 * and the transaction must roll back. Callers that genuinely must not block a
 * user action (quest awards, which ride on top of real actions) catch at THEIR
 * level, where the decision is visible, and log.
 */
export async function withTx<T>(caller: DB, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // Demo mode transacts on the handle the caller already holds — see getTxDb().
  const db = isDemoMode ? caller : await getTxDb();
  // Drizzle's `.transaction()` exists on both drivers we use here. On the HTTP
  // driver it throws — which is exactly why this module does not use it.
  return (db as unknown as {
    transaction: (cb: (tx: Tx) => Promise<T>) => Promise<T>;
  }).transaction(fn);
}

/**
 * Take the lock that serializes everything money-related for ONE gamer.
 *
 * `SELECT … FOR UPDATE` on the gamer's own row. Every CP award, purchase and
 * redemption for that gamer queues behind it; two different gamers never wait
 * on each other. Locking the user row rather than the ledger is what makes this
 * correct: the thing being protected is not a row, it is the INVARIANT computed
 * across many rows (today's total, the balance), and you cannot lock a sum.
 *
 * Must be called first inside the transaction, before the read whose answer the
 * write depends on. Called after that read it locks nothing that matters.
 */
export async function lockGamer(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.execute(
    sql`select id from ${schema.users} where ${schema.users.id} = ${userId} for update`,
  );
  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [];
  return list.length > 0;
}

/** True when the pooled driver is genuinely a different connection to the same data. */
export const pooledDriverInUse = () => !isDemoMode;

// Re-exported so a money path imports one module rather than three.
export { eq, schema };
