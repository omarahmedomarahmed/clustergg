#!/usr/bin/env node
/**
 * Retire the pre-pivot copy that is still overriding the defaults in production.
 *
 * ===== WHY THIS EXISTS =====
 *
 * `platform_settings` overrides `CONTENT_DEFAULTS`. Seven rows in production
 * still hold copy from an earlier pivot, so the live site sells the old
 * gamer-identity product while the code describes the marketplace:
 *
 *   footer.tagline               "Every game. One identity. Link your accounts,
 *                                 flex your ranks, and climb the galaxy."
 *   hero.badge                   "Live stat sync across real game networks"
 *   hero.subtitle                "…into one shareable cosmic profile"
 *   section.cta.title            "Your gaming legacy, one link"
 *   section.cta.subtitle         "clustergg.com/u/you — the only link a gamer
 *                                 needs in their bio."
 *   section.challenges.subtitle  "Real API data. Real stakes."
 *   section.games.subtitle       "Every world we track — pick yours…"
 *
 * An override beats a default, so the current copy for those keys has never been
 * visible on clustergg.com. The brand-facing keys are NOT overridden, which is
 * why the live site reads as two products stitched together.
 *
 * ===== WHY IT DELETES RATHER THAN REWRITES =====
 *
 * Deleting the row makes the key fall through to `CONTENT_DEFAULTS`, which is
 * the current copy, is in version control, is reviewed, and is guarded by
 * `tests/db/public-copy.mts`. Writing new strings into the database instead
 * would put the live website back outside all of that — which is the mechanism
 * that produced this problem in the first place.
 *
 * Any key an admin genuinely wants to override can be re-edited afterwards in
 * Admin → Content, and it will then be a deliberate override rather than a
 * fossil.
 *
 * ===== HOW TO RUN IT =====
 *
 *   DATABASE_URL=<production> node scripts/retire-prepivot-copy.mjs          # dry run
 *   DATABASE_URL=<production> node scripts/retire-prepivot-copy.mjs --apply  # do it
 *
 * Dry run by default, on purpose: this changes what the public website says.
 * It prints the exact current value and the default that will replace it, so
 * the diff is reviewable before anything is deleted. Idempotent — a second run
 * finds nothing to do.
 */
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const URL_ = process.env.DATABASE_URL;
if (!URL_) {
  console.error("DATABASE_URL is not set. Point it at the database you mean to change.");
  process.exit(1);
}

/**
 * The keys to retire.
 *
 * A hand-listed set, deliberately: this deletes production rows, and "every key
 * whose value differs from its default" would also sweep away the branding,
 * artwork and ids an admin has legitimately customised. Each entry below was
 * read against the live value first.
 */
const KEYS = [
  "footer.tagline",
  "hero.badge",
  "hero.subtitle",
  "section.cta.title",
  "section.cta.subtitle",
  "section.challenges.subtitle",
  "section.games.subtitle",
];

// The defaults, read out of the source rather than imported — this is a plain
// .mjs script and lib/cms.ts is TypeScript that pulls in the database layer.
function defaultsFromSource() {
  const src = readFileSync(new URL("../lib/cms.ts", import.meta.url), "utf8");
  const out = {};
  for (const key of KEYS) {
    const m = new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(src);
    if (m) { try { out[key] = JSON.parse(m[1]); } catch { /* leave unset */ } }
  }
  return out;
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(URL_);
const defaults = defaultsFromSource();

const rows = await sql`SELECT key, value #>> '{}' AS text FROM platform_settings WHERE key = ANY(${KEYS})`;
if (!rows.length) {
  console.log("Nothing to do — none of these keys is overridden.");
  process.exit(0);
}

console.log(`${rows.length} override(s) found.${APPLY ? "" : "  DRY RUN — nothing will change."}\n`);
let missingDefault = 0;
for (const r of rows) {
  const def = defaults[r.key];
  console.log(`  ${r.key}`);
  console.log(`    live:    ${JSON.stringify((r.text ?? "").slice(0, 110))}`);
  console.log(`    default: ${def === undefined ? "(!! not found in lib/cms.ts — SKIPPED)" : JSON.stringify(def.slice(0, 110))}`);
  if (def === undefined) missingDefault++;
  console.log("");
}

// Refuse to delete a row whose default could not be read: that would leave the
// key with no value at all, which is worse than the stale one it replaced.
const deletable = rows.filter((r) => defaults[r.key] !== undefined).map((r) => r.key);
if (missingDefault) {
  console.log(`${missingDefault} key(s) have no readable default and will be left alone.\n`);
}

if (!APPLY) {
  console.log(`Re-run with --apply to delete ${deletable.length} row(s) and fall through to the defaults above.`);
  process.exit(0);
}
if (!deletable.length) { console.log("Nothing safe to delete."); process.exit(0); }

await sql`DELETE FROM platform_settings WHERE key = ANY(${deletable})`;
console.log(`Deleted ${deletable.length} override(s). Those keys now render from CONTENT_DEFAULTS.`);
console.log("The site is cached — redeploy or wait for revalidation to see it.");
