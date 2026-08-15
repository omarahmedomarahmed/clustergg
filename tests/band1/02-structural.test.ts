// Check 5 from docs/07-DATA-MODEL.md: "No column anywhere that could hold a
// payment detail — fail the build." The document puts this check in the test
// suite explicitly, so here it is.
//
// House rule 5 is absolute: not an IBAN, not a card, not a last four. A
// redemption stores a method *word* and an opaque provider handle, and nothing
// else. The reason it is structural rather than a code review is that the
// column arrives long before the code that fills it, and by then it looks like
// it was always meant to be there.
//
// It walks the tree. There is no list of schema files.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";

// …/tests/band1/this-file → …/tests/band1 → …/tests → the repository root.
const repoRoot = path.dirname(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
);

/**
 * Column-name fragments that describe a payment instrument.
 *
 * Deliberately about the *shape* of the data, not about one provider's
 * spelling. "Assert properties, not strings" cuts both ways: a guard listing
 * `stripe_card_last4` catches one name and misses `cardLastFour`.
 */
const INSTRUMENT = [
  "iban", "bic", "swift", "sortcode", "sort_code",
  "cardnumber", "card_number", "pan", "cvv", "cvc",
  "lastfour", "last_four", "last4", "expirymonth", "expiry_month",
  "accountnumber", "account_number", "routingnumber", "routing_number",
  "cardholder", "card_holder",
];

/**
 * Names that contain a banned fragment but describe something else entirely.
 *
 * **Every entry must still describe something real or this suite fails.** An
 * allowance that outlives what it excused is how a deleted rule comes back —
 * so the allowlist is self-expiring, checked below.
 */
const ALLOWED: { name: string; because: string }[] = [];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === "ported" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(ts|tsx|sql)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Column names as they appear in a drizzle table or in generated SQL. */
async function columnNames(): Promise<{ file: string; column: string }[]> {
  const found: { file: string; column: string }[] = [];
  for (const file of await walk(repoRoot)) {
    if (file.includes(`${path.sep}tests${path.sep}`)) continue;
    const src = await fs.readFile(file, "utf8");

    // drizzle: `text("card_number")`, `integer("last4")`, …
    for (const m of src.matchAll(
      /\b(?:text|integer|bigint|numeric|boolean|timestamp|jsonb|uuid|varchar|date|real|doublePrecision)\s*\(\s*["']([^"']+)["']/g,
    )) {
      found.push({ file: path.relative(repoRoot, file), column: m[1] });
    }

    // generated SQL: `"card_number" text NOT NULL`
    for (const m of src.matchAll(/^\s*"([a-z0-9_]+)"\s+[a-z]/gim)) {
      found.push({ file: path.relative(repoRoot, file), column: m[1] });
    }
  }
  return found;
}

test("the walk actually reaches the schema", async () => {
  const columns = await columnNames();
  ok(columns.length > 0, "column names were found by walking the tree");
  ok(
    columns.some((c) => c.column === "display_name"),
    "a known column is among them, so the matcher is reading real declarations",
  );
  ok(
    columns.some((c) => c.file.endsWith(".sql")),
    "generated SQL is walked too — a column can arrive in a migration alone",
  );
});

test("no column anywhere could hold a payment detail", async () => {
  const columns = await columnNames();
  const allowed = new Set(ALLOWED.map((a) => a.name));
  const offenders = columns
    .filter((c) => {
      const flat = c.column.toLowerCase().replace(/[^a-z0-9]/g, "");
      return INSTRUMENT.some((frag) => flat.includes(frag.replace(/_/g, "")));
    })
    .filter((c) => !allowed.has(c.column))
    .map((c) => `${c.file}: ${c.column}`);

  eq(
    offenders,
    [],
    "a redemption stores a method word and an opaque handle. Nothing account-shaped",
  );
});

test("the payment-detail allowlist has not outlived its subjects", async () => {
  const columns = await columnNames();
  const live = new Set(columns.map((c) => c.column));
  const stale = ALLOWED.filter((a) => !live.has(a.name)).map((a) => a.name);
  eq(
    stale,
    [],
    "every allowlist entry still describes a column that exists — an allowance " +
      "that outlives what it excused is how a deleted rule comes back",
  );
});

test("nothing stores a balance", async () => {
  // Law 1: a balance is sum(ledger). A stored one cannot be reconstructed
  // after it goes wrong, and eventually every one of them does.
  const columns = await columnNames();
  const offenders = columns
    .filter((c) => /^(balance|.*_balance|cached_.*|.*_total_cached)$/.test(c.column))
    .map((c) => `${c.file}: ${c.column}`);
  eq(offenders, [], "no stored balance column, anywhere, ever");
});
