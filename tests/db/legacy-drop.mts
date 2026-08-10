// The dropped tables are gone from the code as well as the database. B116.
//
// ===== WHAT THIS IS GUARDING AGAINST =====
//
// B116 dropped seven tables — the badge system and every social table — and
// two columns that only fed them. A drop is the one migration that can be
// undone by accident: `CREATE TABLE IF NOT EXISTS` somewhere else in
// `COLUMN_MIGRATIONS`, a Drizzle table definition somebody re-adds while
// merging, a seed insert, a page that still selects a column. Any of those and
// the boot either recreates what was deleted or crashes on a table that is not
// coming back.
//
// So this suite is deliberately blunt: it reads the source and asserts that
// nothing anywhere still names one of these tables as a thing to create, seed,
// select from or render. That is a check the type checker CANNOT make, because
// `db.execute(sql.raw("SELECT … FROM posts"))` type-checks perfectly.
//
// ===== AND WHY IT RUNS THE MIGRATION TWICE =====
//
// `COLUMN_MIGRATIONS` runs on every connect. A drop that errors the second time
// takes the whole boot with it — every request, not just the one that touched
// the feature. `IF EXISTS` is what makes that safe, and asserting the property
// beats asserting the spelling: the suite builds a demo database, runs the
// statements again on top of it, and requires silence.
//
//   DEMO_DB=1 npx tsx tests/db/legacy-drop.mts

process.env.DEMO_DB = "1";

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const root = new URL("../../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

const { DROPPED_TABLES, DROPPED_COLUMNS, LEGACY_DROP_KEEPS, LEGACY_DROP_STATEMENTS,
  LEGACY_NOTIFICATION_DELETES } = await import("../../lib/legacy-drop.ts");

console.log("== the registry says what it drops, and drops what it says ==");
{
  ok("there are tables listed", DROPPED_TABLES.length === 7, String(DROPPED_TABLES.length));
  for (const t of DROPPED_TABLES) {
    ok(`${t}: has a DROP TABLE statement`,
      LEGACY_DROP_STATEMENTS.includes(`DROP TABLE IF EXISTS "${t}"`));
  }
  for (const { table, column } of DROPPED_COLUMNS) {
    ok(`${table}.${column}: has a DROP COLUMN statement`,
      LEGACY_DROP_STATEMENTS.includes(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${column}"`));
  }

  // The notification sweep must not reach the LIVE quest tier badges, which
  // write under the same `type = 'badge'`. 23 of the 25 rows in production are
  // theirs; a `DELETE … WHERE type = 'badge'` would be a silent, unrecoverable
  // wipe of somebody else's feature that every other check here would pass.
  const byType = LEGACY_NOTIFICATION_DELETES.filter((s) => /'badge'/.test(s));
  ok("the badge notification sweep is narrowed by title", byType.length === 1 && /LIKE 'Badge earned: %'/.test(byType[0]),
    byType.join(" | "));

  // Every statement idempotent. One `DROP TABLE` without `IF EXISTS` in a list
  // that runs on connect is an outage on the second boot.
  const unguarded = LEGACY_DROP_STATEMENTS.filter((s) => !/IF EXISTS/.test(s) && !s.startsWith("DELETE FROM"));
  ok("every statement is IF EXISTS", unguarded.length === 0, unguarded.join(" | "));

  // Children before parents. `comments` referenced `posts`; dropping the parent
  // first would need a CASCADE, and a CASCADE takes things nobody listed.
  const order = (t: string) => DROPPED_TABLES.indexOf(t as (typeof DROPPED_TABLES)[number]);
  ok("comment_reactions is dropped before comments", order("comment_reactions") < order("comments"));
  ok("post_reactions and comments are dropped before posts",
    order("post_reactions") < order("posts") && order("comments") < order("posts"));
  ok("user_badges is dropped before badges", order("user_badges") < order("badges"));

  // Nothing kept is also dropped. The two lists overlapping would mean the
  // registry contradicts itself, and the reader would believe the friendlier one.
  const overlap = LEGACY_DROP_KEEPS.filter((k) => (DROPPED_TABLES as readonly string[]).includes(k));
  ok("nothing on the keep list is also dropped", overlap.length === 0, overlap.join(", "));
}

console.log("\n== the drops actually reach the live database ==");
{
  const idx = read("lib/db/index.ts");
  ok("LEGACY_DROP_STATEMENTS is spread into COLUMN_MIGRATIONS",
    /\.\.\.LEGACY_DROP_STATEMENTS,/.test(idx),
    "a registry nothing runs is a document, not a migration");
  // Inside the array, not after it. `COLUMN_MIGRATIONS` is what boot iterates.
  const arr = idx.slice(idx.indexOf("const COLUMN_MIGRATIONS = ["));
  ok("…inside the array body", arr.indexOf("...LEGACY_DROP_STATEMENTS") < arr.indexOf("\n];"));
}

console.log("\n== nothing in the app still creates, seeds or reads them ==");
{
  // Walk the source. `db.execute(sql.raw(...))` type-checks against a table
  // that does not exist, so the compiler cannot do this one.
  const SKIP = new Set(["node_modules", ".next", ".git", "docs", ".scratch", "public", "drizzle"]);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(root, dir))) {
      if (SKIP.has(e) || e.startsWith(".")) continue;
      const rel = join(dir, e);
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx|mts|mjs)$/.test(e)) files.push(rel);
    }
  };
  walk(".");

  // The registry itself names every one of them — that is its job.
  const EXEMPT = new Set(["lib/legacy-drop.ts", "tests/db/legacy-drop.mts"]);

  const drizzleNames: Record<string, string> = {
    posts: "posts", comments: "comments", post_reactions: "postReactions",
    comment_reactions: "commentReactions", space_expert_scores: "spaceExpertScores",
    badges: "badges", user_badges: "userBadges",
  };

  for (const table of DROPPED_TABLES) {
    const prop = drizzleNames[table];
    const hits: string[] = [];
    for (const f of files) {
      if (EXEMPT.has(f)) continue;
      const src = read(f);
      // A Drizzle handle (`schema.posts`), a raw SQL mention, or a table
      // definition. Each is a live reader or writer of a table that is gone.
      const patterns: [string, RegExp][] = [
        ["schema handle", new RegExp(`schema\\.${prop}\\b`)],
        ["table definition", new RegExp(`pgTable\\("${table}"`)],
        // Case-SENSITIVE on purpose. Lower-casing this matched the sentence
        // "expert tiers were scored entirely from posts, comments and likes"
        // in a comment explaining the removal — prose about a dropped table is
        // the opposite of a leftover reference to one. Every real query in this
        // codebase writes its keywords in capitals.
        ["raw SQL", new RegExp(`(FROM|INTO|UPDATE|JOIN)\\s+"?${table}"?\\b`)],
        ["CREATE TABLE", new RegExp(`CREATE TABLE[^;]*"${table}"`, "i")],
      ];
      for (const [what, re] of patterns) if (re.test(src)) hits.push(`${f} (${what})`);
    }
    ok(`${table}: nothing references it`, hits.length === 0, hits.slice(0, 4).join(", "));
  }

  for (const { table, column } of DROPPED_COLUMNS) {
    const camel = column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const hits = files.filter((f) => !EXEMPT.has(f) &&
      (new RegExp(`\\.${camel}\\b`).test(read(f)) || new RegExp(`"${column}"`).test(read(f))));
    ok(`${table}.${column}: nothing reads it`, hits.length === 0, hits.slice(0, 4).join(", "));
  }
}

console.log("\n== the badge system left nothing behind ==");
{
  const GONE = [
    "lib/badges.ts", "components/BadgeChip.tsx", "components/BadgeCriteriaBuilder.tsx",
    "app/admin/badges/page.tsx", "lib/social-purge.ts", "components/SocialPurgePanel.tsx",
  ];
  for (const f of GONE) {
    let exists = true;
    try { statSync(join(root, f)); } catch { exists = false; }
    ok(`${f} is deleted`, !exists);
  }

  // The admin nav is generated from a list; an entry pointing at a deleted page
  // is a 404 a staff member finds before we do.
  ok("the admin nav has no Badges desk", !read("lib/admin-nav.ts").includes("/admin/badges"));

  // `evaluateBadgesForUser` was called from four places, each wrapped in a
  // try/catch that swallowed the failure. A leftover call would therefore be
  // SILENT rather than loud, which is exactly why it is asserted here.
  const callers = ["lib/sync.ts", "lib/link-account.ts", "app/actions/social.ts",
    "app/actions/connections.ts", "app/api/auth/[provider]/callback/route.ts"];
  for (const f of callers) {
    ok(`${f} no longer awards badges`, !/BadgesForUser|grantBadgeByCode/.test(read(f)));
  }

  // Quest tier badges are a DIFFERENT, live thing — the same word, a system
  // that pays out. Removing it by mistake while chasing this one is the failure
  // mode worth pinning down.
  ok("the quest tier system is untouched", /quest_tiers/.test(read("lib/db/schema.ts")));
  ok("…and trophies are still the award", /export const trophies = pgTable\("trophies"/.test(read("lib/db/schema.ts")));
}

console.log("\n== a boot after the drop is a no-op, not an error ==");
{
  const { getDb } = await import("../../lib/db/index.ts");
  const { sql } = await import("drizzle-orm");
  const db = await getDb();

  // The demo database was just built from DDL + migrations, so the drops have
  // already run once. Run them again — this is boot number two.
  let second: string | null = null;
  try {
    for (const stmt of LEGACY_DROP_STATEMENTS) await db.execute(sql.raw(stmt));
  } catch (e) { second = String(e).slice(0, 160); }
  ok("running every drop a second time throws nothing", second === null, second ?? "");

  // And the tables really are absent afterwards, rather than the statements
  // having quietly been no-ops against a database that still has them.
  for (const table of DROPPED_TABLES) {
    let present = false;
    try { await db.execute(sql.raw(`SELECT 1 FROM "${table}" LIMIT 1`)); present = true; } catch { /* expected */ }
    ok(`${table} is not in the demo database`, !present);
  }

  // The keeps survived the same boot. A drop list that took `spaces` with it
  // would pass every check above and break the entire product.
  for (const table of LEGACY_DROP_KEEPS) {
    let present = false;
    try { await db.execute(sql.raw(`SELECT 1 FROM "${table}" LIMIT 1`)); present = true; } catch { /* fail below */ }
    ok(`${table} still exists`, present);
  }
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => `  ✗ ${f}`).join("\n")); process.exit(1); }
