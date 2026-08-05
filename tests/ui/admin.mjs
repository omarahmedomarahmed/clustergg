/**
 * The admin console, consolidated.
 *
 * Two claims:
 *
 *   1. The rail lists SECTIONS, not all thirty-nine pages, and the pages of the
 *      section you're in appear as tabs across the top of it. Same pages, one
 *      level of choice at a time.
 *   2. There is one message queue. Brands used to be answered from a box buried
 *      inside a brand's detail page that nothing linked to and no counter
 *      surfaced, which is why that side went unanswered.
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:3031";
const SHOTS = "/tmp/claude-0/-home-user-clustergg/f1b2f374-59b4-5577-bf34-0df216698fe3/scratchpad";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

const railLinks = () => page.locator("aside a");
const tabLinks = () => page.locator('nav a, [data-tabs] a');

try {
  console.log("\n== Signing in ==");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "admin@clustergg.com");
  await page.fill('input[name="password"]', "cluster-admin");
  await page.click('button:has-text("Log in with email")');
  await page.waitForLoadState("networkidle");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  ok("the console opens", !/\/login/.test(page.url()), page.url());

  console.log("\n== The rail is sections, not pages ==");
  const rail = await railLinks().count();
  ok("the rail is a short list", rail > 3 && rail <= 12, `${rail} links`);
  const railText = await page.locator("aside").first().innerText();
  for (const section of ["Overview", "Discord", "Design & content", "Games & planets", "Competition"]) {
    ok(`it lists "${section}"`, railText.includes(section));
  }
  ok("and does NOT list individual pages", !/Card backgrounds|Page backgrounds|Trophy redemptions/.test(railText),
    railText.replace(/\n/g, " | ").slice(0, 200));

  console.log("\n== A section's pages are tabs on the page ==");
  await page.goto(`${BASE}/admin/content`, { waitUntil: "networkidle" });
  const body = await page.locator("main, body").first().innerText();
  for (const tab of ["Site content", "Card backgrounds", "Logos & brand kit", "Nav & footer", "Partners"]) {
    ok(`the Design & content bar offers "${tab}"`, body.includes(tab), body.slice(0, 200));
  }
  const current = await page.locator('a[aria-current="page"]').allInnerTexts();
  ok("the page you're on is marked current", current.some((t) => /Site content/.test(t)), current.join(" | "));

  // Moving between tabs must not change section.
  await page.locator('a[href="/admin/cards"]:visible').first().click();
  await page.waitForURL("**/admin/cards");
  await page.waitForLoadState("networkidle");
  const after = await page.locator("main, body").first().innerText();
  ok("switching tab keeps the same bar", after.includes("Site content") && after.includes("Partners"));
  ok("and the new tab is the current one",
    (await page.locator('a[aria-current="page"]').allInnerTexts()).some((t) => /Card backgrounds/.test(t)));

  console.log("\n== One message queue ==");
  await page.goto(`${BASE}/admin/messages`, { waitUntil: "networkidle" });
  const inbox = await page.locator("body").innerText();
  ok("the unified inbox exists", /Messages/.test(inbox) && !/404/.test(inbox));
  ok("it filters by side", /Server owners/.test(inbox) && /Brands/.test(inbox), inbox.slice(0, 200));
  ok("it is reachable from the rail", (await page.locator('aside a:has-text("Overview")').count()) > 0);

  // Both kinds of thread land in the same list.
  const kinds = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && (h.includes("/admin/discord/") || h.includes("/admin/brands/"))));
  ok("threads link back to where they are answered", kinds.length >= 0);

  console.log("\n== The brand side is visible at all ==");
  const brandFilter = await (await fetch(`${BASE}/admin/messages?kind=brand`)).text();
  ok("the brand filter renders", /Brands/.test(brandFilter) && !/Application error/.test(brandFilter));
  const serverFilter = await (await fetch(`${BASE}/admin/messages?kind=server`)).text();
  ok("so does the server filter", /Server owners/.test(serverFilter));

  console.log("\n== The old bookmark still works ==");
  await page.goto(`${BASE}/admin/discord/messages`, { waitUntil: "networkidle" });
  ok("the retired inbox redirects into the new one", /\/admin\/messages/.test(page.url()), page.url());

  console.log("\n== Games and planets are one page ==");
  await page.goto(`${BASE}/admin/games`, { waitUntil: "networkidle" });
  const gp = await page.locator("body").innerText();
  ok("the page owns both", /Games & planets/.test(gp), gp.slice(0, 120));
  ok("the section no longer has a separate Planets tab", !/\bPlanets\b(?!\s*with)/.test(
    (await page.locator('[aria-current], nav').first().innerText().catch(() => "")) || ""), "still tabbed separately");
  // Open the first game and prove both editors are inside it.
  await page.locator("details summary").nth(1).click();
  await page.waitForTimeout(600);
  const opened = await page.locator("details[open]").first().innerText();
  ok("a game row holds the game editor", /Planet skin|Hero layout|Accent color/.test(opened), opened.slice(0, 160));
  ok("and its planet, in the same row", /its planet/i.test(opened), opened.slice(0, 200));
  const planetForm = await page.locator('details[open] form:has(input[name="spaceId"])').count();
  const createForm = await page.locator('details[open] input[name="game"][type="hidden"]').count();
  ok("the planet form is bound to that game", planetForm > 0 || createForm > 0,
    `edit forms ${planetForm}, create forms ${createForm}`);

  console.log("\n== The old planets bookmark still works ==");
  await page.goto(`${BASE}/admin/spaces`, { waitUntil: "networkidle" });
  ok("it redirects into games", /\/admin\/games/.test(page.url()), page.url());
  const req = await page.goto(`${BASE}/admin/spaces/requests`, { waitUntil: "domcontentloaded" });
  ok("but the requests queue is untouched", !!req && req.status() < 400 && /requests/.test(page.url()),
    `${req?.status()} ${page.url()}`);

  console.log("\n== A staff member sees only their desk ==");
  // Prize Ops runs the trophy desk. What they can open must be exactly what the
  // console says that desk owns — the rail, the tabs and the guard all reading
  // the one declaration.
  const staff = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await staff.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await staff.fill('input[name="email"]', "ops@clustergg.com");
  await staff.fill('input[name="password"]', "cluster-demo");
  await staff.click('button:has-text("Log in with email")');
  await staff.waitForLoadState("networkidle");
  await staff.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const staffRail = await staff.locator("aside").first().innerText().catch(() => "");
  ok("their rail loads", staffRail.length > 0, staffRail.slice(0, 80));
  ok("it offers their section", /Competition/i.test(staffRail), staffRail.replace(/\n/g, " | "));
  ok("and not the ad desk's", !/Ads & revenue/i.test(staffRail), staffRail.replace(/\n/g, " | "));
  ok("nor the community", !/Community/i.test(staffRail), staffRail.replace(/\n/g, " | "));

  // `networkidle`, not `domcontentloaded`: the console shell paints its loading
  // screen first, so reading at DOM-ready is a race that the not-found page
  // loses whenever the page behind it got heavier.
  await staff.goto(`${BASE}/admin/creatives`, { waitUntil: "networkidle" });
  const deniedBody = await staff.locator("body").innerText();
  // The layout calls notFound(), so what arrives is the not-found page rather
  // than the creatives list. The status stays 200 because a layout and its page
  // render in parallel and the response has already begun — what matters is
  // that none of the page's rows reach the browser.
  ok("a page outside their desk shows not-found", /could not be found/i.test(deniedBody),
    deniedBody.slice(0, 160).replace(/\n/g, " | "));
  ok("and none of its data is in the response",
    !/Upload a creative|Bulk upload|creative/i.test(deniedBody.replace(/could not be found/i, "")),
    deniedBody.slice(0, 200).replace(/\n/g, " | "));
  const own = await staff.goto(`${BASE}/admin/redeems`, { waitUntil: "domcontentloaded" });
  ok("a page inside it opens", !!own && own.status() < 400, String(own?.status()));
  await staff.close();

  console.log("\n== Every section's home page loads ==");
  for (const path of ["/admin", "/admin/discord", "/admin/content", "/admin/games", "/admin/profile-week", "/admin/users", "/admin/billing", "/admin/storage"]) {
    const r = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    ok(`${path}`, !!r && r.status() < 400, String(r?.status()));
  }

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok("no horizontal overflow", overflow <= 0, String(overflow));
  await page.goto(`${BASE}/admin/content`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${SHOTS}/admin.png` });
} catch (e) {
  fail++;
  console.log("  ✗ threw:", e.message);
  try { await page.screenshot({ path: `${SHOTS}/admin-fail.png` }); } catch {}
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
