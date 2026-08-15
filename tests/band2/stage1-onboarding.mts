// Band 2 — a real browser against a real build, and the screenshots are the
// record. docs/09-TEST-PLAN.md: "Failures and refusals are captured too. A
// record of only the happy path proves nothing."
//
// This is the Stage 1 slice: signup, the three onboarding steps, the refusal
// that exists at this stage, and the under-13 path including the fact that it
// cannot be taken back. Stage 10 grows it into the full flow list.
//
// Every wait is on a DOM state, never on a URL that is already correct. A
// `waitForURL` that matches the page you are standing on returns instantly and
// screenshots the step before the one you meant — which is how the first run
// of this file produced a picture of step 1 labelled step 2.

import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "screenshots", "gamer-onboarding");

let n = 0;
async function shot(page: Page, what: string) {
  n++;
  const file = path.join(OUT, `${String(n).padStart(2, "0")}-${what}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${path.relative(process.cwd(), file)}`);
}

/** A fresh, signed-out browser. Each gamer gets their own. */
async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 900 },
  });
  return context.newPage();
}

async function signUpAs(page: Page, displayName: string) {
  await page.goto(`${BASE}/signup`);
  await page.fill('input[name="displayName"]', displayName);
  await page.click('form button[type="submit"]');
}

/**
 * Wait for the onboarding step the page says it is on.
 *
 * `data-step` on the page IS `unlockState().next`, so waiting on it also
 * asserts that the derivation drives the UI. A selector, not an evaluated
 * function: esbuild's name-keeping injects a `__name` helper into anything
 * evaluated in the page, and the browser has never heard of it.
 */
async function waitForStep(page: Page, want: "link" | "ageBand" | "country" | "done") {
  await page.waitForSelector(`main[data-step="${want}"]`, { timeout: 15_000 });
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

// The environment ships a Chromium at a fixed path and blocks downloading
// another, so point at it rather than letting Playwright look for the build
// its own version expects.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});

console.log("gamer onboarding:");

// ── The happy path, on a name with no Latin transliteration at all, so the
//    slug fallback is exercised by the screenshot run and not only by the
//    logic band.
{
  const page = await freshPage(browser);
  await page.goto(`${BASE}/signup`);
  await shot(page, "signup");

  await signUpAs(page, "日本語ゲーマー");
  await waitForStep(page, "link");
  await shot(page, "onboarding-step-1-link");

  // Refusal: submitted with no in-game name.
  await page.click('form:has(input[name="inGameName"]) button[type="submit"]');
  await page.waitForSelector("text=Pick a game and enter", { timeout: 15_000 });
  await shot(page, "refusal-no-game-name");

  await page.fill('input[name="inGameName"]', "Checker#EUW");
  await page.click('form:has(input[name="inGameName"]) button[type="submit"]');
  await waitForStep(page, "ageBand");
  await shot(page, "onboarding-step-2-age-band");

  await page.click('form:has(input[value="adult"]) button[type="submit"]');
  await waitForStep(page, "country");
  await shot(page, "onboarding-step-3-country");

  await page.selectOption('select[name="country"]', "GB");
  await page.click('form:has(select[name="country"]) button[type="submit"]');
  await waitForStep(page, "done");
  await shot(page, "onboarding-complete");
}

// ── The under-13 path. It destroys the account, so it gets its own browser.
{
  const page = await freshPage(browser);
  await signUpAs(page, "Too Young");
  await waitForStep(page, "link");
  await page.fill('input[name="inGameName"]', "Young#EUW");
  await page.click('form:has(input[name="inGameName"]) button[type="submit"]');
  await waitForStep(page, "ageBand");
  await shot(page, "age-band-under-13-is-a-link-not-a-button");

  await page.click("text=I am under 13");
  await page.waitForURL("**/goodbye", { timeout: 15_000 });
  await shot(page, "under-13-account-closed");
}

// ── And they cannot come back with a different answer.
{
  const page = await freshPage(browser);
  await page.goto(`${BASE}/signup`);
  await page.fill('input[name="displayName"]', "Too Young");
  await page.click('form button[type="submit"]');
  await page.waitForURL("**/goodbye", { timeout: 15_000 });
  await shot(page, "under-13-cannot-re-register");
}

await browser.close();
console.log(`\n${n} screenshots written to ${path.relative(process.cwd(), OUT)}`);
