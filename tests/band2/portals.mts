// Band 2 — the two portals.
//
// docs/09-TEST-PLAN.md wants every state of every flow photographed, including
// the refusals. On these two surfaces the refusals are half the product:
//
//   * a wrong portal key, and the lockout message
//   * a server with no community profile, told it is **not scored** rather
//     than ranked last
//   * the bot removed, and the portal still working
//   * a builder refusing a week that has already started
//   * a report suppressing a group under the floor
//
// Every one of those is a screenshot below.

import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { chromiumPath } from "./browser.mts";
import { visible } from "./visible.mts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "screenshots");

let failures = 0;
function check(condition: boolean, what: string) {
  if (condition) console.log(`      ✓ ${what}`);
  else {
    failures++;
    console.log(`      \x1b[31m✗ ${what}\x1b[0m`);
  }
}

let n = 0;
async function shot(page: Page, what: string) {
  const dir = path.join(OUT, "portals");
  await fs.mkdir(dir, { recursive: true });
  n++;
  const file = path.join(dir, `${String(n).padStart(2, "0")}-${what}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${path.relative(process.cwd(), file)}`);
}

const browser: Browser = await chromium.launch({
  executablePath: chromiumPath(),
});
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 1000 } })
).newPage();

const seeded = await (await fetch(`${BASE}/api/demo/seed`, { method: "POST" })).json();
const guildId: string = seeded.guildIds[0];
// The seed's last server has removed the bot — S9's state, which has to be on
// screen to be believed.
const removedGuildId: string = seeded.guildIds[seeded.guildIds.length - 1];
const brandId: string = seeded.brandIds[0];
const midWeek = new Date(seeded.weekStart);
midWeek.setUTCDate(midWeek.getUTCDate() + 2);
const at = `at=${midWeek.toISOString()}`;
console.log(`Seeded, week of ${String(seeded.weekStart).slice(0, 10)}.\n`);

// ── The brand login: one-time invite, then email and password ───────────────
//
// ===== THIS SECTION WAS RED FOR SIX SPRINTS, AND ON PURPOSE =====
//
// It drove the **portal key** — `input[name="id"]` plus a key, and copy
// asserting *"there is no password anywhere"*. Sprint 3 deleted that model (S1)
// and the pass could not be repaired in place: its premise was gone, and the
// brand portal it photographs was about to become a SaaS shell. A permanently
// failing suite is how a suite gets deleted (trap 19), so it carried a date
// rather than a shrug, and this is the date.
//
// What it photographs now is B1: **the emailed key is a one-time invite**,
// exchanged once for an email-and-password account, and every sign-in after
// that is email and password.
console.log("portal/login:");
await page.goto(`${BASE}/login/brand`);
await page.waitForSelector("h1");
await shot(page, "brand-login");

const login = await visible(page);
check(/password/i.test(login), "the credential is a password now — the portal key is gone (S1)");
check(
  /one-time|once/i.test(login),
  "and the invite is described as one-time, because it is exchanged rather than kept",
);
check(
  !/portal key/i.test(login),
  "no rendered copy offers the credential the platform deleted",
);

// A wrong password, and the refusal that must not be a customer directory.
await page.fill('[data-testid="brand-email"]', "hi@acme.test");
await page.fill('[data-testid="brand-password"]', "definitely-not-the-password");
await page.click('[data-testid="brand-signin"]');
await page.waitForSelector('[data-testid="login-error"]');
const refusal = (await page.textContent('[data-testid="login-error"]')) ?? "";
check(/not right|do not match|incorrect/i.test(refusal), "a wrong password is refused");
check(
  !/no such|unknown|not found/i.test(refusal),
  "and a wrong password reads identically to an unknown email — the form is not a customer directory",
);
await shot(page, "brand-login-wrong-password");

// ── The owner portal ────────────────────────────────────────────────────────
console.log("\nportal/server:");
await page.goto(`${BASE}/portal/server/${guildId}?${at}`);
await page.waitForSelector('[data-testid="this-week"]');
await shot(page, "owner-overview");

const overview = await visible(page);
check(
  /if the week ended now/.test(overview),
  "the live figure says what it is — what you would be paid if the week ended now",
);
// Case-insensitive on purpose: `innerText` honours `text-transform`, so a
// label styled `uppercase` reads back as "EARNED, EVER". That is the right
// answer — it is what is on the screen — but a case-sensitive assertion
// against the source string would be testing the stylesheet.
check(/earned, ever/i.test(overview), "alongside lifetime earnings");

await page.goto(`${BASE}/portal/server/${guildId}/challenges?${at}`);
await page.waitForSelector('[data-testid="re-announce-all"]');
await shot(page, "owner-this-week-re-announce");
const weekPage = await visible(page);
check(/it does not create a new one/.test(weekPage), "re-announce says what it does, and does not");

await page.click('[data-testid="re-announce-all"]');
await page.waitForSelector('[data-testid="re-announce-queued"], [data-testid="re-announce-error"]');
const queued = await visible(page);
check(
  /nothing fans out inline/.test(queued) || /reinstall Cluster/.test(queued),
  "and it goes through the post queue, even for one server (A2)",
);
await shot(page, "owner-re-announced");

await page.goto(`${BASE}/portal/server/${guildId}/standings?${at}`);
await page.waitForSelector('[data-testid="position"]');
await shot(page, "owner-standings-and-the-lever");
const standings = await visible(page);
check(/rank/.test(standings), "the KPIs are shown as ranks, not as bare ratios");
check(
  /What would move it/.test(standings),
  "and there is a lever — a position with no lever is a scoreboard",
);
check(
  /Winning a challenge earns your server nothing directly/.test(standings),
  "K6 is said out loud: entrants earn, winning does not",
);

await page.goto(`${BASE}/portal/server/${guildId}/members?${at}`);
await page.waitForSelector('[data-testid="linked-members"]');
await shot(page, "owner-members");
const members = await visible(page);
check(
  /not to you, and not to our own staff/.test(members),
  "the members list says what an owner is NOT shown — house rule 7 reaches further than admin",
);
check(!/@/.test(members), "and there is not an email address on it");

await page.goto(`${BASE}/portal/server/${guildId}/wallet?${at}`);
await page.waitForSelector('[data-testid="wallet-available"]');
await shot(page, "owner-wallet");
const wallet = await visible(page);
check(/Nothing pays itself/.test(wallet), "a payout is released by a person, and the page says so");
check(
  /never hold your bank details/.test(wallet),
  "and that we hold no account details — house rule 5, where the owner can read it",
);

await page.goto(`${BASE}/portal/server/${guildId}/community?${at}`);
await page.waitForSelector('[data-testid="build-community"]');
await shot(page, "owner-community-builder");
const community = await visible(page);
check(/\$5\.00/.test(community) && /\$10\.00/.test(community), "both tiers, priced from the module");
check(
  /none of this money comes back to you/.test(community),
  "and the page is honest that owner money never reaches the server vault (M22)",
);

// ── Settings, and the refusal that matters most ─────────────────────────────
console.log("\nportal/server/settings:");
await page.goto(`${BASE}/portal/server/${guildId}/settings?${at}`);
await page.waitForSelector('[data-testid="payout-handle"]');
await shot(page, "owner-settings");
const settings = await visible(page);
check(/Never put an account number here/.test(settings), "the payout field says what not to type");
check(
  /not its name/.test(settings),
  "and the admin role field insists on the ID (S5)",
);

// Type an IBAN into the payout handle. This must be refused.
await page.fill('[data-testid="payout-handle"]', "GB29 NWBK 6016 1331 9268 19");
await page.selectOption('[data-testid="payout-preference"]', "bank");
await page.click('[data-testid="save-settings"]');
await page.waitForSelector('[data-testid="settings-error"]');
const ibanRefusal = (await page.textContent('[data-testid="settings-error"]')) ?? "";
check(/looks like an account number/.test(ibanRefusal), "an IBAN in the payout field is refused");
check(/We never store one/.test(ibanRefusal), "and the refusal says why, not just no");
await shot(page, "owner-settings-refuses-an-iban");

// A role NAME instead of an ID.
await page.fill('[data-testid="admin-role-id"]', "Moderators");
await page.click('[data-testid="save-settings"]');
await page.waitForSelector('[data-testid="settings-error"]:has-text("not a role ID")');
check(
  /Copy ID/.test((await page.textContent('[data-testid="settings-error"]')) ?? ""),
  "a role name is refused, with how to find the ID instead",
);
await shot(page, "owner-settings-refuses-a-role-name");

// ── S9 · the portal outlives the bot ────────────────────────────────────────
console.log("\nportal/server (bot removed):");
await page.goto(`${BASE}/portal/server/${removedGuildId}?${at}`);
await page.waitForSelector('[data-testid="bot-removed"]');
await shot(page, "owner-portal-with-the-bot-removed");
const removed = await visible(page);
check(/reinstall Cluster/.test(removed), "the banner says what to do, not what failed");
check(
  /Everything here still works/.test(removed),
  "and that the rest of the portal is unaffected — earnings and history are ours, not Discord's",
);
check(
  /Earned, ever/i.test(removed),
  "which is demonstrated rather than claimed: the figures are still on the page",
);

await page.goto(`${BASE}/portal/server/${removedGuildId}/challenges?${at}`);
await page.waitForSelector("h1");
const reAnnounceButton = page.locator('[data-testid="re-announce-all"]');
if (await reAnnounceButton.count()) {
  await reAnnounceButton.click();
  await page.waitForSelector('[data-testid="re-announce-error"]');
  const botError = (await page.textContent('[data-testid="re-announce-error"]')) ?? "";
  check(
    /reinstall Cluster/.test(botError),
    "re-announcing is the ONE thing that errors, and it errors with the fix",
  );
  await shot(page, "owner-re-announce-refused-bot-removed");
} else {
  check(true, "nothing to re-announce in the removed server this week");
}

// ── The brand portal ────────────────────────────────────────────────────────
console.log("\nportal/brand:");
await page.goto(`${BASE}/portal/brand/${brandId}?${at}`);
await page.waitForSelector('[data-testid="challenge-count"]');
await shot(page, "brand-overview");
const brandHome = await visible(page);
check(
  /never add reach or entrants together/.test(brandHome),
  "the overview refuses to offer a unique-audience figure, and says so",
);

console.log("\nportal/brand/builder:");
await page.goto(`${BASE}/portal/brand/${brandId}/builder?${at}`);
await page.waitForSelector('[data-testid="game-cards"]');
await shot(page, "builder-step-1-games");
const step1 = await visible(page);
check(/If we cannot score it, we do not sell it/.test(step1), "only sellable games are offered");
check(!/VALORANT/i.test(step1), "VALORANT is not on the list — it is not live");

const firstGame = await page.locator('[data-testid="game-cards"] input[type="checkbox"]').first();
await firstGame.check();
await page.click('[data-testid="pick-games"]');
await page.waitForSelector('[data-testid="per-game"]');
await shot(page, "builder-step-2-how-many-and-which-week");
const step2 = await visible(page);
check(/Weeks, not dates/.test(step2), "a brand picks a week, never a date (B5/L6)");
check(
  !(await page.locator('input[type="date"]').count()),
  "and there is no date input anywhere on the builder",
);

await page.fill('[data-testid="weeks"]', "3");
await page.click('[data-testid="price-it"]');
await page.waitForSelector('[data-testid="total"]');
await shot(page, "builder-step-3-priced-before-paying");
const step3 = await visible(page);
check(/Confirm & Pay/.test(step3), "the pay button is the LAST thing, after the price");
check(/announced from/.test(step3), "the announce date is shown before paying (B4)");
check(
  /an .?estimate/.test(step3) && /counted at announcement/.test(step3),
  "and reach is labelled an estimate, with what the reported figure will be instead",
);
const total = (await page.textContent('[data-testid="total"]')) ?? "";
check(/\$1,050\.00/.test(total), "three weeks of one game is 3 × $350 — priced from the module");

// B5/L7 — a week that has already started cannot be bought. The select only
// offers future weeks, so this posts the past week directly in the URL, which
// is what a script would do. A rule enforced only by the absence of a control
// is a rule until somebody writes one.
const lastWeek = new Date(seeded.weekStart);
lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
await page.goto(
  `${BASE}/portal/brand/${brandId}/builder?game=chesscom&weeks=1&challengesPerGame=1` +
    `&startingWeek=${encodeURIComponent(lastWeek.toISOString())}&priced=1&${at}`,
);
await page.waitForSelector('[data-testid="builder-error"]');
const weekRefusal = (await page.textContent('[data-testid="builder-error"]')) ?? "";
check(/already started/.test(weekRefusal), "a week that has started is refused");
check(
  /earliest you can buy/.test(weekRefusal),
  "and the refusal names the earliest week that would work",
);
check(
  !(await page.locator('[data-testid="confirm-and-pay"]').count()),
  "and there is no pay button on a refused quote",
);
await shot(page, "builder-refuses-a-week-that-has-started");

// Back to the good quote, and buy it.
await page.goto(`${BASE}/portal/brand/${brandId}/builder?${at}`);
await page.waitForSelector('[data-testid="game-cards"]');
await page.locator('[data-testid="game-cards"] input[type="checkbox"]').first().check();
await page.click('[data-testid="pick-games"]');
await page.waitForSelector('[data-testid="per-game"]');
await page.fill('[data-testid="weeks"]', "3");
await page.click('[data-testid="price-it"]');
await page.waitForSelector('[data-testid="confirm-and-pay"]');
await page.click('[data-testid="confirm-and-pay"]');
await page.waitForSelector('[data-testid="bought"]');
await shot(page, "builder-bought");

console.log("\nportal/brand/reports:");
await page.goto(`${BASE}/portal/brand/${brandId}/reports?${at}`);
await page.waitForSelector('[data-testid="report-table"]');
await shot(page, "brand-reports");
const reports = await visible(page);
check(
  /no total/.test(reports),
  "there is no total row, and the page explains that the sum would not be a number of people",
);
check(/fewer than 25/.test(reports), "and the floor is stated on the page");

const suppressed = await page.locator('[data-suppressed="true"]').count();
check(suppressed > 0, `a group under the floor is suppressed (${suppressed} cells read "fewer than")`);
const suppressedText = suppressed
  ? ((await page.locator('[data-suppressed="true"]').first().textContent()) ?? "")
  : "";
check(
  suppressed === 0 || /fewer than/.test(suppressedText),
  "and it reads 'fewer than', never 0 — zero would be a different and wrong claim",
);

await page.selectOption('[data-testid="filter-game"]', { index: 1 });
await page.click('[data-testid="apply-filter"]');
await page.waitForSelector('[data-testid="report-table"], .py-6');
await shot(page, "brand-reports-filtered-by-game");

console.log("\nportal/brand/trophies + billing:");
await page.goto(`${BASE}/portal/brand/${brandId}/trophies?${at}`);
await page.waitForSelector("h1");
await shot(page, "brand-trophies-and-who-holds-them");
const trophyPage = await visible(page);
check(/held in the prize vault until redeemed/.test(trophyPage), "a money trophy is a liability we hold");

await page.goto(`${BASE}/portal/brand/${brandId}/billing?${at}`);
await page.waitForSelector("h1");
await shot(page, "brand-billing-and-the-split");
const billing = await visible(page);
check(/not announced until its bill is paid/.test(billing), "C1 is stated where a brand reads it");
check(/Prize pool/.test(billing) && /Server pool/.test(billing), "and the split is published");

// ── The SaaS shell, the guides, and both message surfaces ───────────────────
//
// Sprint 10's own additions. 12 §10 — a brand gets **no site nav**: a side nav
// on their own product, with the docs inside it (H2) rather than a link out to
// the marketing site.
console.log("\nportal/brand/shell:");
await page.goto(`${BASE}/portal/brand/${brandId}?${at}`);
await page.waitForSelector('[data-nav="brand"]');
await shot(page, "brand-saas-shell-side-nav");
check(
  (await page.locator('aside nav[aria-label="Brand portal"]').count()) === 1,
  "the brand portal's nav is a side nav on their own dashboard",
);
check(
  (await page.locator('aside nav[aria-label="Guides"]').count()) === 1,
  "with the guides inside the portal, not a link to the marketing site (H2)",
);

await page.goto(`${BASE}/portal/brand/${brandId}/guides/reach?${at}`);
await page.waitForSelector("h1");
await shot(page, "brand-guide-reach-and-entrants");
const guide = await visible(page);
check(
  /[Dd]ouble counting is deliberate/.test(guide),
  "the guide says the double counting is deliberate, which is the thing a brand would otherwise read as inflation",
);
check(
  /never sum them|unique audience/i.test(guide),
  "and that we never sum them into a unique-audience figure",
);
check(/25/.test(guide), "and the audience floor, imported rather than retyped (C1)");

console.log("\nportal/messages:");
await page.goto(`${BASE}/portal/brand/${brandId}/messages?${at}`);
await page.waitForSelector("h1");
await shot(page, "brand-messages-empty");
check(/Nothing yet/.test(await visible(page)), "a brand with nothing to say sees an empty thread");

await page.fill('textarea[name="body"]', "Our week 2 report shows fewer entrants than week 1 — is that right?");
await page.click('button[type="submit"]');
await page.waitForSelector("h1");
await shot(page, "brand-messages-sent-and-waiting");
const sent = await visible(page);
check(/Waiting on Cluster/.test(sent), "once sent, it is waiting on us");
check(
  /keeps alerting/.test(sent),
  "and the page says the alert persists — H7, so nobody feels they have to chase it",
);

await page.goto(`${BASE}/portal/server/${guildId}/messages?${at}`);
await page.waitForSelector("h1");
await page.fill('textarea[name="body"]', "Why is my server not in this week's pool?");
await page.click('button[type="submit"]');
await page.waitForSelector("h1");
await shot(page, "owner-messages-sent-and-waiting");
check(/Waiting on Cluster/.test(await visible(page)), "and an owner's thread waits on us too");

// MS2 — and the two never meet. Photographed from the admin side, because
// that is the surface where merging them would actually happen.
console.log("\nadmin/inbox:");
await page.goto(`${BASE}/admin/inbox/servers`);
await page.waitForSelector("h1");
await shot(page, "admin-inbox-servers");
const serverInbox = await visible(page);
check(/waiting/i.test(serverInbox), "the server inbox shows what is waiting on a reply");
check(
  !/Acme|Nova/.test(serverInbox),
  "and not one brand appears in it — MS2, two surfaces, never merged",
);

await page.goto(`${BASE}/admin/inbox/brands`);
await page.waitForSelector("h1");
await shot(page, "admin-inbox-brands");
const brandInbox = await visible(page);
check(/Acme|Nova/.test(brandInbox), "the brand inbox holds the brand thread");
check(
  !/Nightfall|Dawnbreak|Ironclad/.test(brandInbox),
  "and no server appears in it either",
);

await browser.close();
console.log(
  failures === 0
    ? `\n\x1b[32mAll portal browser assertions passed.\x1b[0m`
    : `\n\x1b[31m${failures} portal browser assertion${failures === 1 ? "" : "s"} failed.\x1b[0m`,
);
process.exit(failures === 0 ? 0 : 1);
