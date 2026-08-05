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

import { spawnSync, spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
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

/**
 * Kill any production server this repo started.
 *
 * Anchored on the START of the cmdline. The obvious version — `pgrep -f
 * next-server` — matches the shell doing the searching, so it reports a hit,
 * kills its own process group's ancestor or nothing at all, and leaves the real
 * server running. That is how five of these ended up stuck.
 */
function killServers() {
  const me = String(process.pid);
  for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
    if (pid === me) continue;
    let cmd = "";
    try { cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " "); } catch { continue; }
    if (/^(next-server|next start|sh -c next start)/.test(cmd)) {
      try { process.kill(Number(pid), "SIGKILL"); } catch { /* already gone */ }
    }
  }
}

const PORT = Number(process.env.PORT || 3031);
let server = null;

/** Stand a server up for the browser band, and guarantee it comes down. */
async function startServer() {
  killServers();
  await new Promise((r) => setTimeout(r, 1000));
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, DEMO_DB: "1" },
    stdio: "ignore", detached: false,
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// Belt and braces: the trap covers a normal exit, a crash and a Ctrl-C alike.
// A test runner that leaves a server behind is worse than one that fails.
for (const sig of ["exit", "SIGINT", "SIGTERM", "uncaughtException"]) {
  process.on(sig, () => { if (server) killServers(); });
}

if (withUi) {
  process.stdout.write(`\nStarting a build on :${PORT} for the browser band…\n`);
  const up = await startServer();
  if (!up) {
    console.log("Could not start a server — run `npx next build` first.");
    killServers();
    process.exit(1);
  }
}

let failed = 0;
const results = [];
for (const s of suites) {
  console.log(`\n\x1b[1m▶ ${s.file}\x1b[0m`);
  const cmd = s.kind === "db" ? ["npx", "tsx", s.file] : ["node", s.file];
  const r = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
    env: { ...process.env, DEMO_DB: "1", BASE_URL: `http://localhost:${PORT}` },
  });
  const okRun = r.status === 0;
  if (!okRun) failed++;
  results.push({ file: s.file, ok: okRun });
}

console.log("\n────────────────────────────────");
for (const r of results) console.log(`${r.ok ? "\x1b[32m  pass\x1b[0m" : "\x1b[31m  FAIL\x1b[0m"}  ${r.file}`);
console.log(`${results.length - failed}/${results.length} suites passed`);
if (!withUi) console.log("(browser suites skipped — run `npm test -- --ui`, which starts and stops its own server)");
killServers();
process.exit(failed ? 1 : 0);
