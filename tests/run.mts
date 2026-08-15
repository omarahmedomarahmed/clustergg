// Band 1 — the logic band. Runs in-process against PGlite. Needs nothing
// running, which is the whole point: a test that needs a server is a test that
// gets skipped.
//
// Two things this runner does that a stock one does not:
//
//   * It **walks the tree**. There is no list of suite files anywhere. A guard
//     with a hand-maintained list only guards the files somebody remembered,
//     and the file somebody forgets is the one that matters.
//   * It **fails a suite that asserted nothing**. A file can go green by
//     containing no assertions at all — that is exactly how three dead
//     assertions shipped in the old weekly close. Zero assertions is a failure
//     here, reported in those words.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertionCount } from "./helpers/assert.ts";
import { drain, type Case } from "./helpers/suite.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] ?? "";

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out.sort();
}

type Result = { file: string; name: string; ok: boolean; error?: unknown; ms: number };

const files = (await walk(root)).filter((f) => f.includes(filter));
if (files.length === 0) {
  console.error(`No suites matched ${JSON.stringify(filter)}.`);
  process.exit(1);
}

const results: Result[] = [];
const silentSuites: string[] = [];
let currentFile = "";

for (const file of files) {
  const rel = path.relative(root, file);
  currentFile = rel;
  const before = assertionCount();

  let cases: Case[];
  try {
    await import(pathToFileURL(file).href);
    cases = drain(rel);
  } catch (e) {
    results.push({ file: rel, name: "<import>", ok: false, error: e, ms: 0 });
    continue;
  }

  if (cases.length === 0) {
    results.push({
      file: rel,
      name: "<empty>",
      ok: false,
      error: new Error("suite registered no tests"),
      ms: 0,
    });
    continue;
  }

  for (const c of cases) {
    const started = performance.now();
    try {
      await c.fn();
      results.push({ file: rel, name: c.name, ok: true, ms: performance.now() - started });
    } catch (e) {
      results.push({
        file: rel,
        name: c.name,
        ok: false,
        error: e,
        ms: performance.now() - started,
      });
    }
  }

  if (assertionCount() === before) silentSuites.push(rel);
}
void currentFile;

let lastFile = "";
for (const r of results) {
  if (r.file !== lastFile) {
    console.log(`\n\x1b[1m${r.file}\x1b[0m`);
    lastFile = r.file;
  }
  const mark = r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${mark} ${r.name}${r.ms > 200 ? `  (${r.ms.toFixed(0)}ms)` : ""}`);
  if (!r.ok) {
    const e = r.error;
    const text = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.log(
      text
        .split("\n")
        .map((l) => `      \x1b[31m${l}\x1b[0m`)
        .join("\n"),
    );
  }
}

const failed = results.filter((r) => !r.ok);

if (silentSuites.length > 0) {
  console.log(
    `\n\x1b[31mThese suites asserted nothing. A suite that asserts nothing ` +
      `cannot fail, and a test that cannot fail is not evidence:\x1b[0m`,
  );
  for (const s of silentSuites) console.log(`  \x1b[31m${s}\x1b[0m`);
}

console.log(
  `\n${results.length - failed.length}/${results.length} passed · ` +
    `${assertionCount()} assertions · ${files.length} suites`,
);

if (failed.length > 0 || silentSuites.length > 0) process.exit(1);
