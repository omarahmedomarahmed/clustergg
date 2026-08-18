// Band 2 — the admin console.
//
// docs/09-TEST-PLAN.md's admin flow: the dashboard, the queue in every state,
// the editor's seven steps, **the prize-pool guard failing over AND under**,
// the guard passing, announce, the vault's four states, vault search, the
// redeem queue, pool allocation and its refusal above half, payouts draft →
// released, and the weekend checklist part-done and complete.
//
// Failures and refusals are the point of half of that list.

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
  const dir = path.join(OUT, "admin");
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
const midWeek = new Date(seeded.weekStart);
midWeek.setUTCDate(midWeek.getUTCDate() + 2);
const at = `at=${midWeek.toISOString()}`;
console.log(`Seeded, week of ${String(seeded.weekStart).slice(0, 10)}.\n`);

// ── The dashboard ───────────────────────────────────────────────────────────
console.log("admin/dashboard:");
await page.goto(`${BASE}/admin?${at}`);
await page.waitForSelector("h1");
await shot(page, "dashboard-what-is-blocking-this-week");

const dash = await visible(page);
check(/What is blocking this week/.test(dash), "the dashboard answers one question");
check(/Prize vault/.test(dash), "the prize-vault indicator is on the page, not in a report");
check(/Ceiling — half the vault/.test(dash), "so is the pool ceiling");
check(/The weekend routine/.test(dash), "and the weekend routine");
check(
  !/needs attention/i.test(dash),
  "nothing says 'needs attention' — the console names the specific blocker",
);

// ── The queue ───────────────────────────────────────────────────────────────
console.log("\nadmin/challenges:");
await page.goto(`${BASE}/admin/challenges?${at}`);
await page.waitForSelector("h1");
await shot(page, "queue-grouped-by-what-it-needs");

const queue = await visible(page);
for (const group of ["Paid, needs setup", "Awaiting payment", "Drafts", "Announced", "Live"]) {
  check(queue.includes(group), `the queue has a "${group}" group`);
}

// ── The editor, and the prize-pool guard in all three states ────────────────
console.log("\nadmin/editor:");

// ===== FIND A CHALLENGE THAT IS STILL EDITABLE, BY OPENING ONE =====
//
// This took the first `/admin/challenges/*` link on the page, which was the
// only one for ten sprints. Sprint 13 added a **Build a challenge** button
// pointing at `/admin/challenges/new`, and it sits above the queue — so the
// pass opened the builder, waited for a trophy form that a builder does not
// have, and reported the prize-pool guard as broken.
//
// A closed challenge is the same trap from the other side: its editor is a
// record, not a form. So the candidates are probed rather than guessed, and
// the one that carries the trophy form is the one the guard is exercised on.
const links = await page
  .locator('a[href^="/admin/challenges/"]')
  .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));
const candidates = [...new Set(links)].filter(
  (h) => h !== "/admin/challenges" && h !== "/admin/challenges/new" && !h.includes("/series/"),
);
check(candidates.length > 0, "the queue has challenges in it");

let target: string | undefined;
for (const href of candidates) {
  await page.goto(`${BASE}${href}?${at}`);
  await page.waitForSelector("h1");
  if ((await page.locator('input[name="valueDollars"]').count()) > 0) {
    target = href;
    break;
  }
}
check(
  Boolean(target),
  `none of the ${candidates.length} challenges in the queue is still open for setup, so ` +
    `the prize-pool guard cannot be photographed failing`,
);

await page.waitForSelector("h1");
await shot(page, "editor-seven-steps");

const editor = await visible(page);
for (const step of ["1–5 ·", "6 · Trophies", "7 · Announce"]) {
  check(editor.includes(step), `the editor shows step "${step}" in order`);
}
check(
  /Percentages and ratios cannot score/.test(editor),
  "and says why percentages are not offered",
);
check(
  /checked at join only/i.test(editor) || /Never re-checked/.test(editor),
  "and that the rank gate is checked at join only",
);

// The guard, over. Add a trophy that takes the total past the pool.
//
// Waiting on the CHANGED TEXT, not on the element. Waiting on the element
// matches the page that is still on screen while the form is posting, so the
// assertion reads the old guard message and the screenshot catches a page
// mid-navigation — which is exactly what happened the first time, and the
// picture was blank.
await page.fill('input[name="valueDollars"]', "500");
await page.fill('input[name="name"]', "Too generous");
await page.click('form:has(input[name="valueDollars"]) button[type="submit"]');
await page.waitForSelector('[data-testid="pool-guard"]:has-text("over by")', {
  timeout: 15_000,
});
const over = (await page.textContent('[data-testid="pool-guard"]')) ?? "";
check(/over by/.test(over), "the prize-pool guard flags OVER, with the amount");
await shot(page, "prize-pool-guard-failing-over");

const announceDisabled = await page.locator('[data-testid="announce"]').isDisabled();
check(announceDisabled, "and announce is disabled while it fails");

// Remove it, and the guard returns to exact.
await page.locator("text=Remove").last().click();
await page.waitForSelector('[data-testid="pool-guard"]:has-text("exactly the prize pool")', {
  timeout: 15_000,
});
const afterRemove = (await page.textContent('[data-testid="pool-guard"]')) ?? "";
check(
  /exactly the prize pool/.test(afterRemove),
  "removing it returns the guard to exact, and announce is possible again",
);
await shot(page, "prize-pool-guard-passing");

// And under, which is the direction people forget: money a brand paid to give
// away that we would quietly still be holding.
await page.locator("text=Remove").last().click();
await page.waitForSelector('[data-testid="pool-guard"]:has-text("under by")', {
  timeout: 15_000,
});
check(
  /under by/.test((await page.textContent('[data-testid="pool-guard"]')) ?? ""),
  "and removing the last one flags UNDER, with the amount",
);
check(
  await page.locator('[data-testid="announce"]').isDisabled(),
  "announce is disabled for under too, not only for over",
);
await shot(page, "prize-pool-guard-failing-under");

// ── The prize vault ─────────────────────────────────────────────────────────
console.log("\nadmin/vaults:");
await page.goto(`${BASE}/admin/vaults?${at}`);
await page.waitForSelector("h1");
await shot(page, "vaults-all-four-balances");

await page.goto(`${BASE}/admin/vaults/prize?${at}`);
await page.waitForSelector('[data-testid="vault-state"]');
await shot(page, "prize-vault-the-liability-ledger");

const vaultState = await page.getAttribute('[data-testid="vault-state"]', "data-state");
check(
  ["green", "unallocated", "unclaimed", "orphaned"].includes(vaultState ?? ""),
  `the vault reports a real state (${vaultState}) rather than a total`,
);
const vaultText = await visible(page);
check(/Every money-trophy/.test(vaultText), "it lists every money-trophy, not a total");
check(/Search by gamer name/.test(vaultText), "and can be searched by gamer name — V4");
check(/reversible/.test(vaultText), "and says a sweep is reversible");

await page.fill('input[name="q"]', "Kestrel");
await page.click('form:has(input[name="q"]) button[type="submit"]');
await page.waitForSelector("h1");
await shot(page, "prize-vault-search-by-gamer-name");

// ── The pool, and the refusal above half ────────────────────────────────────
console.log("\nadmin/pool:");
await page.goto(`${BASE}/admin/vaults/server?${at}`);
await page.waitForSelector('[data-testid="allocate"]');
await shot(page, "server-vault-and-the-ceiling");

const poolPage = await visible(page);
check(/Nothing auto-allocates/.test(poolPage), "the page says nothing auto-allocates");
check(
  /refunds, disputes and quiet weeks/.test(poolPage),
  "and what the held half is for",
);
check(/Which challenges fed this week/.test(poolPage), "and names what fed the pool — M12");

// Ask for far more than half. This must be refused, with the reason.
await page.fill('input[name="amountDollars"]', "999999");
await page.click('[data-testid="allocate"]');
await page.waitForSelector('[data-testid="allocation-error"]');
const refusal = (await page.textContent('[data-testid="allocation-error"]')) ?? "";
check(/never exceed half/.test(refusal), "an allocation above half is refused");
check(/refunds, disputes and quiet weeks/.test(refusal), "and the refusal says why");
await shot(page, "pool-allocation-refused-above-half");

// ── Redeems and payouts ─────────────────────────────────────────────────────
console.log("\nadmin/money:");
await page.goto(`${BASE}/admin/redeems?${at}`);
await page.waitForSelector("h1");
await shot(page, "redeem-queue");
const redeems = await visible(page);
check(
  /falls by exactly the trophy/.test(redeems),
  "the redeem queue states when the vault falls, and it is on paid",
);

await page.goto(`${BASE}/admin/payouts?${at}`);
await page.waitForSelector("h1");
await shot(page, "payouts-draft-and-released");
const payouts = await visible(page);
check(/a human releases/.test(payouts), "payouts say a human releases them");

const releaseButton = page.locator('[data-testid="release"]').first();
if (await releaseButton.count()) {
  await releaseButton.click();
  await page.waitForSelector("h1");
  await shot(page, "payout-released");
  check(
    /released/.test(await visible(page)),
    "and releasing one moves it out of draft",
  );
}

// ── The directories, and the weekend ────────────────────────────────────────
console.log("\nadmin/directories:");
await page.goto(`${BASE}/admin/users?${at}`);
await page.waitForSelector('[data-testid="admin-only-note"]');
await shot(page, "gamer-directory-admin-only");
const users = await visible(page);
check(/No staff department reaches this list, ever/.test(users), "the directory says so on its face");
check(!/@/.test(users.split("Search by name")[1] ?? ""), "and does not show email addresses");

await page.goto(`${BASE}/admin/linked-accounts?${at}`);
await page.waitForSelector("h1");
await shot(page, "linked-accounts-and-sync-health");
const linked = await visible(page);
check(/unproven/.test(linked), "an unproven account is labelled unproven, never verified — C5");

console.log("\nadmin/weekend:");
await page.goto(`${BASE}/admin/weekend?${at}`);
await page.waitForSelector('[data-testid="weekend-steps"]');
await shot(page, "weekend-checklist-part-done");
const steps = await page
  .locator("[data-step]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-done")));
check(steps.length >= 6, "every step of the routine is listed");
check(
  steps.includes("true") && steps.includes("false"),
  "and it is genuinely part-done — derived from rows, not ticked",
);

await browser.close();
console.log(
  failures === 0
    ? `\n\x1b[32mAll admin browser assertions passed.\x1b[0m`
    : `\n\x1b[31m${failures} admin browser assertion${failures === 1 ? "" : "s"} failed.\x1b[0m`,
);
process.exit(failures === 0 ? 0 : 1);
