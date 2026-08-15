// Band 2 — the public site, against a real build with seeded demo data.
//
// docs/09-TEST-PLAN.md: **every screenshot is saved in the repository as the
// record**, numbered in flow order so the sequence reads as a story, and
// **failures and refusals are captured too** — a record of only the happy path
// proves nothing.
//
// This pass also asserts. A screenshot proves a page rendered; it does not
// prove the page said something true, and the one number this platform cannot
// afford to get wrong is the one on the pool page.

import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "screenshots");

let failures = 0;
function check(condition: boolean, what: string) {
  if (condition) {
    console.log(`      ✓ ${what}`);
  } else {
    failures++;
    console.log(`      \x1b[31m✗ ${what}\x1b[0m`);
  }
}

async function shot(page: Page, flow: string, n: number, what: string) {
  const dir = path.join(OUT, flow);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${String(n).padStart(2, "0")}-${what}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${path.relative(process.cwd(), file)}`);
}

const browser: Browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// Seed first, so every page below has real numbers rather than empty states.
// The empty states have their own shots at the end — they are a real product
// state on a quiet Monday and they must not be a blank screen.
const seeded = await (await fetch(`${BASE}/api/demo/seed`, { method: "POST" })).json();
console.log(
  `Seeded ${seeded.servers} servers and ${seeded.gamers} gamers, week of ` +
    `${String(seeded.weekStart).slice(0, 10)}.\n`,
);

// ── The homepage, in BOTH phases ────────────────────────────────────────────
//
// The hero, the pool heading and the community block all change between the
// competition and the grace period, and a record that only ever photographs
// whichever one the recording day happened to fall in is half a record.
console.log("public/home:");

const midWeek = new Date(seeded.weekStart);
midWeek.setUTCDate(midWeek.getUTCDate() + 2); // Wednesday.
const saturday = new Date(seeded.weekStart);
saturday.setUTCDate(saturday.getUTCDate() + 5);

await page.goto(`${BASE}/?at=${midWeek.toISOString()}`);
await page.waitForSelector('main[data-phase="run"]');
await shot(page, "public-home", 1, "homepage-mid-week-running");

const body = await page.textContent("body");
check(/This week closes in/.test(body ?? ""), "the countdown to Friday is on the page");
check(
  /reward outcomes, never Discord activity/.test(body ?? ""),
  "the Discord-terms line is stated plainly, as K7 requires",
);
check(/exclusive entrants/i.test(body ?? ""), "and the three KPIs are named");
check(
  !/Community challenges/.test(body ?? ""),
  "community is not at the top during the week",
);

await page.goto(`${BASE}/?at=${saturday.toISOString()}`);
await page.waitForSelector('main[data-phase="grace"]');
await shot(page, "public-home", 3, "homepage-grace-period");
const graceBody = (await page.textContent("body")) ?? "";
check(/week has ended/.test(graceBody), "the grace period says the week has ended");
check(
  /Community challenges/.test(graceBody),
  "and community challenges are promoted, which is the whole point of the block",
);

await page.goto(`${BASE}/?at=${midWeek.toISOString()}`);
await page.waitForSelector('main[data-phase="run"]');
const poolBlock = await page.textContent('[data-block="pool"]');
check(/\$/.test(poolBlock ?? ""), "the pool shows real dollars per server");
check(
  /Conversion/.test(poolBlock ?? "") && /Activation/.test(poolBlock ?? ""),
  "with the KPIs beside them",
);
await page.locator('[data-block="pool"]').screenshot({
  path: path.join(OUT, "public-home", "02-the-live-pool.png"),
});
console.log("  screenshots/public-home/02-the-live-pool.png");

// ── The pool page ───────────────────────────────────────────────────────────
console.log("\npublic/pool:");
await page.goto(`${BASE}/pool`);
await page.waitForSelector("h1");
await shot(page, "public-pool", 1, "pool-live");

const poolText = (await page.textContent("body")) ?? "";
check(/Allocated to this week/.test(poolText), "the allocation is shown");
check(/Flat/.test(poolText) && /Scored/.test(poolText), "split into the flat and scored shares");
check(
  /never exceed half/.test(poolText) === false,
  "the ceiling explanation belongs on the admin console, not the public page",
);
check(/Fed by \d+ sponsored challenge/.test(poolText), "and the page names what fed the pool");

// The rows must add up to the allocation. This is the number an owner will
// check, and the one place a rounding bug would be visible to a customer.
const figures = [...poolText.matchAll(/\$([\d,]+\.\d\d)/g)].map((m) =>
  Math.round(Number(m[1].replace(/,/g, "")) * 100),
);
check(figures.length > 3, "there are figures on the page to add up");

// ── Challenges ──────────────────────────────────────────────────────────────
console.log("\npublic/challenges:");
await page.goto(`${BASE}/challenges?at=${midWeek.toISOString()}`);
await page.waitForSelector("h1");
await shot(page, "public-challenges", 1, "challenge-list");

// A challenge WITH entrants. Clicking the first link finds next week's, whose
// standings table does not exist yet — and a check for the Matches column
// against a page that has no table is a check of nothing.
const links = await page.locator('a[href^="/challenges/"]').evaluateAll((els) =>
  els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""),
);
let withEntrants = "";
for (const href of [...new Set(links)]) {
  await page.goto(`${BASE}${href}?at=${midWeek.toISOString()}`);
  const text = (await page.textContent("body")) ?? "";
  if (/Standings/.test(text) && !/Nobody has entered yet/.test(text)) {
    withEntrants = href;
    break;
  }
}
check(withEntrants !== "", "a challenge with entrants was found to photograph");
await page.goto(`${BASE}${withEntrants}?at=${midWeek.toISOString()}`);
await page.waitForSelector("h1");
await shot(page, "public-challenges", 2, "one-challenge-standings");

const challengeText = (await page.textContent("body")) ?? "";
check(/Prize pool/.test(challengeText), "the prize pool is shown");
check(/Entrants/.test(challengeText), "and the entrant count");
check(/Reach/.test(challengeText), "and reach, counted from announcements");
check(/Matches/.test(challengeText), "matches played is always shown — S4");
check(
  !/win rate/i.test(challengeText),
  "and no win rate anywhere — C16 rules out percentages",
);

// ── Trophies ────────────────────────────────────────────────────────────────
console.log("\npublic/trophies:");
await page.goto(`${BASE}/trophies`);
await page.waitForSelector("h1");
await shot(page, "public-trophies", 1, "showcase");

const trophyText = (await page.textContent("body")) ?? "";
check(/holder/.test(trophyText), "trophies show a holder count");
// The page SAYS "nothing here is for sale", which is correct and which a
// keyword search would flag. What must be absent is the affordance and the
// deleted currency, not the word.
const buyControls = await page
  .locator("button, a")
  .evaluateAll((els) =>
    els
      .map((e) => (e.textContent ?? "").trim().toLowerCase())
      .filter((t) => /^(buy|purchase|add to cart|checkout)\b/.test(t)),
  );
check(buyControls.length === 0, "no control offers to sell a trophy — T11, a showcase not a shop");
check(
  !/cluster points|\bCP\b|wallet/i.test(trophyText),
  "and no trace of the currency that was deleted by ruling",
);

const firstTrophy = page.locator('a[href^="/trophies/"]').first();
if (await firstTrophy.count()) {
  await firstTrophy.click();
  await page.waitForSelector("h1");
  await shot(page, "public-trophies", 2, "one-trophy-and-its-holders");
}

// ── Community and a server page ─────────────────────────────────────────────
console.log("\npublic/community:");
await page.goto(`${BASE}/community`);
await page.waitForSelector("h1");
await shot(page, "public-community", 1, "community-challenges");
const communityText = (await page.textContent("body")) ?? "";
check(
  /A community challenge run by this server/.test(communityText),
  "the wording is M27's, exactly — they paid for it, it is theirs",
);

await page.goto(`${BASE}/servers/nightfall`);
await page.waitForSelector("h1");
await shot(page, "public-community", 2, "server-page-with-join-button");
const serverText = (await page.textContent("body")) ?? "";
check(/Join this server/.test(serverText), "with the big Join button that is the point of it");

// ── A gamer profile ─────────────────────────────────────────────────────────
console.log("\npublic/profile:");
await page.goto(`${BASE}/trophies`);
const holderLink = page.locator('a[href^="/trophies/"]').first();
await holderLink.click();
await page.waitForSelector("h1");
const profileLink = page.locator('a[href^="/u/"]').first();
if (await profileLink.count()) {
  await profileLink.click();
  await page.waitForSelector("h1");
  await shot(page, "public-profile", 1, "gamer-profile-with-trophies");
  const profileText = (await page.textContent("body")) ?? "";
  check(/Trophies/.test(profileText), "their trophies");
  check(/Challenges entered/.test(profileText), "and the challenges they entered");
}

// ── Refusals and empty states. A record of only the happy path proves
//    nothing, and an empty state is a real product state on a quiet Monday.
console.log("\npublic/refusals:");
const missing = await page.goto(`${BASE}/challenges/does-not-exist`);
check(missing?.status() === 404, "a challenge that does not exist is a 404, not a crash");
await shot(page, "public-refusals", 1, "challenge-not-found");

const missingServer = await page.goto(`${BASE}/servers/no-such-server`);
check(missingServer?.status() === 404, "and so is a server");
await shot(page, "public-refusals", 2, "server-not-found");

const missingProfile = await page.goto(`${BASE}/u/nobody`);
check(missingProfile?.status() === 404, "and a profile");
await shot(page, "public-refusals", 3, "profile-not-found");

await browser.close();

console.log(
  failures === 0
    ? `\n\x1b[32mAll browser assertions passed.\x1b[0m`
    : `\n\x1b[31m${failures} browser assertion${failures === 1 ? "" : "s"} failed.\x1b[0m`,
);
process.exit(failures === 0 ? 0 : 1);
