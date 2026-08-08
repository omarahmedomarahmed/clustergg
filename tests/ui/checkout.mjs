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

/**
 * Open a shelf page and wait for the shelf, rather than for the network.
 *
 * `waitUntil: "networkidle"` is the wrong tool on any page in this app: link
 * prefetching and the analytics scripts keep the connection busy indefinitely,
 * so it waits the full timeout and then throws on a page that painted in under
 * a second. Waiting for a `[data-trophy]` tile says the same thing and says it
 * about the DOM the assertions actually read.
 */
const shelf = async (url = `${BASE}/marketplace`) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-trophy]", { timeout: 20000 }).catch(() => {});
};

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "nova@demo.gg");
  await page.fill('input[name="password"]', "cluster-demo");
  await page.click('button:has-text("Log in with email")');
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 15000 });
  // NOT `networkidle`. Next prefetches every link in the viewport and the two
  // analytics scripts load on their own schedule, so the network on a real page
  // never goes quiet for 500ms — this timed out at 30s and took the whole
  // browser band down with it, on a page that had already rendered. Wait for
  // the thing the test is about instead: the shelf.
  await shelf();
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

  // ===== The gift half is GONE (B72.3) =====
  //
  // This block used to drive it: tap "Gift it", type into #gift-search, pick a
  // candidate from the type-ahead, assert the confirm button only arms once a
  // real person is chosen. All of that was deleted with the feature, and the
  // /api/gamers/search endpoint went with it — with nothing to gift, a
  // signed-in gamer-name lookup is a member directory with no purpose, and the
  // standing rule is that the gamer directory is admin-only.
  //
  // Inverted rather than deleted, because the assertions that matter now are
  // the negative ones: the surface is gone AND the endpoint behind it is gone.
  // A stale positive test would have failed loudly; a deleted one would have
  // let the search endpoint come back unnoticed.
  //
  // (These never ran until now. The suite timed out one line into it, on a
  // `networkidle` that a page with link prefetching can never reach, and took
  // the whole browser band down before reaching this point.)
  console.log("\n== the gift half is gone, and so is the directory behind it ==");
  {
    const text = await modal.textContent();
    ok("no gift button in the checkout", !/Gift it/i.test(text), text.slice(0, 200));
    ok("no recipient search box", await modal.locator("#gift-search").count() === 0);
    ok("nothing to pick from", await modal.locator("[data-candidate]").count() === 0);
    ok("and one confirm, which is the purchase",
      await modal.locator("[data-confirm]").count() <= 1);

    // The endpoint, not just the button. A UI that stopped calling it is not
    // the same as an endpoint that stopped existing.
    const res = await page.evaluate(async (b) => {
      const r = await fetch(`${b}/api/gamers/search?q=ly`);
      return r.status;
    }, BASE);
    ok("the gamer-name lookup is gone entirely", res === 404 || res === 405 || res >= 400, `HTTP ${res}`);
  }

  console.log("\n== escape leaves without spending ==");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok("the checkout closes", await page.locator("[data-checkout]").count() === 0);

  // This block used to check that /api/gamers/search refused a signed-out
  // caller, refused a one-character query, and leaked neither an email nor an
  // id. Every one of those was a guard on an endpoint that no longer exists —
  // B72.3 deleted it with the gift feature. Inverted to the stronger claim:
  // there is no signed-in gamer-name lookup at all, for anybody.
  //
  // Worth keeping as an assertion rather than dropping, because "the directory
  // is admin-only" is a standing rule and this is the one endpoint that ever
  // bent it.
  console.log("\n== there is no member directory endpoint, signed in or out ==");
  {
    const signedOut = await browser.newContext();
    const anon = await signedOut.newPage();
    const anonRes = await anon.goto(`${BASE}/api/gamers/search?q=no`);
    ok("signed out, there is nothing there", anonRes.status() >= 400, String(anonRes.status()));
    ok("…and it is not serving a list", !/"results"/.test(await anonRes.text()));
    await signedOut.close();

    const signedIn = await page.evaluate(async (b) => {
      const r = await fetch(`${b}/api/gamers/search?q=ly`);
      return { status: r.status, body: (await r.text()).slice(0, 120) };
    }, BASE);
    ok("signed in, the same", signedIn.status >= 400, `HTTP ${signedIn.status}`);
    ok("…and no results array comes back", !/"results"/.test(signedIn.body), signedIn.body);
  }

  console.log("\n== B19: the shelf prices the same trophy the same way everywhere ==");
  // Two surfaces read `marketplaceCatalog`, and the two numbers on every tile —
  // CP to buy, dollars to redeem — are two views of ONE number at the platform
  // rate. If they can disagree between the marketplace page and the quests-page
  // section, one of them is lying to somebody about what their points are worth.
  const priceMap = async (url) => {
    await shelf(url);
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
  await shelf();
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
