/**
 * B40 in a real browser — the screen that stands between somebody and their
 * money.
 *
 * The db suite proves the numbers. This proves the only thing a browser can:
 * that a gamer holding value CANNOT delete by misclicking, that the figure they
 * are giving up is on the page in front of the button, and that a gamer with a
 * payout in flight gets a refusal rather than a dead button with no reason.
 *
 *   scripts/with-server.sh 3031 node tests/ui/account-deletion.mjs
 */
import { chromium } from "playwright-core";
// This suite has its own `login` (it signs in as several fixtures), so only
// the navigation helpers come from the shared file.
import { open, settle } from "./_nav.mjs";

const BASE = "http://localhost:3031";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const login = async (page, email) => {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "cluster-demo");
  await page.click('button:has-text("Log in with email")');
  await settle(page);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

try {
  // ---- a gamer with a balance and trophies ----
  const nova = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await login(nova, "nova@demo.gg");
  await open(nova, `${BASE}/settings/account`);

  // `textContent`, not `innerText`: the panel's labels are uppercased in CSS,
  // and `innerText` returns the TRANSFORMED text, so a case-sensitive check
  // against the source copy fails for a reason that has nothing to do with the
  // page being wrong (§0).
  const body = await nova.locator("body").textContent();
  ok("the danger zone says what is being given up", /You would be giving up/i.test(body), body.slice(0, 200));
  ok("…with a dollar figure, not just points", /\$\d[\d,]*\.\d\d/.test(body));
  ok("…and that it cannot be recovered", /cannot be recovered afterwards/i.test(body));
  ok("the alternative is offered, not buried", await nova.locator('a:has-text("Cash it out first")').count() > 0);
  ok("…and it goes to the wallet",
    (await nova.locator('a:has-text("Cash it out first")').getAttribute("href")) === "/wallet");

  // The whole point of the item: one click no longer deletes anything.
  const btn = nova.locator('button:has-text("Delete my account")');
  ok("the delete button exists", await btn.count() === 1);
  ok("…and is DISABLED before anything is typed", await btn.isDisabled());

  await nova.fill('input[name="confirm"]', "delete me");
  ok("…still disabled on the wrong word", await btn.isDisabled());

  await nova.fill('input[name="confirm"]', "DELETE");
  ok("…and only arms on the exact word", !(await btn.isDisabled()));

  // Deliberately NOT clicking it. Deleting the demo's main gamer would take the
  // rest of the demo data with it, and the db suite already covers the action.

  // ---- a gamer with money already moving ----
  const lyra = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await login(lyra, "lyra@demo.gg");
  await open(lyra, `${BASE}/settings/account`);
  const lbody = await lyra.locator("body").textContent();
  ok("a payout in flight is explained, not silently blocked",
    /already being paid out/i.test(lbody), lbody.slice(0, 300));
  ok("…saying why it cannot happen now",
    /record no longer exists/i.test(lbody));
  ok("…and that it lifts by itself", /unlocks straight away/i.test(lbody));

  const lbtn = lyra.locator('button:has-text("Delete my account")');
  await lyra.fill('input[name="confirm"]', "DELETE");
  ok("the button stays disabled even with the word typed", await lbtn.isDisabled());

  // ---- no page here asks anybody for a payment detail ----
  for (const bad of [/iban/i, /routing number/i, /sort code/i, /card number/i]) {
    ok(`nothing asks for ${bad.source}`, !bad.test(body) && !bad.test(lbody));
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
