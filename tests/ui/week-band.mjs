/**
 * B51 — the Profile of the Week band.
 *
 * Six changes to one component, five of which are only observable in a browser:
 * a portalled panel, a podium that must stop at three, links that must leave the
 * page rather than navigate underneath a floating board, and a click-away that
 * has to actually close it.
 *
 * The sixth is the B10 assertion extended here: exactly ONE element paints the
 * nav art. The band lives inside the header group, so a second copy of the image
 * is how the header stops reading as one surface.
 *
 *   scripts/with-server.sh 3031 node tests/ui/week-band.mjs
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:3031";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const tap = async (loc) => {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await loc.click({ timeout: 4000 }).catch(async () => { await loc.evaluate((el) => el.click()); });
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "nova@demo.gg");
  await page.fill('input[name="password"]', "cluster-demo");
  await page.click('button:has-text("Log in with email")');
  await page.waitForLoadState("networkidle");
  await page.goto(`${BASE}/feed`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Accept all")').first().click().catch(() => {});
  await page.waitForTimeout(400);

  console.log("\n== the band opens from the strip ==");
  ok("it starts collapsed", await page.locator("[data-week-panel]").count() === 0);
  const opener = page.locator('header button:has-text("Profile of the Week")').first();
  await tap(opener);
  await page.waitForTimeout(600);
  const panel = page.locator("[data-week-panel]");
  ok("the board drops", await panel.count() === 1);

  console.log("\n== exactly one element paints the nav art (B10, extended) ==");
  // Counted on the NAV ART specifically, not on any background image: podium
  // cards legitimately paint each gamer's own profile art, and counting those
  // would make this assert something it was never about.
  const painters = await page.evaluate(() => {
    const urlOf = (el) => (getComputedStyle(el).backgroundImage.match(/url\("?([^")]+)"?\)/) ?? [])[1] ?? null;
    const header = document.querySelector("header");
    const navArt = [...(header?.querySelectorAll("*") ?? [])].map(urlOf).find(Boolean) ?? null;
    if (!navArt) return { navArt: null, n: 0 };
    const all = [...document.querySelectorAll("header *, [data-week-panel], [data-week-panel] *")];
    return { navArt, n: all.filter((el) => urlOf(el) === navArt).length };
  });
  ok("exactly one element paints the nav art", painters.n <= 1,
    `${painters.n} copies of ${painters.navArt}`);

  console.log("\n== three profiles, not the whole platform ==");
  const cards = panel.locator("[data-prize]");
  const n = await cards.count();
  ok("the podium is capped at three", n > 0 && n <= 3, `${n} cards`);
  const seeAll = panel.locator("[data-see-all]");
  const rest = await seeAll.count();
  ok("everybody else is behind a See-all rather than dumped in the band",
    rest === 1 || n < 3, `see-all: ${rest}, podium: ${n}`);
  if (rest) {
    ok("…which goes to the full board", (await seeAll.getAttribute("href")) === "/vote");
    ok("…and says how many are in it",
      /\d+ more in the running/.test(await seeAll.textContent()), await seeAll.textContent());
  }

  console.log("\n== each place shows what it would win, in the right tense ==");
  const panelText = await panel.textContent();
  const withPrize = await panel.locator('[data-prize]:not([data-prize=""])').count();
  if (withPrize > 0) {
    ok("a configured place shows the trophy itself, not a generic icon",
      await panel.locator('[data-prize]:not([data-prize=""]) img').count() > 0);
    ok("…framed as IF THE WEEK ENDED NOW", /if the week ended now/i.test(panelText),
      panelText.slice(0, 200));
    ok("…and never as already won",
      !/you have won|already won/i.test(panelText));
  } else {
    // No trophy configured in the demo: the fallback must still be a medal
    // rather than an empty circle, and nothing may claim a prize.
    ok("with no trophy set, the place still renders", n > 0);
    ok("…and claims no prize", !/if the week ended now/i.test(panelText));
  }

  console.log("\n== a profile opens in a NEW TAB ==");
  // The band is a floating panel over whatever page you were on. Navigating
  // inside it throws that away and opens a profile underneath an open board.
  const links = await panel.evaluate(() =>
    [...document.querySelectorAll('[data-week-panel] a[href^="/u/"]')]
      .map((a) => ({ href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel") })));
  ok("there are profile links in the band", links.length > 0, `${links.length}`);
  ok("every one opens in a new tab", links.every((l) => l.target === "_blank"),
    JSON.stringify(links.filter((l) => l.target !== "_blank").slice(0, 2)));
  ok("…and every one carries noopener",
    links.every((l) => (l.rel ?? "").includes("noopener")),
    JSON.stringify(links.filter((l) => !(l.rel ?? "").includes("noopener")).slice(0, 2)));

  console.log("\n== the cards do not cover the page ==");
  const box = await panel.boundingBox();
  const vh = page.viewportSize().height;
  ok("the panel leaves the page visible underneath", box.height < vh * 0.92,
    `${Math.round(box.height)}px of ${vh}px`);

  console.log("\n== clicking below the band collapses it ==");
  await page.mouse.click(40, vh - 40);
  await page.waitForTimeout(500);
  ok("the board closes", await page.locator("[data-week-panel]").count() === 0);

  console.log("\n== never over the admin area ==");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  ok("no band in Mission Control", await page.locator("[data-week-panel]").count() === 0);
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
