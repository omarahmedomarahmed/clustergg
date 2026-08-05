/**
 * B49 — the confirm step that did not exist, and the person it confirms.
 *
 * Before this, "Spend 50,000" was a submit button: one click moved the points
 * and the first thing a gamer knew about it was a different balance. In the
 * gift case a typed profile name went straight to the server, so a near-miss on
 * somebody's handle put a cash-redeemable trophy on a stranger's profile — and
 * a gift has no refund path, correctly, because the trophy is already theirs.
 *
 * Everything here is browser-only by nature: a modal, a debounced type-ahead,
 * and a button that must stay disabled until a PERSON is chosen.
 *
 *   scripts/with-server.sh 3031 node tests/ui/checkout.mjs
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:3031";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

// The 90% page zoom breaks Playwright's synthesized click coordinates — the hit
// point lands on the sticky nav. Centre it, then fall back to a dispatched
// event (§0, trap 1).
const tap = async (loc) => {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await loc.click({ timeout: 4000 }).catch(async () => { await loc.evaluate((el) => el.click()); });
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "nova@demo.gg");
  await page.fill('input[name="password"]', "cluster-demo");
  await page.click('button:has-text("Log in with email")');
  await page.waitForLoadState("networkidle");
  await page.goto(`${BASE}/marketplace`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Accept all")').first().click().catch(() => {});
  await page.waitForTimeout(500);

  console.log("\n== nothing is spent by one click ==");
  const buyable = page.locator('button:has-text("Get it")').first();
  ok("there is something affordable on the shelf", await buyable.count() > 0);
  await tap(buyable);
  await page.waitForTimeout(400);
  const modal = page.locator('[data-checkout]');
  ok("the click opens a checkout instead of buying", await modal.count() === 1);

  // `textContent`, not `innerText`: the labels are uppercased in CSS and
  // `innerText` returns the TRANSFORMED text (§0, trap 2).
  const inModal = await modal.textContent();
  console.log("\n== it states the price and BOTH balances ==");
  ok("balance now", /Balance now/i.test(inModal), inModal.slice(0, 160));
  ok("what it costs", /This costs/i.test(inModal));
  ok("what is left after", /Left after/i.test(inModal));
  ok("…and the two trust claims are here, where the money moves",
    /never lowers your level/i.test(inModal) && /never see your bank details/i.test(inModal));

  console.log("\n== gifting cannot be confirmed without a person ==");
  await tap(modal.locator('button:has-text("Gift it")'));
  await page.waitForTimeout(250);
  const confirm = modal.locator("[data-confirm]");
  ok("the confirm button is disabled with nobody chosen", await confirm.isDisabled());
  ok("…and it says what is missing",
    /Pick who it/i.test(await confirm.textContent()), await confirm.textContent());

  // A typed string is not a person: typing a name and stopping must not arm it.
  await page.fill("#gift-search", "ly");
  await page.waitForTimeout(900);   // debounce + fetch
  ok("typing alone does not arm the button", await confirm.isDisabled());

  console.log("\n== the type-ahead finds real gamers ==");
  const candidates = modal.locator("[data-candidate]");
  const n = await candidates.count();
  ok("a two-letter query returns candidates", n > 0, `${n} results`);
  const firstText = n ? await candidates.first().textContent() : "";
  ok("…each showing a name and an @profile", /@/.test(firstText), firstText);
  ok("…and never an email address", !/@[a-z0-9.-]+\.[a-z]{2,}/i.test(firstText), firstText);
  ok("you cannot pick yourself", !/@nova\b/.test(await modal.textContent()));

  console.log("\n== picking one confirms the PERSON ==");
  await tap(candidates.first());
  await page.waitForTimeout(300);
  const card = modal.locator("[data-recipient]");
  ok("a recipient card appears", await card.count() === 1);
  ok("…with their avatar", await card.locator("img").count() > 0);
  const cardText = await card.textContent();
  ok("…their display name and @profile", /@/.test(cardText), cardText);
  ok("…and that it cannot be undone", /no undo/i.test(cardText), cardText);
  ok("only now is the confirm armed", !(await confirm.isDisabled()));
  ok("…and it names who it is going to",
    /Send it to /i.test(await confirm.textContent()), await confirm.textContent());

  console.log("\n== you can change your mind about the person ==");
  await tap(card.locator('button:has-text("Change")'));
  await page.waitForTimeout(250);
  ok("the recipient clears", await modal.locator("[data-recipient]").count() === 0);
  ok("…and the button locks again", await confirm.isDisabled());

  console.log("\n== escape leaves without spending ==");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok("the checkout closes", await page.locator("[data-checkout]").count() === 0);

  console.log("\n== the search endpoint is not an open member directory ==");
  const signedOut = await browser.newContext();
  const anon = await signedOut.newPage();
  const res = await anon.goto(`${BASE}/api/gamers/search?q=no`);
  ok("signed out, it refuses", res.status() === 401, String(res.status()));
  ok("…and returns nobody", /"results":\s*\[\s*\]/.test(await res.text()));
  const short = await page.evaluate(async (b) =>
    (await (await fetch(`${b}/api/gamers/search?q=n`)).json()).results.length, BASE);
  ok("a one-character query returns nothing", short === 0, String(short));
  const shape = await page.evaluate(async (b) =>
    (await (await fetch(`${b}/api/gamers/search?q=ly`)).json()).results, BASE);
  ok("results carry no email field", shape.every((r) => !("email" in r)), JSON.stringify(shape[0] ?? {}));
  ok("…and no id", shape.every((r) => !("id" in r) && !("userId" in r)));
  await signedOut.close();
  console.log("\n== B19: the shelf prices the same trophy the same way everywhere ==");
  // Two surfaces read `marketplaceCatalog`, and the two numbers on every tile —
  // CP to buy, dollars to redeem — are two views of ONE number at the platform
  // rate. If they can disagree between the marketplace page and the quests-page
  // section, one of them is lying to somebody about what their points are worth.
  const priceMap = async (url) => {
    await page.goto(url, { waitUntil: "networkidle" });
    return page.evaluate(() => {
      const out = {};
      for (const card of document.querySelectorAll("[data-trophy]")) {
        const t = card.textContent || "";
        const usd = t.match(/\$([\d,]+(?:\.\d+)?)/)?.[1] ?? null;
        // The CP figure is rendered by <Cp>, which can span a line break in raw
        // text — normalise the whitespace before matching (§0, trap 2).
        const cp = t.replace(/\s+/g, " ").match(/([\d,]{3,})\s*(?:CP)?/)?.[1] ?? null;
        out[card.getAttribute("data-trophy")] = { usd, cp };
      }
      return out;
    });
  };
  const onMarket = await priceMap(`${BASE}/marketplace`);
  const onQuest = await priceMap(`${BASE}/quests/orbit`);
  const ids = Object.keys(onMarket);
  ok("the marketplace lists trophies", ids.length > 0, `${ids.length}`);
  ok("every one shows a dollar value", ids.every((id) => onMarket[id].usd !== null),
    JSON.stringify(Object.entries(onMarket).slice(0, 2)));
  ok("…and a CP price", ids.every((id) => onMarket[id].cp !== null));

  const shared = ids.filter((id) => id in onQuest);
  ok("the quests page carries the same shelf", shared.length > 0, `${shared.length} in common`);
  const disagree = shared.filter((id) =>
    onMarket[id].usd !== onQuest[id].usd || onMarket[id].cp !== onQuest[id].cp);
  ok("…priced identically on both", disagree.length === 0,
    JSON.stringify(disagree.slice(0, 2).map((id) => [id, onMarket[id], onQuest[id]])));

  console.log("\n== affordability is computed against the real balance ==");
  await page.goto(`${BASE}/marketplace`, { waitUntil: "networkidle" });
  const reach = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-trophy]")];
    return cards.map((c) => {
      const t = (c.textContent || "").replace(/\s+/g, " ");
      return { toGo: /to go/.test(t), getIt: /Get it/.test(t) };
    });
  });
  ok("every tile says either what it costs to reach or that it can be bought",
    reach.every((r) => r.toGo || r.getIt), JSON.stringify(reach.slice(0, 3)));
  ok("…and not both at once", reach.every((r) => !(r.toGo && r.getIt)));
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
