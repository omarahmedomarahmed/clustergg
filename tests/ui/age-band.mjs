/**
 * B72.4 — the age band, driven the way a gamer meets it.
 *
 * The DB suite proves the RULE (`lib/age.ts`, `changeBand`, `mayEarn`). This
 * proves the two things a rule cannot: that somebody is actually ASKED, and that
 * a mis-tap can be undone.
 *
 * Both were real gaps rather than hypotheticals. The picker shipped inside
 * `/settings/earning` and nothing else rendered it — so a gamer who never opened
 * settings was never asked, earned nothing, and had no way to find out why. And
 * the band is answered in ONE CLICK with no confirm step, which makes a mis-tap
 * onto "Under 16" — the one band that turns the whole product off — inevitable.
 *
 * A fresh signup is used deliberately: the seeded demo gamers all state a band,
 * so the only honest way to see the unanswered state is to become somebody who
 * has not answered.
 *
 *   scripts/with-server.sh 3031 node tests/ui/age-band.mjs
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://localhost:3031";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const gate = (page) => page.locator("text=One question before you can earn").first();
const band = (page, b) => page.locator(`button[data-band="${b}"]`).first();
const pick = async (page, b) => {
  await band(page, b).click();
  // The action revalidates the whole LAYOUT, so the answer arrives as a
  // re-render. Two settled states are both correct: the button comes back
  // selected (settings), or the picker is gone entirely (the gate answered
  // itself away). `networkidle` is not usable here — the starfield and the
  // analytics beacon keep the connection warm and it never fires.
  await page.waitForFunction((want) => {
    const el = document.querySelector(`button[data-band="${want}"]`);
    return !el || /emerald/.test(el.className);
  }, b, { timeout: 15000 });
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const tag = Date.now().toString(36);
const email = `band-${tag}@demo.gg`;

console.log("== a brand-new gamer is asked, without going looking ==");
{
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="displayName"]', `Band ${tag}`).catch(() => {});
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "cluster-demo");
  await page.locator('form button').first().click();
  await page.waitForLoadState("networkidle");
  ok("signup lands somewhere signed in", !/\/signup/.test(page.url()), page.url());

  ok("the gate is on the page they landed on", await gate(page).isVisible());
  ok("…and says earning is OFF, not that a form is incomplete",
    /nothing is earning/i.test(await page.locator("body").innerText()));

  // The point of putting it in the layout: it does not depend on which page.
  await page.goto(`${BASE}/quests`, { waitUntil: "domcontentloaded" });
  ok("…and follows them to another page", await gate(page).isVisible());
}

console.log("\n== answering it takes one click, from where they are ==");
{
  await pick(page, "adult");
  ok("the gate is gone", !(await gate(page).isVisible().catch(() => false)));
  await page.goto(`${BASE}/feed`, { waitUntil: "domcontentloaded" });
  ok("…on every other page too, not just the one they answered on",
    !(await gate(page).isVisible().catch(() => false)));
}

console.log("\n== a mis-tap is correctable, and the page says what it cost ==");
{
  await page.goto(`${BASE}/settings/earning`, { waitUntil: "domcontentloaded" });
  const body = () => page.locator("body").innerText();
  ok("settings shows the answer they gave", await band(page, "adult").getAttribute("class").then((c) => /emerald/.test(c)));
  ok("…and what it lets them do", /Cash trophies out/i.test(await body()));

  // The mis-tap this whole page exists for.
  await pick(page, "under16");
  ok("under-16 is accepted", await band(page, "under16").getAttribute("class").then((c) => /emerald/.test(c)));
  ok("…and the page says earning is off", /Browse only|no points/i.test(await body()));

  // …and undone. This is the assertion the feature is FOR.
  await pick(page, "adult");
  ok("and it can be undone", await band(page, "adult").getAttribute("class").then((c) => /emerald/.test(c)));
  ok("…with the remaining changes stated", /more time|once more/i.test(await body()));
}

console.log("\n== the third change locks it ==");
{
  await pick(page, "teen");           // change 3
  const body = await page.locator("body").innerText();
  ok("it says it is locked", /locked/i.test(body));
  ok("…and tells them what to do about it", /support/i.test(body));
  const other = band(page, "adult");
  ok("…and the other bands are no longer clickable", await other.isDisabled());
  ok("but the one they are on is still shown", await band(page, "teen").getAttribute("class").then((c) => /emerald/.test(c)));
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
