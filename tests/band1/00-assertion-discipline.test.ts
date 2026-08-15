// The guard on the rule that this whole test band rests on.
//
// `tests/helpers/assert.ts` explains the incident: 99 suites, most declaring
// their own `ok`/`eq`/`near`, one declaring none, three assertions that called
// a SQL builder and could never fail — one of them the guard protecting the
// server pool from being drained by private challenges.
//
// The rule is "shared assertion helpers live in one module". A rule nobody
// checks is a preference, so this checks it. It walks the tree rather than
// carrying a file list, because a hand-maintained list only ever guards the
// files somebody remembered.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq, AssertionError } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";

const testsRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(testsRoot);
const THE_MODULE = path.join(testsRoot, "helpers", "assert.ts");

/** The names no suite may bind for itself. */
const RESERVED = ["ok", "no", "eq", "near", "throws"];

async function walk(dir: string, ext: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, ext)));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

test("every suite file is found by walking, not by a list", async () => {
  const files = await walk(testsRoot, ".test.ts");
  ok(files.length > 0, "the walk found at least one suite");
  ok(
    files.some((f) => f.endsWith("00-assertion-discipline.test.ts")),
    "the walk found this very file — a guard that cannot see itself sees little",
  );
});

test("no suite declares its own assertion helper", async () => {
  const files = await walk(testsRoot, ".ts");
  const offenders: string[] = [];

  for (const file of files) {
    if (path.resolve(file) === THE_MODULE) continue;
    const src = await fs.readFile(file, "utf8");
    for (const name of RESERVED) {
      // A local binding of a reserved name: `function ok(`, `const eq =`,
      // `let near =`. Import bindings are checked separately below.
      const declared = new RegExp(
        `^\\s*(?:export\\s+)?(?:async\\s+)?(?:function|const|let|var)\\s+${name}\\b`,
        "m",
      );
      if (declared.test(src)) {
        offenders.push(`${path.relative(repoRoot, file)} declares its own \`${name}\``);
      }
    }
  }

  eq(
    offenders,
    [],
    "assertion helpers are declared in exactly one module and nowhere else",
  );
});

test("every suite that asserts imports from the one module", async () => {
  const files = await walk(testsRoot, ".test.ts");
  const offenders: string[] = [];

  for (const file of files) {
    const src = await fs.readFile(file, "utf8");
    const uses = RESERVED.some((n) => new RegExp(`\\b${n}\\s*\\(`).test(src));
    if (!uses) continue;
    const imports = /from\s+["'][^"']*helpers\/assert\.ts["']/.test(src);
    if (!imports) {
      offenders.push(path.relative(repoRoot, file));
    }
  }

  eq(offenders, [], "every asserting suite imports tests/helpers/assert.ts");
});

test("the assertion module refuses a value that cannot be compared", () => {
  // This is property 2 of the module, and it is the property that would have
  // caught the original defect: `eq(db.select()…, 3)` compares a builder, not
  // a result. Both shapes it rejects are asserted here, by making it throw.
  let threw: unknown;
  try {
    eq((() => 1) as unknown as number, 1, "a function is not a value");
  } catch (e) {
    threw = e;
  }
  ok(threw instanceof AssertionError, "a function passed as a value is rejected");
  ok(
    /not a value/.test((threw as Error).message),
    "and the reason says the value is not a value",
  );

  threw = undefined;
  try {
    eq(Promise.resolve(1) as unknown as number, 1, "a promise is not a value");
  } catch (e) {
    threw = e;
  }
  ok(threw instanceof AssertionError, "a missing await is rejected");
  ok(
    /await/.test((threw as Error).message),
    "and the reason names the missing await",
  );
});

test("an assertion without a message is refused", () => {
  let threw: unknown;
  try {
    ok(true, "");
  } catch (e) {
    threw = e;
  }
  ok(
    threw instanceof AssertionError,
    "a message is required — an unexplained failure on a CI log is not a finding",
  );
});
