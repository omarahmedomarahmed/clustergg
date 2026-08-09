// Only one instance replays the migration list. B106.
//
// THE DEFECT: B80 made the STEADY state cheap — one tiny read of a fingerprint
// marker and the ~1000-statement list is skipped. It did nothing about the one
// moment the fingerprint changes. On that deploy, every cold instance reads
// "not run yet" at the same instant, and every one of them starts replaying the
// same list of ALTER TABLEs, each taking ACCESS EXCLUSIVE on `users`, against a
// database that is simultaneously serving the traffic that woke them.
//
// Nothing corrupts — the statements are idempotent. The site just stops
// answering for the length of the lock queue, on the deploy, which is exactly
// when somebody is watching it.
//
//   DEMO_DB=1 npx tsx tests/db/cold-start.mts

process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const dbmod = await import("../../lib/db/index.ts");
const {
  getDb, claimMigrations, releaseMigrations, migrationsAlreadyRun, migrationsFingerprint,
  MIGRATION_CLAIM_SECONDS, MIGRATION_WAIT_MS,
} = dbmod;
const { sql } = await import("drizzle-orm");

const db = await getDb();
const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows?: unknown[] })?.rows ?? [])) as Record<string, unknown>[];
const claimRows = async () =>
  rows(await db.execute(sql`SELECT "value", "updated_at" FROM "schema_state" WHERE "key" = 'column_migrations:claim'`));

// The demo DB boots through the same path, so a claim may or may not be lying
// around. Start from a known empty one.
await releaseMigrations(db);

console.log("== the claim is exclusive ==");
{
  const fp = "test-fingerprint-a";
  const first = await claimMigrations(db, fp);
  const second = await claimMigrations(db, fp);
  const third = await claimMigrations(db, fp);

  ok("the first boot wins the claim", first === true);
  ok("the second boot does not", second === false,
    "two instances replaying ~1000 ALTERs at once is the whole defect");
  ok("…nor the third", third === false);
  eq("and there is exactly one claim row", (await claimRows()).length, 1);
}

console.log("\n== releasing hands it to the next boot ==");
{
  await releaseMigrations(db);
  eq("release removes the row", (await claimRows()).length, 0);
  ok("so the next boot can win it", await claimMigrations(db, "test-fingerprint-b") === true);
  await releaseMigrations(db);
}

console.log("\n== a dead holder cannot wedge the platform ==");
{
  // The holder is a lambda, and lambdas get killed. If a claim outlived its
  // owner with no takeover, migrations would never run again — a failure mode
  // strictly worse than the stampede this fix exists to prevent.
  await claimMigrations(db, "test-fingerprint-c");
  eq("a fresh claim blocks the next boot", await claimMigrations(db, "test-fingerprint-c"), false);

  await db.execute(sql.raw(
    `UPDATE "schema_state" SET "updated_at" = now() - interval '${MIGRATION_CLAIM_SECONDS + 60} seconds'
       WHERE "key" = 'column_migrations:claim'`,
  ));
  ok("…but a claim older than the window is taken over",
    await claimMigrations(db, "test-fingerprint-c") === true,
    "a crashed lambda would otherwise block migrations forever");
  eq("…and the takeover leaves one row, not two", (await claimRows()).length, 1);
  await releaseMigrations(db);

  // Just inside the window is still held — otherwise a slow-but-alive run gets
  // trampled, which is the stampede again with extra steps.
  await claimMigrations(db, "test-fingerprint-d");
  await db.execute(sql.raw(
    `UPDATE "schema_state" SET "updated_at" = now() - interval '${Math.max(1, MIGRATION_CLAIM_SECONDS - 30)} seconds'
       WHERE "key" = 'column_migrations:claim'`,
  ));
  eq("a claim still inside the window is respected", await claimMigrations(db, "test-fingerprint-d"), false);
  await releaseMigrations(db);
}

console.log("\n== the numbers are the right shape ==");
{
  ok("the claim window outlasts a real migration run", MIGRATION_CLAIM_SECONDS >= 60,
    String(MIGRATION_CLAIM_SECONDS));
  ok("…but is not so long a crash wedges a deploy", MIGRATION_CLAIM_SECONDS <= 600,
    String(MIGRATION_CLAIM_SECONDS));
  ok("a loser waits, rather than stampeding immediately", MIGRATION_WAIT_MS >= 1000,
    String(MIGRATION_WAIT_MS));
  ok("…but never long enough to time out a cold request", MIGRATION_WAIT_MS <= 15000,
    String(MIGRATION_WAIT_MS));
  ok("the wait is shorter than the claim window",
    MIGRATION_WAIT_MS / 1000 < MIGRATION_CLAIM_SECONDS,
    "a loser that waited past the window would take over a live run");
}

console.log("\n== the claim is one statement, and it fails open ==");
{
  const src = code("lib/db/index.ts");
  ok("the claim is an atomic insert, not read-then-write",
    /INSERT INTO "schema_state"[\s\S]{0,200}ON CONFLICT \("key"\) DO NOTHING[\s\S]{0,60}RETURNING/.test(src),
    "a SELECT then INSERT leaves a window both instances pass through");
  ok("winning is decided by whether a row came back",
    /return rowsOf\(r\)\.length > 0;/.test(src));
  ok("a claim failure runs the migrations rather than skipping them",
    /export async function claimMigrations[\s\S]{0,2000}catch \{\s*return true;\s*\}/.test(src),
    "failing closed means a missing column, which breaks the site permanently");
  ok("the claim is released in a finally", /\} finally \{[\s\S]{0,300}releaseMigrations\(db\)/.test(src),
    "a throw mid-list must not hold the claim for the full window");
}

console.log("\n== the loser waits for the marker, then proceeds ==");
{
  const src = code("lib/db/index.ts");
  ok("a loser polls for the completion marker",
    /if \(!await claimMigrations\(db, fingerprint\)\)[\s\S]{0,600}migrationsAlreadyRun\(db, fingerprint\)\) return;/.test(src),
    "the common case is: the winner finishes and this boot does nothing at all");
  ok("…and gives up after a bounded wait",
    /Date\.now\(\) \+ MIGRATION_WAIT_MS/.test(src) && /while \(Date\.now\(\) < until\)/.test(src));
  ok("…and says so when it proceeds anyway",
    /console\.warn\("\[migrate\] claim held elsewhere/.test(src));
  ok("the fingerprint check still short-circuits before any claim",
    src.indexOf("if (await migrationsAlreadyRun(db, fingerprint)) return;")
      < src.indexOf("if (!await claimMigrations(db, fingerprint))"),
    "steady state must stay one tiny read — B80");
}

console.log("\n== the marker itself still works ==");
{
  const fp = migrationsFingerprint();
  ok("the fingerprint is stable across calls", migrationsFingerprint() === fp, fp);
  ok("…and the demo boot recorded it", await migrationsAlreadyRun(db, fp),
    "the demo database boots through runColumnMigrations");
  ok("…and a different list would not match", !(await migrationsAlreadyRun(db, `${fp}-x`)));
  eq("no claim is left behind after boot", (await claimRows()).length, 0);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
