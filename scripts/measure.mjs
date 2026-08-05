// Queries and wall time for ONE server render of each surface (B55.8).
//
//   PERF_COUNT=1 scripts/with-server.sh 3031 node scripts/measure.mjs
//
// Fetched directly rather than driven through a browser, and that is the whole
// methodology note: with a real browser and `networkidle`, Next fires an RSC
// PREFETCH for every link on the page, each of which is a separate render with
// its own queries. The first version of this script counted those and reported
// 128 queries for the homepage — real traffic, but not what one page load costs,
// and not something a per-request cache can ever reduce.
//
// One request, one render, one count.
const B = process.env.BASE_URL || "http://localhost:3031";

const PAGES = [
  ["public   /",                 "/",                                            false],
  ["public   /marketplace",      "/marketplace",                                 false],
  ["gamer    /feed",             "/feed",                                        true],
  ["gamer    /quests",           "/quests",                                      true],
  ["gamer    /u/nova",           "/u/nova",                                      false],
  ["planet   /planets/chess",    "/planets/chess",                               false],
  ["admin    /admin",            "/admin",                                       true],
  ["admin    /admin/challenges", "/admin/challenges",                            true],
  ["admin    /admin/discord",    "/admin/discord",                               true],
  ["admin    /admin/trophies",   "/admin/trophies",                              true],
  ["brand    portal",            "/brands/nebulatech?key=DEMO-NEBULATECH",       false],
  ["server   portal",            "/servers/demo-guild-nebula-1?key=DEMO-DNEBULA1", false],
];

// Sign in once and reuse the cookie, so the admin pages render as an admin
// rather than redirecting to /login and reporting a suspiciously fast zero.
const login = await fetch(`${B}/api/test-login`, { method: "POST" }).catch(() => null);
let cookie = "";
if (login?.ok) cookie = (login.headers.getSetCookie?.() ?? []).join("; ");

const perf = async (reset) =>
  (await fetch(`${B}/api/perf-count${reset ? "?reset=1" : ""}`)).json();
if (!(await perf(false)).enabled) console.log("PERF_COUNT is not set — counts will be 0.\n");

const rows = [];
for (const [label, path, needsAuth] of PAGES) {
  const headers = needsAuth && cookie ? { cookie } : {};
  await fetch(`${B}${path}`, { headers }).then((r) => r.text()).catch(() => "");   // warm
  await perf(true);
  const t0 = Date.now();
  const res = await fetch(`${B}${path}`, { headers }).catch(() => null);
  if (res) await res.text();
  const ms = Date.now() - t0;
  const { queries } = await perf(true);
  rows.push({ label, status: res?.status ?? 0, queries: queries ?? 0, ms });
}

const pad = (s, n) => String(s).padEnd(n);
const padl = (s, n) => String(s).padStart(n);
console.log(`\n${pad("surface / page", 30)} ${padl("queries", 8)} ${padl("render ms", 11)}`);
console.log("-".repeat(52));
for (const r of rows) console.log(`${pad(r.label, 30)} ${padl(r.queries, 8)} ${padl(r.ms, 11)}${r.status !== 200 ? `  (${r.status})` : ""}`);
console.log("-".repeat(52));
console.log(`${pad("TOTAL", 30)} ${padl(rows.reduce((a, r) => a + r.queries, 0), 8)} ${padl(rows.reduce((a, r) => a + r.ms, 0), 11)}`);
