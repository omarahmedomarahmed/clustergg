// Every suite, one command.
//
//   npm test                      # db suites only (no server needed)
//   npm test -- --ui              # …plus the browser suites
//
// The db suites stand a PGlite database up in-process, so they need nothing
// running. The ui suites drive a real browser against a production build and
// need `DEMO_DB=1 npx next build && DEMO_DB=1 npx next start -p 3031` first —
// which is why they are opt-in rather than default: a suite that fails because
// nobody started a server teaches people to ignore failures.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const withUi = process.argv.includes("--ui");

const list = (dir, ext) => {
  try { return readdirSync(join(here, dir)).filter((f) => f.endsWith(ext)).sort(); }
  catch { return []; }
};

const suites = [
  ...list("db", ".mts").map((f) => ({ kind: "db", file: `tests/db/${f}` })),
  ...(withUi ? list("ui", ".mjs").map((f) => ({ kind: "ui", file: `tests/ui/${f}` })) : []),
];

if (!suites.length) { console.log("No suites found."); process.exit(0); }

let failed = 0;
const results = [];
for (const s of suites) {
  console.log(`\n\x1b[1m▶ ${s.file}\x1b[0m`);
  const cmd = s.kind === "db" ? ["npx", "tsx", s.file] : ["node", s.file];
  const r = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
    env: { ...process.env, DEMO_DB: "1" },
  });
  const okRun = r.status === 0;
  if (!okRun) failed++;
  results.push({ file: s.file, ok: okRun });
}

console.log("\n────────────────────────────────");
for (const r of results) console.log(`${r.ok ? "\x1b[32m  pass\x1b[0m" : "\x1b[31m  FAIL\x1b[0m"}  ${r.file}`);
console.log(`${results.length - failed}/${results.length} suites passed`);
if (!withUi) console.log("(browser suites skipped — run `npm test -- --ui` with a build on :3031)");
process.exit(failed ? 1 : 0);
