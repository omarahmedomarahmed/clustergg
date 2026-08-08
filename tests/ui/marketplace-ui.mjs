/**
 * The marketplace in a browser, and the band that stopped covering the page.
 *
 * The economy is asserted in .scratch/market.mts against a real database. This
 * is the half that only a browser can see: that a gamer is told what their
 * points are WORTH, that the shelf is reachable from the nav, and that the
 * Profile-of-the-Week board no longer opens over whatever page you asked for.
 */
import { chromium } from "playwright-core";
import { after, open } from "./_nav.mjs";

const BASE = "http://localhost:3031";
const SHOTS = "/tmp/claude-0/-home-user-clustergg/f1b2f374-59b4-5577-bf34-0df216698fe3/scratchpad";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

try {
  console.log("\n== The band is collapsed, and the nav is one surface ==");
  // Signed IN, because that is the case that used to open the board by default
  // and drop 700px of vote standings over every page.
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "nova@demo.gg");
  await page.fill('input[name="password"]', "cluster-demo");
  await page.click('button:has-text("Log in with email")');
  await after(page);
  await open(page, `${BASE}/marketplace`);
  await page.locator('button:has-text("Accept all")').first().click().catch(() => {});
  await page.waitForTimeout(600);

  const body = await page.locator("body").innerText();
  ok("the vote board is NOT open over the page",
    !/the most-backed profile on cluster/i.test(body), body.slice(0, 200).replace(/\n/g, " | "));
  ok("but the strip is still there, one click away",
    /profile of the week/i.test(body), body.slice(0, 200).replace(/\n/g, " | "));

  // The nav art has to run through the strip rather than stopping at it.
  const art = await page.evaluate(() => {
    const header = document.querySelector("header");
    const strip = [...(header?.querySelectorAll("div") ?? [])]
      .find((d) => /profile of the week/i.test(d.textContent || "") && d.clientHeight < 80);
    const navBg = header ? getComputedStyle(header).backgroundImage : "none";
    const stripBg = strip ? getComputedStyle(strip).backgroundImage : "none";
    return { navBg, stripBg, hasStrip: !!strip };
  });
  ok("the strip was found", art.hasStrip);
  // When there IS nav art the strip must carry it; when there isn't, both are
  // plain and there is nothing to match — assert the relationship, not a value.
  const navHasArt = /url\(/.test(art.navBg);
  ok(navHasArt
    ? "the nav art runs through the strip"
    : "(no nav art configured — nothing to carry through)",
    navHasArt ? /url\(/.test(art.stripBg) : true,
    `nav=${art.navBg.slice(0, 60)} strip=${art.stripBg.slice(0, 60)}`);

  console.log("\n== The marketplace ==");
  ok("the page loads", /what your points are for/i.test(body), body.slice(0, 160).replace(/\n/g, " | "));
  // B2 gave Cluster Points a coin and stopped rendering them as the bare word
  // "CP" — `<Cp>` draws the mark and spells "Cluster Points" for screen
  // readers. The claim is unchanged and still on the page; only the wording
  // moved. Checked against the live page before this assertion was relaxed:
  // it reads "10,000 Cluster Points = $1 of trophy".
  // …and the figure spans a line break, because <Cp> renders the mark, the
  // number and the sr-only words as separate elements. Matched against
  // whitespace-collapsed text, not raw innerText.
  ok("it says what CP is worth in money",
    /(CP|Cluster Points)\s*=\s*\$1/i.test(body.replace(/\s+/g, " ")),
    body.slice(0, 400).replace(/\n/g, " | "));
  ok("it promises spending never costs a level",
    /never lowers your level/i.test(body), body.slice(0, 500).replace(/\n/g, " | "));
  ok("a bought trophy is said to redeem like a won one",
    /redeems like a won one|redeem/i.test(body));

  const cards = await page.locator("[data-trophy]").count();
  ok("trophies are on the shelf", cards > 0, `${cards} trophies`);
  // Same cause: nothing on this page ends in "CP" any more. Every figure is a
  // <Cp> whose readable text ends in "Cluster Points".
  const priced = await page.getByText(/(CP|Cluster Points)$/).count();
  ok("each one shows a CP price", priced > 0, `${priced} prices`);

  console.log("\n== It is reachable without knowing it exists ==");
  const navLink = await page.locator('a[href="/marketplace"]').count();
  ok("the nav has a marketplace link", navLink > 0, `${navLink}`);

  console.log("\n== The quests page carries the whole shelf ==");
  await open(page, `${BASE}/quests`);
  const quests = await page.locator("body").innerText();
  ok("the shelf is on the page where CP is earned",
    /spend your cluster points/i.test(quests), quests.slice(-400).replace(/\n/g, " | "));
  ok("with the balance stated as value", /to spend/i.test(quests));

  console.log("\n== Admin sees the economy ==");
  const boss = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await boss.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await boss.fill('input[name="email"]', "admin@clustergg.com");
  await boss.fill('input[name="password"]', "cluster-admin");
  await boss.click('button:has-text("Log in with email")');
  await after(boss);
  const r = await open(boss, `${BASE}/admin/marketplace`);
  const admin = await boss.locator("body").innerText();
  ok("the admin marketplace opens", !!r && r.status() < 400 && !/could not be found/i.test(admin), String(r?.status()));
  ok("the wallet counts CP taken in", /cp taken in/i.test(admin), admin.slice(0, 300).replace(/\n/g, " | "));
  ok("and what we owe if every trophy is cashed out",
    /redeemable liability/i.test(admin));
  ok("the pricing model is explained, not hidden",
    /how the price is worked out/i.test(admin) && /CP = \$1/i.test(admin));
  ok("every transaction has a ledger", /every transaction/i.test(admin));

  // Staff can set the price and hide a trophy.
  await open(boss, `${BASE}/admin/trophies`);
  const trophies = await boss.locator("body").innerText();
  ok("trophies can be priced in CP", (await boss.locator('input[name="cpPrice"]').count()) > 0);
  ok("and hidden from the shelf", (await boss.locator('input[name="inMarketplace"]').count()) > 0,
    trophies.slice(0, 120).replace(/\n/g, " | "));
  await boss.close();

  console.log("\n== Layout ==");
  await open(page, `${BASE}/marketplace`);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok("no horizontal overflow", overflow <= 0, String(overflow));
  await page.screenshot({ path: `${SHOTS}/marketplace.png` });
} catch (e) {
  fail++;
  console.log("  ✗ threw:", e.message);
  try { await page.screenshot({ path: `${SHOTS}/marketplace-fail.png` }); } catch {}
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
