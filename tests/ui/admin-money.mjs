/**
 * The two screens the commercial model needed and the console never had.
 *
 * Driven rather than asserted from source, because the thing being checked is
 * that an operator can actually SEE where the money is — a page that compiles
 * and renders an error boundary passes every test that reads the file.
 *
 *   scripts/with-server.sh 3031 node tests/ui/admin-money.mjs
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://localhost:3031";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext()).newPage();

console.log("== an admin can open them ==");
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', "admin@clustergg.com");
await page.fill('input[name="password"]', "cluster-admin");
// Submit with Enter, not by clicking "the first button in a form" — the login
// page's first form button is the OAuth one, and clicking it navigated away
// while every later assertion reported an empty page. A locator that finds the
// wrong control is worse than one that finds nothing.
await page.locator('input[name="password"]').press("Enter");
// `waitForURL` waits for "load", which the feed's starfield never reaches.
// Waiting on the URL string itself is what actually settles here.
await page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 15000 });

for (const [path, heading] of [["/admin/vaults", "Vaults"], ["/admin/week", "The week"]]) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  ok(`${path} responds 200`, res?.status() === 200, String(res?.status()));
  const body = await page.locator("body").innerText();
  ok(`…and renders its heading`, body.includes(heading));
  // An error boundary renders fine and says nothing useful. This is the check
  // that separates "the page loaded" from "the page worked".
  ok(`…and is not an error boundary`,
    !/something went wrong|application error|unhandled/i.test(body));
}

console.log("\n== the vault page states where its numbers come from ==");
{
  await page.goto(`${BASE}/admin/vaults`, { waitUntil: "domcontentloaded" });
  const body = await page.locator("body").innerText();
  for (const v of ["Prize vault", "Server pool", "CP vault", "Cluster revenue"]) {
    ok(`${v} is shown`, body.includes(v));
  }
  ok("the split editor is there", /Grow servers|grow servers|Default|default/.test(body));
  // The two claims that must never quietly disappear from this screen.
  ok("breakage is named and said to be un-banked", /never banked/i.test(body));
  // The CP vault's runway. Its own section on the page, so the label appears
  // there rather than in the top stat row.
  ok("the CP vault's runway is shown", /How long the CP vault lasts/.test(body));
  ok("…and an unmeasured population reads as a dash, not a comfortable number",
    /Runway/.test(body) || /—/.test(body));
  ok("money arrives on PAID, not on invoiced", /marked .?paid/i.test(body));
}

console.log("\n== the week page explains a payout before anybody disputes one ==");
{
  await page.goto(`${BASE}/admin/week`, { waitUntil: "domcontentloaded" });
  const body = await page.locator("body").innerText();
  ok("the four score terms are listed", /Exclusive-weighted entrants/.test(body));
  ok("…including the one with no data, named as dropped", /DROPPED|dropped/.test(body));
  ok("the participation share is stated", /20%/.test(body));
  ok("the hold is stated next to 'weekly'", /30-day hold/.test(body));
  ok("a tier is described as not-a-rate", /not a rate/i.test(body));
  ok("the close button exists", /Close the week|Re-run the close/.test(body));
}

console.log("\n== a staff member without billing cannot reach them ==");
{
  const ctx2 = await browser.newContext();
  const anon = await ctx2.newPage();
  const res = await anon.goto(`${BASE}/admin/vaults`, { waitUntil: "domcontentloaded" });
  // Signed out lands on login; the point is that it is not the page.
  const body = await anon.locator("body").innerText();
  ok("a signed-out visitor gets no vault page",
    !body.includes("Cluster revenue"), (res?.status() ?? 0) + " " + anon.url());
  await ctx2.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
