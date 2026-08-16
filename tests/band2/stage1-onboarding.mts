// Band 2 — a real browser against a real build, and the screenshots are the
// record. docs/09-TEST-PLAN.md: "Failures and refusals are captured too. A
// record of only the happy path proves nothing."
//
// This is the Stage 1 slice: signup, the fork, the three onboarding steps of
// each path, the switch between them, the refusal that exists at this stage,
// and the under-13 path including the fact that it cannot be taken back.
// Stage 10 grows it into the full flow list.
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

// A suffix so a second run against the same server is not four "you already
// have an account with that email" routes. That route is correct behaviour
// (I1c1) — it is just not what this file is photographing.
const RUN = Date.now().toString(36);
const mail = (who: string) => `${who}+${RUN}@example.test`;
// L1 — one game account belongs to one gamer, across all gamers and forever.
// A fixed in-game name links on the first run and is refused on the second.
const ign = (who: string) => `${who}-${RUN}#EUW`;

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

/**
 * Signup through the email door, all the way to onboarding.
 *
 * I7a — the address is verified **at signup**, because it is the credential
 * and a reset is impossible without it. So there is a step between the form
 * and `/onboarding`, and it is walked here rather than skipped: the demo puts
 * the code on screen because there is no inbox, and that is the only reason
 * this is automatable at all.
 */
async function signUpAs(page: Page, displayName: string, email: string) {
  await page.goto(`${BASE}/signup`);
  await page.fill('input[name="displayName"]', displayName);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "a-long-enough-passphrase");
  await page.click('[data-testid="email-signup"]');

  await page.waitForSelector('[data-testid="demo-code"]', { timeout: 15_000 });
  // `\d+`, not `\S+` — the sentence ends in a full stop, and `\S+` swallows it
  // into the code. The verify step then refuses and the wait below times out
  // somewhere else entirely.
  const shown = (await page.innerText('[data-testid="demo-code"]')).match(/code is\s+(\d+)/);
  if (!shown) throw new Error("The demo verification code was not on the page.");
  await page.fill('[data-testid="verify-code"]', shown[1]);
  await page.click('[data-testid="verify-submit"]');
}

/**
 * Wait for the onboarding step the page says it is on.
 *
 * `data-step` on the page IS `unlockState().next`, so waiting on it also
 * asserts that the derivation drives the UI. A selector, not an evaluated
 * function: esbuild's name-keeping injects a `__name` helper into anything
 * evaluated in the page, and the browser has never heard of it.
 */
async function waitForStep(
  page: Page,
  want: "fork" | "link" | "guilds" | "ageBand" | "country" | "done",
) {
  await page.waitForSelector(`main[data-step="${want}"]`, { timeout: 15_000 });
}

/**
 * The fork, and the order it enforces.
 *
 * I7 — the fork stores nothing, which is the only reason it may come before
 * the age question. Whichever path is picked, the very next `data-step` has to
 * be `ageBand`, and that wait is the assertion: if the page ever asked for
 * something storable first, this hangs rather than screenshotting it.
 */
async function chooseFork(page: Page, which: "gamer" | "owner") {
  await waitForStep(page, "fork");
  await page.click(`[data-testid="path-${which}"]`);
  await waitForStep(page, "ageBand");
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

  await signUpAs(page, "日本語ゲーマー", mail("gamer"));
  await waitForStep(page, "fork");
  await shot(page, "onboarding-fork");

  await chooseFork(page, "gamer");
  await shot(page, "onboarding-step-1-age-band");

  await page.click('form:has(input[value="adult"]) button[type="submit"]');
  await waitForStep(page, "country");
  await shot(page, "onboarding-step-2-country");

  await page.selectOption('select[name="country"]', "GB");
  await page.click('form:has(select[name="country"]) button[type="submit"]');
  await waitForStep(page, "link");
  await shot(page, "onboarding-step-3-link");

  // Refusal: submitted with no in-game name.
  await page.click('form:has(input[name="inGameName"]) button[type="submit"]');
  await page.waitForSelector("text=Pick a game and enter", { timeout: 15_000 });
  await shot(page, "refusal-no-game-name");

  await page.fill('input[name="inGameName"]', ign("Checker"));
  await page.click('form:has(input[name="inGameName"]) button[type="submit"]');
  await waitForStep(page, "done");
  await shot(page, "onboarding-complete");
}

// ── The owner path. Same two questions, a different third one (12 §2, G1),
//    and the screenshot of the switch back is the record of I9 — either path
//    always says they can be the other one too.
{
  const page = await freshPage(browser);
  await signUpAs(page, "Server Owner", mail("owner"));
  await chooseFork(page, "owner");

  await page.click('form:has(input[value="adult"]) button[type="submit"]');
  await waitForStep(page, "country");
  await page.selectOption('select[name="country"]', "GB");
  await page.click('form:has(select[name="country"]) button[type="submit"]');

  // No game account was ever asked for, and the page is not blocked on one.
  await waitForStep(page, "guilds");
  await shot(page, "owner-step-3-guilds");

  await page.click('[data-testid="switch-path"]');
  await waitForStep(page, "link");
  await shot(page, "owner-switched-to-gamer-keeps-both-answers");
}

// ── The under-13 path. It destroys the account, so it gets its own browser.
{
  const page = await freshPage(browser);
  await signUpAs(page, "Too Young", mail("young"));
  // Straight from the fork to the age question — nothing has been stored yet,
  // which is the point of asking here (I7).
  await chooseFork(page, "gamer");
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
  // The SAME address. U3 blocks the identity that answered, and a different
  // email is a different identity — using one here would photograph a
  // successful signup and call it a block.
  await page.fill('input[name="email"]', mail("young"));
  await page.fill('input[name="password"]', "a-long-enough-passphrase");
  await page.click('[data-testid="email-signup"]');
  await page.waitForURL("**/goodbye", { timeout: 15_000 });
  await shot(page, "under-13-cannot-re-register");
}

await browser.close();
console.log(`\n${n} screenshots written to ${path.relative(process.cwd(), OUT)}`);
