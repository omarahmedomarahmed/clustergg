/**
 * Every admin page, opened as an admin. B-admin-rewrite.
 *
 * Not a design test — a LIVENESS test. Fifty pages is more than anybody clicks
 * through by hand, so a page that throws on a null, or renders an error
 * boundary, or 500s on an empty table stays broken until somebody happens to
 * visit it. Which, on a console, can be months.
 *
 * The routes are discovered from `lib/admin-nav.ts` rather than listed here,
 * for the same reason the emitter scan reads callers: a hand-kept list agrees
 * with itself and misses the page nobody registered.
 *
 *   scripts/with-server.sh 3031 node tests/ui/admin-sweep.mjs
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://localhost:3031";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

// Every href in the nav map, minus the ones that need an id we do not have.
const nav = readFileSync(new URL("../../lib/admin-nav.ts", import.meta.url), "utf8");
const routes = [...new Set([...nav.matchAll(/href:\s*"(\/admin[^"]*)"/g)].map((m) => m[1]))]
  .filter((h) => !h.includes("["));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext()).newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', "admin@clustergg.com");
await page.fill('input[name="password"]', "cluster-admin");
await page.locator('input[name="password"]').press("Enter");
await page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 15000 });

console.log(`== ${routes.length} admin routes ==`);
const broken = [];
for (const route of routes) {
  let status = 0;
  let body = "";
  try {
    const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 25000 });
    status = res?.status() ?? 0;
    body = await page.locator("body").innerText();
  } catch (e) {
    broken.push(`${route} — threw: ${String(e).slice(0, 80)}`);
    continue;
  }
  // A 500 is obvious. An error boundary is the one that hides: it returns 200,
  // renders a tidy box, and looks like an empty state to anybody skimming.
  const errored = /application error|something went wrong|unhandled runtime|digest:/i.test(body);
  if (status !== 200 || errored) {
    broken.push(`${route} — ${status}${errored ? " (error boundary)" : ""}`);
  }
}
ok(`every route renders`, broken.length === 0, broken.join("; "));

// Merged pages hide most of themselves behind a tab, and only the default tab
// is on the route the nav registers. A sweep that stopped at the nav would have
// opened /admin/content and never rendered three of its four panels — which is
// exactly the "reachable by URL only" problem the merge was supposed to end.
//
// The tab keys are read out of each page's own TABS literal for the same reason
// the routes are read out of the nav: a hand-kept list here would agree with
// itself and miss the tab nobody added.
console.log("\n== every tab of every merged page ==");
{
  const { readdirSync } = await import("node:fs");
  const tabbed = [];
  for (const dir of readdirSync(new URL("../../app/admin", import.meta.url), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    let src = "";
    try { src = readFileSync(new URL(`../../app/admin/${dir.name}/page.tsx`, import.meta.url), "utf8"); }
    catch { continue; }
    const block = src.match(/const TABS: Tab\[\] = \[([\s\S]*?)\n\];/);
    if (!block) continue;
    const keys = [...block[1].matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]);
    if (keys.length) tabbed.push([`/admin/${dir.name}`, keys]);
  }
  ok("merged pages were found to sweep", tabbed.length >= 4, `found ${tabbed.length}`);

  const badTabs = [];
  for (const [route, keys] of tabbed) {
    for (const key of keys) {
      const url = `${BASE}${route}?tab=${key}`;
      try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        const body = await page.locator("body").innerText();
        const errored = /application error|something went wrong|unhandled runtime|digest:/i.test(body);
        if (res?.status() !== 200 || errored) badTabs.push(`${route}?tab=${key} — ${res?.status()}${errored ? " (error boundary)" : ""}`);
      } catch (e) {
        badTabs.push(`${route}?tab=${key} — threw: ${String(e).slice(0, 80)}`);
      }
    }
  }
  ok("every tab renders", badTabs.length === 0, badTabs.join("; "));

  // An unknown tab must fall back, not blank. `?tab=` is in a URL staff paste
  // to each other, and a typo that renders nothing looks like a broken page.
  await page.goto(`${BASE}/admin/content?tab=nonsense`, { waitUntil: "domcontentloaded" });
  const fallback = await page.locator("body").innerText();
  ok("an unknown ?tab= falls back to the first tab", /Homepage hero|Site content/i.test(fallback));
}

console.log("\n== merged routes still answer at their old URLs ==");
for (const [old, dest] of [
  ["/admin/chrome", "/admin/content"],
  ["/admin/mobile", "/admin/content"],
  ["/admin/partners", "/admin/content"],
  ["/admin/backgrounds", "/admin/art"],
  ["/admin/cards", "/admin/art"],
  ["/admin/cards/guide", "/admin/art"],
  ["/admin/translations", "/admin/language"],
  ["/admin/brand-enquiries", "/admin/brands"],
  // The one that would fail silently: without its own stub this falls through
  // to /admin/brands/[id] and renders a brand detail page for a brand called
  // "testimonials" — a 200 that looks like a broken brand, not a moved page.
  ["/admin/brands/testimonials", "/admin/brands"],
]) {
  await page.goto(`${BASE}${old}`, { waitUntil: "domcontentloaded" });
  ok(`${old} lands on ${dest}`, new URL(page.url()).pathname === dest, page.url());
}

console.log("\n== the money pages carry the kit's vocabulary ==");
for (const [route, must] of [
  ["/admin/payouts", ["Owed, not yet opened", "Payout queue"]],
  ["/admin/redeems", ["Waiting on you", "Open requests"]],
  ["/admin/billing", ["Booked", "four vaults"]],
  ["/admin/vaults", ["Prize vault", "never banked"]],
  ["/admin/week", ["How a server is scored"]],
]) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  // Wait for the LAST phrase to appear rather than reading straight away.
  // These pages stream, so `domcontentloaded` can fire with the shell rendered
  // and the section still arriving — which reads exactly like missing copy.
  await page.waitForFunction(
    (needle) => document.body.innerText.toLowerCase().includes(needle),
    must[must.length - 1].toLowerCase(),
    { timeout: 10000 },
  ).catch(() => {});
  const body = await page.locator("body").innerText();
  // Case-insensitive: stat labels are uppercased by CSS, so `innerText`
  // returns "OWED, NOT YET OPENED". Asserting the literal case would be
  // asserting a stylesheet, not the copy.
  const flat = body.toLowerCase();
  for (const phrase of must) ok(`${route} says "${phrase}"`, flat.includes(phrase.toLowerCase()));
}

console.log("\n== an empty table explains itself ==");
{
  // The rule the kit encodes: empty is a SENTENCE. A console that renders a
  // blank where a table would be tells an operator nothing about whether that
  // is normal, which is how a broken query gets mistaken for a quiet week.
  await page.goto(`${BASE}/admin/week`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /How a server is scored/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
  const body = await page.locator("body").innerText();
  // Either the "no week closed" sentence, or a week that DID close with its own
  // empty-state sentence. What must never appear is a bare blank.
  ok("the week page explains an empty state rather than showing a blank",
    /No week has been closed yet|No server was paid|server[s]? paid/.test(body));
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
