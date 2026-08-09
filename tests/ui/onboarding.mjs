/**
 * B94–B98 — the three steps, driven the way a gamer meets them.
 *
 * This file replaces `age-band.mjs`, which drove a three-option picker inside a
 * layout banner that no longer exists. The DB suite proves the RULES; a browser
 * is the only thing that can prove the two facts a rule cannot:
 *
 *   1. Somebody is actually ASKED — the bar follows them off the page.
 *   2. The steps can be finished WITHOUT LEAVING THE PAGE, including the email
 *      code, which is the step most likely to dead-end.
 *
 * A fresh signup is used deliberately: every seeded demo gamer is already
 * finished, so the only honest way to see the unfinished state is to become
 * somebody who has not finished.
 *
 * The code is read off the page. That is not a shortcut — with no mail provider
 * configured the product deliberately prints it (see `requestEmailCode`), and
 * asserting that it is there is asserting that a local copy of this product is
 * usable past step two.
 *
 *   scripts/with-server.sh 3031 node tests/ui/onboarding.mjs
 */
import { chromium } from "playwright-core";
import { after, settle } from "./_nav.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3031";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const done = async () => {
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const body = () => page.locator("body").innerText();

const tag = Date.now().toString(36);
const email = `onb-${tag}@demo.gg`;

console.log("== a brand-new gamer is asked, without going looking ==");
{
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="displayName"]', `Onb ${tag}`).catch(() => {});
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "cluster-demo");
  await page.locator("form button").first().click();
  await after(page);
  ok("signup lands on the onboarding page", /\/onboarding/.test(page.url()), page.url());

  const text = await body();
  ok("it leads with what they get, not a pending balance",
    /Challenges/.test(text) && !/CP waiting|CP locked/.test(text), text.slice(0, 300));
  ok("…and there are three steps", /0 of 3|1 of 3/.test(text));

  // The point of putting the bar in the layout: it does not depend on the page.
  await page.goto(`${BASE}/quests`, { waitUntil: "domcontentloaded" });
  ok("the bar follows them to another page",
    /steps? left before you can earn/i.test(await body()));
}

console.log("\n== the email is confirmed in place, and never printed ==");
{
  await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
  ok("the address is masked, not printed", !(await body()).includes(email), email);

  // B98 already sent one at signup. Asking for another proves the resend path,
  // and it is the only way to see the code on a deployment with no mail.
  //
  // Scoped to the form that owns the email input: `has-text("Send")` on its own
  // matches whatever else the chrome puts on the page, and clicking the wrong
  // button looks identical to a broken action.
  const sendForm = page.locator('form:has(input[name="email"])').first();
  await sendForm.locator("button").first().waitFor({ timeout: 15000 });
  // The action is a server action, so it needs hydration before a click does
  // anything a re-render can be waited on.
  await settle(page);
  await sendForm.locator("button").first().click();
  // The action re-renders the step rather than navigating, so waiting on the
  // element that only exists afterwards is the reliable signal —
  // `networkidle` never fires in this app.
  const step = page.locator('section:has(input[name="email"])').first();
  // Wait for the CODE, not for the code box: the box is already on the page,
  // because B98 sent a code at signup and the step opens on "check your inbox".
  // Waiting for an element that was there before the click is not a wait.
  await page.waitForFunction(
    () => /code is \d{6}/.test(document.body.innerText),
    null, { timeout: 25000 },
  ).catch(() => {});
  // Read out of the step's own text rather than off an attribute. An attribute
  // is a nicer hook and it ties the test to a rebuild — the assertion is about
  // the code being READABLE by whoever is looking at the page, which is exactly
  // what the text says.
  const code = ((await step.innerText().catch(() => "")).match(/code is (\d{6})/) || [])[1] || null;
  ok("a code is available to type", !!code,
    // The step's own text, not the whole page — the first 400 characters of a
    // page whose first 400 characters are the nav tell you nothing.
    await step.innerText().catch(() => "no step"));
  if (!code) await done();

  await page.fill('input[name="code"]', code);
  await page.locator('button:has-text("Confirm")').first().click();
  // Same trap as above: `settle` returns as soon as the document is readable,
  // and the document was readable before the click. Wait for the STATE.
  const confirmed = await page.waitForFunction(
    () => /confirmed/i.test(document.body.innerText),
    null, { timeout: 25000 },
  ).then(() => true).catch(() => false);
  ok("the email step is done", confirmed, (await step.innerText().catch(() => "")).slice(0, 300));
}

console.log("\n== the third step is three answers and a live card ==");
{
  await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });

  // SELECT → READ WHAT IT MEANS → CONFIRM. The middle one is the whole design.
  await page.locator('button[aria-pressed]:has-text("13 to 17")').first().click();
  await settle(page);
  ok("choosing under-18 says what it costs BEFORE it is saved",
    /until you turn 18/i.test(await body()));

  await page.locator('button[aria-pressed]:has-text("18 or over")').first().click();
  await settle(page);
  ok("…and choosing 18+ says what it opens",
    /turn those trophies into money/i.test(await body()));

  await page.locator('button[aria-pressed]:has-text("United States")').first().click();
  await settle(page);
  ok("the country says where the money goes", /\$2,000|report it/i.test(await body()));

  // Under-13 is a link, not a third button, and opening it must not select
  // anything — otherwise the confirm is one stray click away.
  await page.locator('button:has-text("under 13")').first().click();
  await settle(page);
  const warn = await body();
  ok("the under-13 way out explains the law", /COPPA/.test(warn));
  ok("…and asks for a typed confirmation", /Type DELETE/i.test(warn));
  await page.locator('button:has-text("Never mind")').first().click();
  await settle(page);

  // The theme, and the card that changes under it. B97.
  await page.locator('button[title="Champion"]').first().click();
  await settle(page);
  ok("the card preview is on the page", /Your card/i.test(await body()));

  await page.locator('button:has-text("Confirm and finish")').first().click();
  await settle(page);
}

console.log("\n== two of three done, and the count is honest ==");
{
  // The LINK step is not driven here, and the reason is worth stating: it means
  // proving ownership of a real account at a real provider, which a browser
  // test cannot do without inventing a fake provider — and a fake provider
  // tests the fake, not the product.
  //
  // So what is asserted is the count. A bar still saying "3 steps" after two
  // were finished is the bug this catches.
  await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
  const text = await body();
  ok("the page counts two of three", /2 of 3/.test(text), text.slice(0, 400));
  ok("…and the answers are shown back", /18 or over/.test(text) && /US/.test(text));

  await page.goto(`${BASE}/quests`, { waitUntil: "domcontentloaded" });
  const bar = await body();
  ok("the bar says one step left", /1 step left before you can earn/i.test(bar), bar.slice(0, 200));
  ok("…and names the one that is left", /Next: link a game account/i.test(bar));
  ok("…and never claims a pending balance", !/CP waiting|CP locked/.test(bar));
}

console.log("\n== the age answer cannot be changed back ==");
{
  await page.goto(`${BASE}/settings/earning`, { waitUntil: "domcontentloaded" });
  const text = await body();
  ok("settings shows the answer they gave", /18 or over/.test(text));
  ok("…and says a human has to change it", /support/i.test(text));
  ok("…and the other band is not clickable",
    await page.locator('button[data-band="teen"]').first().isDisabled());
}

await done();
