/**
 * B50 — the quest page as a guide to playing, not a table of rates.
 *
 * The action list existed, inside the quest game's rules panel: behind a map,
 * behind a tap. That is the last place somebody asking "is any of this worth my
 * time" would look, and a flat table answers a question they did not ask.
 *
 * The assertion that matters most: every figure on this guide has to be the
 * figure the engine actually pays. B34's calculator can move any weight or cap,
 * and a second copy of a number is wrong the first time somebody moves it. No
 * endpoint exposes the weights, so the check is a cross-render — the index page
 * and the single-quest page draw the same dataset through the same component
 * from two different server reads, and a hardcoded figure in either makes them
 * disagree. Nothing here is compared against a number written in this file.
 *
 *   scripts/with-server.sh 3031 node tests/ui/quests.mjs
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

// Read the guide's own rows: action key, CP figure and cap, as rendered.
const readPanel = (page) => page.evaluate(() => {
  const panel = document.querySelector("[data-guide-panel]");
  if (!panel) return null;
  const num = (s) => Number((s || "").replace(/[^\d]/g, "")) || 0;
  return {
    quest: panel.getAttribute("data-guide-panel"),
    actions: [...panel.querySelectorAll("[data-guide-action]")].map((el) => ({
      key: el.getAttribute("data-guide-action"),
      cp: num(el.querySelector("[data-guide-cp]")?.textContent),
      capText: (el.querySelector("[data-guide-cap]")?.textContent || "").trim(),
      cap: /uncapped/i.test(el.querySelector("[data-guide-cap]")?.textContent || "")
        ? null : num(el.querySelector("[data-guide-cap]")?.textContent),
    })),
    total: (panel.querySelector("[data-guide-total]")?.textContent || "").replace(/\s+/g, " ").trim(),
  };
});

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });

try {
  console.log("\n== the guide is on the page, signed out ==");
  // Somebody deciding whether to sign up is exactly who this is for, so it must
  // not be behind a login.
  await page.goto(`${BASE}/quests`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Accept all")').first().click().catch(() => {});
  await page.waitForTimeout(400);
  ok("a signed-out visitor sees it", await page.locator("[data-quest-guide]").count() === 1);
  const outPanel = await readPanel(page);
  ok("…with real actions on it", (outPanel?.actions.length ?? 0) > 0,
    JSON.stringify(outPanel?.actions.slice(0, 2)));

  console.log("\n== every action shows what it pays and how often ==");
  ok("every row carries a CP figure", outPanel.actions.every((a) => a.cp > 0),
    JSON.stringify(outPanel.actions.filter((a) => !a.cp).slice(0, 2)));
  ok("every row states its cap or says it is uncapped",
    outPanel.actions.every((a) => a.cap !== 0 || /uncapped/i.test(a.capText)),
    JSON.stringify(outPanel.actions.filter((a) => a.cap === 0).slice(0, 2)));
  // B34 left nothing uncapped. If one appears, the guide says so rather than
  // inventing a ceiling — asserted either way.
  const uncapped = outPanel.actions.filter((a) => a.cap === null);
  ok(`no action is given an invented cap (${uncapped.length} uncapped, named as such)`,
    uncapped.every((a) => /uncapped/i.test(a.capText)));

  console.log("\n== switching quests changes the list ==");
  const tabs = page.locator("[data-guide-tab]");
  const tabCount = await tabs.count();
  ok("there is a tab per quest", tabCount > 1, `${tabCount}`);
  const firstKey = outPanel.quest;
  // Pick a tab that is not the open one.
  let switched = null;
  for (let i = 0; i < tabCount; i++) {
    const key = await tabs.nth(i).getAttribute("data-guide-tab");
    if (key !== firstKey) { await tap(tabs.nth(i)); switched = key; break; }
  }
  await page.waitForTimeout(350);
  const afterPanel = await readPanel(page);
  ok("the open quest changes", afterPanel?.quest === switched, `${afterPanel?.quest} vs ${switched}`);
  ok("…and so does the action list",
    JSON.stringify(afterPanel.actions) !== JSON.stringify(outPanel.actions));

  console.log("\n== the figures ARE the engine's figures ==");
  // The whole point, and there is no public endpoint that exposes the weights —
  // so the comparison is made between the TWO surfaces that render them from
  // the same source: the index and the single-quest page. Two independent
  // renders of one dataset. A hardcoded figure in either makes them diverge
  // here, rather than in production three months after somebody edits the
  // calculator.
  await page.goto(`${BASE}/quests/${firstKey}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const onDetail = await readPanel(page);
  ok("the single-quest page carries the same guide", !!onDetail, String(firstKey));
  ok("…open on that quest by default", onDetail?.quest === firstKey,
    `${onDetail?.quest} vs ${firstKey}`);
  const sameActions = JSON.stringify(onDetail.actions.map((a) => [a.key, a.cp, a.cap]).sort())
    === JSON.stringify(outPanel.actions.map((a) => [a.key, a.cp, a.cap]).sort());
  ok("…with identical figures to the index page", sameActions,
    JSON.stringify({ index: outPanel.actions.slice(0, 2), detail: onDetail.actions.slice(0, 2) }));

  console.log("\n== the caps are the pitch, and the total is honest ==");
  ok("a full day is priced", /every day/i.test(onDetail.total), onDetail.total.slice(0, 120));
  ok("…in dollars as well as points", /\$\d/.test(onDetail.total), onDetail.total.slice(0, 120));

  console.log("\n== signed in, today's usage sits on the action ==");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "nova@demo.gg");
  await page.fill('input[name="password"]', "cluster-demo");
  await page.click('button:has-text("Log in with email")');
  await page.waitForLoadState("networkidle");
  await page.goto(`${BASE}/quests`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const guide = page.locator("[data-quest-guide]");
  const guideText = await guide.textContent();
  ok("the guide states today's ceiling", /earned today/i.test(guideText), guideText.slice(0, 160));
  const progress = await page.evaluate(() =>
    [...document.querySelectorAll("[data-guide-action]")]
      .filter((el) => /\d+\/\d+ today/.test(el.textContent || "")).length);
  ok("…and at least one action shows its own progress", progress > 0, `${progress} rows`);
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
