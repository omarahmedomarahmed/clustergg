// Stage 0's own proof: the foundation is real, not merely present.
//
// "Done when it builds" is not enough for a database layer. What must be true
// is that the suite's database was created by the same migrations production
// gets, that a transaction is a real transaction, and that the row lock every
// money path will sit behind actually locks something.

import { ok, eq } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { getDb, isDemoMode, isNeonUrl, schema, resetDemoDb } from "../../lib/db/index.ts";
import { withTx, lockGamer } from "../../lib/db/tx.ts";
import { uid, slugify } from "../../lib/core/utils.ts";
import { eq as sqlEq, sql } from "drizzle-orm";
import { createGamer } from "../../lib/identity/gamers.ts";

test("the band runs against an in-process database and needs nothing running", () => {
  ok(isDemoMode, "no DATABASE_URL is set, so the suite owns its own database");
});

test("Neon URLs are told apart from ordinary Postgres", () => {
  ok(isNeonUrl("postgres://u:p@ep-cool-name-123.eu-central-1.aws.neon.tech/db"),
    "a Neon host is recognised, because it needs the HTTP driver");
  eq(isNeonUrl("postgres://u:p@localhost:5432/clustergg"), false,
    "a local Postgres is not routed through Neon's driver");
});

test("the demo database was built by the migrations, not by hand", async () => {
  const db = await getDb();
  // If the table exists, `drizzle/0000_*.sql` ran. A hand-written CREATE TABLE
  // in the test setup would drift from production the first time somebody
  // forgot to mirror one, and this assertion would keep passing while it did.
  const rows = await db.execute(
    sql`select table_name from information_schema.tables where table_name = 'users'`,
  );
  const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
  eq(list.length, 1, "the users table exists because a migration created it");

  const applied = await db.execute(
    sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
  );
  const arr = Array.isArray(applied)
    ? applied
    : ((applied as { rows?: unknown[] }).rows ?? []);
  const n = (arr[0] as { n: number }).n;
  ok(n >= 1, "the migration journal recorded at least one applied migration");
});

test("a row can be written and read back", async () => {
  const db = await getDb();
  const id = uid();
  await db.insert(schema.users).values({
    id,
    slug: `t-${id.toLowerCase().slice(0, 8)}`,
    displayName: "Test Gamer",
  });
  const found = await db.select().from(schema.users).where(sqlEq(schema.users.id, id));
  eq(found.length, 1, "the row written is the row read");
  eq(found[0].status, "active", "a new account defaults to active");
  eq(found[0].email, null, "no email is asked at onboarding, so none is stored");
  eq(found[0].ageBand, null, "age band is null until onboarding sets it");
});

test("a transaction is a real transaction, and a failure rolls back", async () => {
  const db = await getDb();
  const id = uid();

  let threw = false;
  try {
    await withTx(db, async (tx) => {
      await tx.insert(schema.users).values({
        id,
        slug: `rb-${id.toLowerCase().slice(0, 8)}`,
        displayName: "Rolled Back",
      });
      throw new Error("deliberate");
    });
  } catch {
    threw = true;
  }

  ok(threw, "withTx does not swallow the error — a failed money path must throw");
  const found = await db.select().from(schema.users).where(sqlEq(schema.users.id, id));
  eq(found.length, 0, "and the write inside it was rolled back");
});

test("the gamer row lock finds the gamer it is asked to lock", async () => {
  const db = await getDb();
  const id = uid();
  await db.insert(schema.users).values({
    id,
    slug: `lk-${id.toLowerCase().slice(0, 8)}`,
    displayName: "Locked",
  });

  const locked = await withTx(db, (tx) => lockGamer(tx, id));
  eq(locked, true, "an existing gamer is locked");

  const missing = await withTx(db, (tx) => lockGamer(tx, uid()));
  eq(missing, false, "a gamer who does not exist reports as not locked");
});

test("the ported slug helper does not turn a non-Latin name into 'gamer'", () => {
  // Wired from ported/core/utils.ts. The comment in that file records what
  // this used to do: 日本語ゲーマー became /u/gamer, and the first such person
  // permanently occupied the bare slug.
  eq(slugify("Café Player"), "cafe-player", "accents decompose rather than vanish");
  eq(slugify("Привет"), "privet", "Cyrillic transliterates to something readable");
  eq(slugify("日本語ゲーマー"), "", "a script with no transliteration returns empty, honestly");
});

test("a gamer whose name does not transliterate still gets a slug that says what they are", async () => {
  // ===== THE FALLBACK, ASSERTED WHERE IT ACTUALLY HAPPENS =====
  //
  // This used to call `slugifyOr` — a helper whose only caller was this line
  // (`94-export-reach`). The live fallback is inside `freeSlug`, which
  // `createGamer` uses, so the property is now asserted through the door: an
  // empty transliteration must not produce the bare word, because the first
  // such person would occupy `/u/gamer` permanently.
  const db = await resetDemoDb();
  const id = await createGamer(db, { displayName: "日本語ゲーマー" });
  const [row] = await db
    .select({ slug: schema.users.slug })
    .from(schema.users)
    .where(sqlEq(schema.users.id, id));

  ok(row.slug.length > 0, "they get a slug");
  eq(row.slug, `gamer-${id.toLowerCase().slice(0, 6)}`, "which says what the thing is");
  ok(row.slug !== "gamer", "and never the bare word, which one person would own forever");
});

test("the demo database can be reset between fixtures", async () => {
  const db = await getDb();
  const id = uid();
  await db.insert(schema.users).values({
    id,
    slug: `rs-${id.toLowerCase().slice(0, 8)}`,
    displayName: "Before Reset",
  });

  const fresh = await resetDemoDb();
  const found = await fresh
    .select()
    .from(schema.users)
    .where(sqlEq(schema.users.id, id));
  eq(found.length, 0, "a reset database starts empty, migrated, and usable");
});
