/**
 * B6 — cashing out, as a route you can leave and come back to.
 *
 * It was a two-step popup inside the trophy case: fine for one $5 trophy, poor
 * for the moment somebody cashes out $400, and impossible to link, refresh or
 * send to support. The state now lives in the URL, so this suite can assert the
 * things that were previously unassertable — that a refresh resumes, that back
 * works, that a stale link degrades instead of breaking.
 *
 * And the one the whole payments design rests on: **no step of this flow
 * contains a field that could hold an account number.** Asserted by inspecting
 * every input name, placeholder, label and select on every step, not by reading
 * the copy.
 *
 *   scripts/with-server.sh 3031 node tests/ui/redeem-flow.mjs
 */
import { chromium } from "playwright-core";
import { after, landed, open, settle } from "./_nav.mjs";

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

// Every name, placeholder, label and option a human could type into, on
// whatever step is currently rendered.
const fieldSurface = (page) => page.evaluate(() => {
  const bits = [];
  for (const el of document.querySelectorAll("input, textarea, select, label")) {
    bits.push(el.getAttribute("name") ?? "", el.getAttribute("placeholder") ?? "",
      el.getAttribute("aria-label") ?? "", el.tagName === "LABEL" ? el.textContent ?? "" : "");
  }
  return bits.join(" | ");
});

const BANKISH = [
  /routing/i, /account\s*number/i, /accountnumber/i, /\biban\b/i, /\bswift\b/i, /sort\s*code/i,
  /card\s*number/i, /\bcvv\b/i, /\blast\s*4\b/i, /bic\b/i, /beneficiary/i,
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

try {
  console.log("\n== signed out, it does not leak a trophy case ==");
  const anonCtx = await browser.newContext();
  const anon = await anonCtx.newPage();
  await open(anon, `${BASE}/redeem`);
  // The bounce to /login is CLIENT-side: the page streams, so by the time the
  // guard runs the shell has flushed and Next can no longer answer with a 307.
  // Reading the URL at domcontentloaded reports /redeem on a redirect that
  // worked.
  await landed(anon, "/redeem");
  ok("it sends you to log in", /\/login/.test(anon.url()), anon.url());
  await anonCtx.close();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "nova@demo.gg");
  await page.fill('input[name="password"]', "cluster-demo");
  await page.click('button:has-text("Log in with email")');
  await after(page);

  console.log("\n== the wallet points at it ==");
  await open(page, `${BASE}/wallet`);
  await page.locator('button:has-text("Accept all")').first().click().catch(() => {});
  const cta = page.locator('a[href="/redeem"]').first();
  ok("there is a cash-out link on the wallet", await cta.count() > 0);

  console.log("\n== step 1 — choose trophies ==");
  await open(page, `${BASE}/redeem`);
  ok("an unknown step lands on step one",
    await page.locator('[data-redeem-step="trophies"]').count() === 1);
  const next = page.locator("[data-next]");
  ok("Next is locked with nothing chosen", await next.isDisabled());

  const awards = page.locator("[data-award]");
  const n = await awards.count();
  ok("there are trophies to cash out", n > 0, `${n} held`);
  await tap(awards.first());
  // The tick itself is optimistic; the URL catches up behind it. Asserted in
  // that order deliberately — a checkbox that waits on a server round trip is
  // the defect this component was rewritten to remove.
  await page.waitForTimeout(150);   // a React render, not a server round trip
  ok("the tick is immediate", await awards.first().getAttribute("aria-pressed") === "true");
  await page.waitForTimeout(1500);
  ok("…and the URL catches up", /[?&]t=/.test(page.url()), page.url());
  ok("…and unlocks Next", !(await page.locator("[data-next]").isDisabled()));
  const total1 = await page.locator("[data-sel-total]").textContent();
  ok("…and totals what is selected", /^\$\d/.test(total1.trim()), total1);

  console.log("\n== a refresh mid-flow resumes ==");
  const urlAtStep1 = page.url();
  await page.reload({ waitUntil: "domcontentloaded" }); await settle(page);
  // Wait for HYDRATION, not just for paint. `data-next` is server-rendered
  // disabled and React enables it once the selection is restored from the URL
  // token — so a click before that lands on a button whose handler does not
  // exist yet, and the flow silently stays on step one. The old
  // `networkidle` waited long enough for this by accident; this waits for it
  // on purpose.
  await page.waitForSelector("[data-next]:not([disabled])", { timeout: 15000 }).catch(() => {});
  ok("the selection survives", await page.locator("[data-sel-total]").textContent() === total1);
  ok("…and so does the step", await page.locator('[data-redeem-step="trophies"]').count() === 1);

  console.log("\n== step 2 — how you want to be paid ==");
  await tap(page.locator("[data-next]"));
  await page.waitForTimeout(1500);
  ok("it is step two", await page.locator('[data-redeem-step="method"]').count() === 1, page.url());
  ok("…and the step is in the URL", /step=method/.test(page.url()), page.url());
  ok("the methods are words, not accounts", await page.locator("[data-method]").count() >= 4);
  await tap(page.locator('[data-method="paypal"]'));
  await page.waitForTimeout(300);

  console.log("\n== back works, because it is just navigation ==");
  await page.goBack({ waitUntil: "domcontentloaded" }); await settle(page);
  await page.waitForTimeout(400);
  ok("the browser back button returns to step one",
    await page.locator('[data-redeem-step="trophies"]').count() === 1, page.url());
  await page.goForward({ waitUntil: "domcontentloaded" }); await settle(page);
  await page.waitForTimeout(400);
  ok("…and forward returns to step two",
    await page.locator('[data-redeem-step="method"]').count() === 1, page.url());
  await tap(page.locator("[data-back]"));
  await page.waitForTimeout(1500);
  ok("the in-page Back does the same",
    await page.locator('[data-redeem-step="trophies"]').count() === 1);

  console.log("\n== step 3 — confirm, and the totals match ==");
  await tap(page.locator("[data-next]"));
  await page.waitForTimeout(1500);
  await tap(page.locator("[data-next]"));
  await page.waitForTimeout(1500);
  ok("it is the confirm step", await page.locator('[data-redeem-step="confirm"]').count() === 1, page.url());
  const total3 = await page.locator("[data-total]").textContent();
  ok("the confirm total matches what was selected",
    total3.replace(/\s.*/, "") === total1.trim(), `${total3} vs ${total1}`);
  const submit = page.locator("[data-submit]");
  ok("the button names the amount", total1.trim().length > 1 && (await submit.textContent()).includes(total1.trim()),
    await submit.textContent());
  ok("…and the method chosen is restated",
    /paypal/i.test(await page.locator("[data-method-summary]").textContent()),
    await page.locator("[data-method-summary]").textContent());

  console.log("\n== NO STEP ASKS FOR A BANK ACCOUNT ==");
  // The property the whole payments design rests on. Checked per step, on the
  // real field surface — not on the prose, which could say anything.
  for (const step of ["trophies", "method", "confirm"]) {
    await open(page, `${BASE}/redeem?step=${step}&t=${new URL(urlAtStep1).searchParams.get("t")}`);
    const surface = await fieldSurface(page);
    const hit = BANKISH.find((re) => re.test(surface));
    ok(`step "${step}" has no bank field`, !hit, `${hit} in: ${surface.slice(0, 200)}`);
  }

  console.log("\n== a stale link degrades instead of breaking ==");
  await open(page, `${BASE}/redeem?step=confirm&t=does-not-exist`);
  ok("a trophy that is gone is dropped, not submitted",
    await page.locator("[data-submit]").isDisabled());
  ok("…and the page still renders", await page.locator("[data-redeem-step]").count() === 1);
  await open(page, `${BASE}/redeem?step=nonsense`);
  ok("a nonsense step is step one, not an error",
    await page.locator('[data-redeem-step="trophies"]').count() === 1);
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
