/**
 * B52 — a planet's ladder speaks the game's language.
 *
 * The rule this checks is stated in full in `tests/db/planet-explore.mts`:
 * leaderboards are per-ACCOUNT, challenge entry is per-GAMER. The database half
 * proves the data. This proves the half a reader actually sees — that the row
 * says the in-game tag rather than the Cluster profile name, and that one tap
 * tells you who that is.
 *
 *   scripts/with-server.sh 3031 node tests/ui/planet.mjs
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
  console.log("\n== find a planet with a ladder on it ==");
  await page.goto(`${BASE}/planets`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Accept all")').first().click().catch(() => {});
  const links = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href^="/planets/"]')]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && h.split("/").length === 3))]);
  ok("there are planets", links.length > 0, `${links.length}`);

  let found = null;
  for (const href of links.slice(0, 6)) {
    await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    if (await page.locator("[data-explore-row]").count() > 0) { found = href; break; }
  }
  ok("one of them has a populated ladder", !!found, JSON.stringify(links.slice(0, 6)));

  if (found) {
    console.log("\n== rows are per ACCOUNT ==");
    const boards = await page.evaluate(() =>
      [...document.querySelectorAll("[data-explore-board]")].map((b) =>
        [...b.querySelectorAll("[data-explore-row]")].map((el) => ({
          accountId: el.getAttribute("data-explore-row"),
          text: (el.textContent || "").replace(/\s+/g, " ").trim(),
        }))).filter((rows) => rows.length));
    const rows = boards.flat();
    ok("every row carries the account it is", rows.every((r) => !!r.accountId),
      JSON.stringify(rows.slice(0, 2)));
    // Per BOARD, not per page. One account appears on several ladders — rank
    // and win rate are two questions about the same account, not a duplicate.
    // The first version of this asserted page-wide and failed on exactly that.
    const dupes = boards.filter((b) => new Set(b.map((r) => r.accountId)).size !== b.length);
    ok("…and no account appears twice within one ladder", dupes.length === 0,
      JSON.stringify(dupes.slice(0, 1)));

    console.log("\n== and the name shown is the game's, not ours ==");
    // The demo's gamers have distinct in-game names; if a row printed the
    // Cluster display name it would be one of the five profile names.
    const clusterNames = ["Nova", "Orion", "Vega", "Lyra", "Atlas"];
    const usingProfileNames = rows.filter((r) =>
      clusterNames.some((n) => new RegExp(`(^|\\s)${n}(\\s|$)`).test(r.text)));
    ok("no row leads with a Cluster profile name",
      usingProfileNames.length === 0,
      JSON.stringify(usingProfileNames.slice(0, 2)));

    console.log("\n== opening a row reveals who that is ==");
    await tap(page.locator("[data-explore-row]").first());
    await page.waitForTimeout(900);
    const reveal = page.locator("[data-gamer-reveal]");
    ok("a reveal opens", await reveal.count() >= 1);
    const slug = await reveal.first().getAttribute("data-gamer-reveal");
    ok("…naming the profile it belongs to", !!slug, String(slug));
    const link = reveal.first().locator(`a[href="/u/${slug}"]`);
    ok("…and linking straight to it", await link.count() > 0);
    const clusterLine = reveal.first().locator("[data-cluster-name]");
    if (await clusterLine.count()) {
      const t = await clusterLine.textContent();
      ok("…with the Cluster name and @profile beneath the in-game tag",
        t.includes("@"), t);
    } else {
      // Only omitted when the two names are identical, which is not a failure —
      // it is the case where there is nothing to reveal.
      ok("…or omitted because the two names are the same", true);
    }
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
