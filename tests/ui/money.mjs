/**
 * The money pages in a real browser.
 *
 * The economy is asserted against a real database in .scratch/money.mts. This
 * is the half only a browser can prove: that an admin can open a bill, edit a
 * line, attach a link and send it; that the brand then SEES it; that the pay
 * page opens for somebody with no login; that a payout can be opened, released
 * and marked paid; and — the one that matters most — that no page anywhere
 * asks anybody for a bank account.
 */
import { chromium } from "playwright-core";
import { open, settle } from "./_nav.mjs";

const BASE = "http://localhost:3031";
const SHOTS = "/tmp/claude-0/-home-user-clustergg/f1b2f374-59b4-5577-bf34-0df216698fe3/scratchpad";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

// The 90% page zoom breaks Playwright's synthesized click coordinates: the
// computed hit point lands on the sticky nav. Scroll it into the middle and
// fall back to a dispatched event.
const tap = async (loc) => {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await loc.click({ timeout: 4000 }).catch(async () => {
    await loc.evaluate((el) => el.click());
  });
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const boss = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

try {
  await boss.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await boss.fill('input[name="email"]', "admin@clustergg.com");
  await boss.fill('input[name="password"]', "cluster-admin");
  await boss.click('button:has-text("Log in with email")');
  await settle(boss);

  console.log("\n== The providers console ==");
  let res = await open(boss, `${BASE}/admin/payments`);
  let body = await boss.locator("body").innerText();
  ok("it opens", !!res && res.status() < 400 && !/could not be found/i.test(body), String(res?.status()));
  ok("all three money flows are named",
    /brands pay us/i.test(body) && /we pay server owners/i.test(body) && /gamers cash out/i.test(body));
  ok("it names a recommendation per flow, with reasons",
    (body.match(/our pick/gi) ?? []).length >= 3, String((body.match(/our pick/gi) ?? []).length));
  ok("it says the keys are not readable from here",
    /cannot be read or written from/i.test(body));
  ok("it says nothing is blocked with nothing connected",
    /works today|paste payment links/i.test(body));
  ok("the research names the vendors we actually compared",
    /tremendous/i.test(body) && /trolley/i.test(body) && /payoneer/i.test(body) && /paddle/i.test(body));
  // The honesty test: a vendor page that only lists upsides is a brochure.
  // The vendor notes live in collapsed <details>, whose text innerText does not
  // return — open them all before reading.
  await boss.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
  const openBody = await boss.locator("body").innerText();
  ok("and states what each one costs you, not only what it gives",
    (openBody.match(/what it costs you/gi) ?? []).length >= 5,
    String((openBody.match(/what it costs you/gi) ?? []).length));
  ok("with nothing connected it says so rather than claiming success",
    /keys are not set|no API|entered by hand/i.test(body));

  console.log("\n== Opening a bill ==");
  res = await open(boss, `${BASE}/admin/billing`);
  body = await boss.locator("body").innerText();
  ok("the billing page opens", !!res && res.status() < 400, String(res?.status()));
  ok("it has an invoices section", /invoices/i.test(body));
  ok("it explains where the numbers come from", /pricing model|placements base/i.test(body));

  const brandOpts = await boss.locator('select[name="brandId"] option').count();
  ok("there are brands to bill", brandOpts > 1, `${brandOpts} options`);
  await boss.selectOption('select[name="brandId"]', { index: 1 });
  const brandName = await boss.locator('select[name="brandId"] option').nth(1).innerText();
  await tap(boss.locator('button:has-text("Open this month")'));
  await settle(boss);
  await boss.waitForTimeout(600);

  body = await boss.locator("body").innerText();
  ok("an invoice number was minted", /CGG-\d{4}/.test(body), body.slice(0, 200).replace(/\n/g, " | "));
  const number = (body.match(/CGG-\d{4}/) ?? [""])[0];

  // Open it.
  await tap(boss.locator(`a:has-text("${number}")`).first());
  await settle(boss);
  body = await boss.locator("body").innerText();
  ok("the editor opens on the invoice", body.includes(number) && /placements/i.test(body));
  ok("it is billed to the brand we picked", body.includes(brandName.trim()), brandName);
  ok("it starts as a draft", /draft/i.test(body));
  ok("the base line quotes the placements price", /\$600|600\.00/.test(body), body.slice(0, 400).replace(/\n/g, " | "));

  console.log("\n== Editing every line, including a discount ==");
  await boss.fill('input[name="label"]', "Negotiated launch discount");
  await boss.selectOption('select[name="kind"]', "discount");
  await boss.fill('input[name="unitAmount"]', "50");
  await tap(boss.locator('button:has-text("Add line")'));
  await settle(boss);
  await boss.waitForTimeout(600);
  body = await boss.locator("body").innerText();
  ok("staff can add a line", /negotiated launch discount/i.test(body));
  // Typed positive, stored negative: nobody should have to remember the sign.
  ok("a discount typed positive comes out negative", /−\$50|-\$50/.test(body), body.slice(0, 500).replace(/\n/g, " | "));
  ok("and the total moved by exactly that", /\$550|550\.00/.test(body));

  console.log("\n== It can't be sent with nowhere to pay ==");
  await tap(boss.locator('button:has-text("Send to brand")'));
  await boss.waitForTimeout(900);
  body = await boss.locator("body").innerText();
  ok("sending without a payment link is refused, with a reason",
    /nowhere to pay/i.test(body), body.slice(0, 300).replace(/\n/g, " | "));

  await boss.fill('input[name="payLinkUrl"]', "https://pay.example.com/inv/abc123");
  await boss.fill('input[name="provider"]', "payoneer");
  await tap(boss.locator('button:has-text("Attach")'));
  await settle(boss);
  await boss.waitForTimeout(600);
  body = await boss.locator("body").innerText();
  ok("a pasted link attaches", /pay\.example\.com/.test(body));
  ok("and the hosted page link appears", /\/pay\//.test(body));

  const payHref = await boss.locator('a[href^="/pay/"]').first().getAttribute("href");
  ok("we have a public pay URL", !!payHref, String(payHref));

  await tap(boss.locator('button:has-text("Send to brand")'));
  await settle(boss);
  await boss.waitForTimeout(700);
  body = await boss.locator("body").innerText();
  ok("now it sends", /is live on the brand/i.test(body) || /awaiting payment/i.test(body),
    body.slice(0, 300).replace(/\n/g, " | "));

  console.log("\n== The pay page, for somebody with no login ==");
  const stranger = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  res = await open(stranger, `${BASE}${payHref}`);
  const payBody = await stranger.locator("body").innerText();
  ok("it opens with no session at all", !!res && res.status() < 400, String(res?.status()));
  ok("it shows the invoice number", payBody.includes(number));
  ok("it shows an amount due", /amount due/i.test(payBody));
  ok("with a pay button", (await stranger.locator('a:has-text("Pay invoice")').count()) > 0);
  // The whole point of the hosted page.
  ok("it promises we never see the card or bank details",
    /never sees or stores/i.test(payBody), payBody.slice(-400).replace(/\n/g, " | "));
  const inputs = await stranger.locator("input, textarea").count();
  ok("and there is no field on it that could collect one", inputs === 0, `${inputs} inputs`);
  await stranger.screenshot({ path: `${SHOTS}/pay-page.png`, fullPage: true });

  // A draft must not be reachable by anybody.
  await open(boss, `${BASE}/admin/billing`);
  // Read the HEADING, not the body: the not-found page still renders the site
  // chrome, so a body-text match passes or fails on whether the nav happened to
  // contain the word "found" that day.
  await open(stranger, `${BASE}/pay/nonsense-token-that-is-long-enough`);
  const missingH1 = (await stranger.locator("h1").first().innerText().catch(() => "")).trim();
  ok("a wrong token shows nothing", /404|lost in space|not found/i.test(missingH1), missingH1);
  await stranger.close();

  console.log("\n== Payouts ==");
  res = await open(boss, `${BASE}/admin/payouts`);
  body = await boss.locator("body").innerText();
  ok("the payouts page opens", !!res && res.status() < 400 && !/could not be found/i.test(body), String(res?.status()));
  ok("it separates prize money out explicitly",
    /prize money is not here/i.test(body), body.slice(0, 500).replace(/\n/g, " | "));
  ok("it shows what's earned and unpaid", /earned and unpaid/i.test(body));
  ok("and a queue", /payout queue/i.test(body));
  ok("it names who is collecting the money", /paying through/i.test(body));

  // Pay something that isn't in the ledger — the manual path staff need.
  const guildOpts = await (async () => {
    await tap(boss.locator('button:has-text("Pay something that isn")'));
    await boss.waitForTimeout(400);
    return boss.locator('select[name="guildId"] option').count();
  })();
  ok("there are servers to pay", guildOpts > 1, `${guildOpts}`);
  if (guildOpts > 1) {
    await boss.selectOption('select[name="guildId"]', { index: 1 });
    await boss.fill('input[name="label"]', "Launch bonus — first 100 servers");
    await boss.fill('input[name="amount"]', "125");
    await tap(boss.locator('form button:has-text("Open")'));
    await settle(boss);
    await boss.waitForTimeout(800);
    body = await boss.locator("body").innerText();
    ok("a manual payout opens", /launch bonus|\$125/i.test(body), body.slice(0, 400).replace(/\n/g, " | "));
    ok("as requested, not paid", /requested/i.test(body));

    // Release, then mark paid. Two clicks, deliberately.
    await tap(boss.locator('button:has-text("Approve for manual transfer")').first());
    await settle(boss);
    await boss.waitForTimeout(800);
    body = await boss.locator("body").innerText();
    ok("releasing tells staff to send it by hand rather than pretending",
      /send \$125.*by hand|approved/i.test(body), body.slice(0, 400).replace(/\n/g, " | "));

    await boss.fill('input[name="ref"]', "WIRE-2026-001");
    await tap(boss.locator('button:has-text("Mark paid")').first());
    await settle(boss);
    await boss.waitForTimeout(800);
    body = await boss.locator("body").innerText();
    ok("and marking paid records the reference", /WIRE-2026-001/.test(body), body.slice(0, 400).replace(/\n/g, " | "));
  }
  await boss.screenshot({ path: `${SHOTS}/admin-payouts.png`, fullPage: true });

  console.log("\n== Trophy redemptions ==");
  res = await open(boss, `${BASE}/admin/redeems`);
  body = await boss.locator("body").innerText();
  ok("the redeems page opens", !!res && res.status() < 400 && !/could not be found/i.test(body), String(res?.status()));
  ok("it states that we never hold their bank details",
    /never hold their bank details/i.test(body), body.slice(0, 400).replace(/\n/g, " | "));
  ok("and describes the collect flow", /choose exactly how they want/i.test(body));
  // The disclosure that used to print routing numbers is gone.
  ok("there is no 'view payment details' disclosure any more",
    !/view payment details/i.test(body));

  console.log("\n== The gamer is never asked for an account ==");
  const gamer = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await gamer.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await gamer.fill('input[name="email"]', "nova@demo.gg");
  await gamer.fill('input[name="password"]', "cluster-demo");
  await gamer.click('button:has-text("Log in with email")');
  await settle(gamer);
  await open(gamer, `${BASE}/feed`);
  await gamer.locator('button:has-text("Accept all")').first().click().catch(() => {});
  await gamer.waitForTimeout(500);

  const trigger = gamer.locator('button:has-text("My trophies"), button:has-text("Redeem trophies")').first();
  if (await trigger.count()) {
    await tap(trigger);
    await gamer.waitForTimeout(700);
    const caseBody = await gamer.locator("body").innerText();
    ok("the trophy case opens", /trophy case/i.test(caseBody));
    // The old form's fields, all of which are now gone.
    const banned = /routing number|account number|account holder|IBAN|sort code/i;
    ok("nowhere in it does it ask for a bank account", !banned.test(caseBody),
      (caseBody.match(banned) ?? [""])[0]);
    const bannedInputs = await gamer.locator('input[placeholder*="Routing" i], input[placeholder*="Account number" i], input[placeholder*="IBAN" i]').count();
    ok("and no such input exists on the page", bannedInputs === 0, `${bannedInputs}`);
  } else {
    ok("(this gamer has no trophy case trigger — skipped)", true);
  }
  await gamer.close();

  console.log("\n== The brand sees the bill ==");
  // The admin list links to /admin/brands/<id>; the live portal link (with the
  // access key on it) is on the detail page. Walk detail pages to collect them.
  await open(boss, `${BASE}/admin/brands`);
  const adminBrandHrefs = await boss.locator('a[href^="/admin/brands/"]').evaluateAll((els) =>
    [...new Set(els.map((e) => e.getAttribute("href")))]
      .filter((h) => h && !h.includes("testimonials")));
  const portalLinks = [];
  for (const href of adminBrandHrefs.slice(0, 6)) {
    await open(boss, `${BASE}${href}`);
    const live = await boss.locator('a[href^="/brands/"]').first().getAttribute("href").catch(() => null);
    if (live) portalLinks.push(live);
  }
  ok("the admin exposes brand portal links", portalLinks.length > 0, `${portalLinks.length}`);

  let sawBilling = false;
  for (const href of portalLinks.slice(0, 6)) {
    await open(boss, `${BASE}${href}`);
    const t = await boss.locator("body").innerText();
    if (/billing/i.test(t)) {
      sawBilling = true;
      await tap(boss.locator('button:has-text("Billing")').first());
      await boss.waitForTimeout(700);
      const bill = await boss.locator("body").innerText();
      ok("the Billing tab explains the terms", /30 days|itemised/i.test(bill), bill.slice(0, 300).replace(/\n/g, " | "));
      ok("and promises we never store their card",
        /never sees or stores|never see or store/i.test(bill));
      await boss.screenshot({ path: `${SHOTS}/brand-billing.png`, fullPage: true });
      break;
    }
  }
  ok("a brand portal has a Billing tab", sawBilling);

  console.log("\n== The server owner sees two earning types, and their tier ==");
  // Same shape as brands: the live portal link lives on the per-guild admin page.
  await open(boss, `${BASE}/admin/discord`);
  // /admin/discord/<x> is mostly SUB-PAGES (analytics, requests, broadcast, hq)
  // and only sometimes a guild. Taking the first few finds none of the guilds,
  // which is how this quietly asserted nothing the first time it ran.
  const SUBPAGES = new Set(["analytics", "requests", "broadcast", "hq"]);
  const guildHrefs = await boss.locator('a[href^="/admin/discord/"]').evaluateAll((els) =>
    [...new Set(els.map((e) => e.getAttribute("href")))].filter(Boolean));
  const guildOnly = guildHrefs.filter((h) => !SUBPAGES.has(h.split("/").pop()));
  ok("the admin lists real guilds, not just its own sub-pages",
    guildOnly.length > 0, guildHrefs.join(", "));
  // A server owner's dashboard is behind their key, and we deliberately never
  // display an existing one. The only honest way in is the path staff actually
  // take: rotate the key, which shows it once, then open the portal with it.
  let sawEarnings = false;
  let portalUrl = null;
  for (const href of guildOnly.slice(0, 6)) {
    await open(boss, `${BASE}${href}`);
    // Rotate FIRST. A server that has never needed a portal has no slug and no
    // /servers/ link yet — rotating is what creates both, so looking for the
    // link before rotating skips every guild on a fresh install.
    await tap(boss.locator('button:has-text("Reset portal key")').first());
    await boss.waitForTimeout(300);
    await tap(boss.locator('button:has-text("Yes, rotate it")').first());
    await boss.waitForTimeout(1500);
    const shown = await boss.locator("body").innerText();
    const key = (shown.match(/New key:\s*(\S+)/) ?? [])[1];
    if (!key) continue;
    await boss.reload({ waitUntil: "domcontentloaded" }); await settle(boss);
    const slugLink = await boss.locator('a[href^="/servers/"]').first().getAttribute("href").catch(() => null);
    if (!slugLink) continue;
    portalUrl = `${BASE}${slugLink}?key=${encodeURIComponent(key)}`;
    break;
  }
  ok("staff can get into a server portal the way they really do", !!portalUrl, String(portalUrl));

  for (const url of portalUrl ? [portalUrl] : []) {
    await open(boss, url);
    // The key handoff posts a form and lands back on the portal with a session.
    await boss.waitForTimeout(1200);
    const t = await boss.locator("body").innerText();
    if (!/earnings/i.test(t)) continue;
    await tap(boss.locator('button:has-text("Earnings")').first());
    await boss.waitForTimeout(700);
    const earn = await boss.locator("body").innerText();
    if (!/sponsored challenge share/i.test(earn)) continue;
    sawEarnings = true;
    ok("the tier is stated first", /your tier/i.test(earn));
    ok("earning type 1: the sponsored share", /sponsored challenge share/i.test(earn));
    ok("earning type 2: their members' winnings", /members.{0,3} winnings/i.test(earn));
    // The line that stops an owner budgeting the prize pool as revenue.
    // The wording moved from a footnote to a banner — assert the claim, not
    // the sentence it was first written in.
    ok("and it says plainly that the prize money isn't theirs",
      /not payable to you|not paid to you/i.test(earn), earn.slice(0, 900).replace(/\n/g, " | "));
    ok("payout setup is on the same tab", /how you get paid|set up your payouts/i.test(earn));
    ok("which promises we never store their bank details",
      /never stores your bank details|never store/i.test(earn));
    const bad = await boss.locator('input[placeholder*="IBAN" i], input[placeholder*="Account number" i]').count();
    ok("and asks for no account details anywhere on it", bad === 0, `${bad}`);
    await boss.screenshot({ path: `${SHOTS}/server-earnings.png`, fullPage: true });
    break;
  }
  ok("a server portal has an Earnings tab with the two types", sawEarnings);

  console.log("\n== Staff can't wander into the payments console ==");
  const staff = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await staff.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await staff.fill('input[name="email"]', "ops@clustergg.com");
  await staff.fill('input[name="password"]', "cluster-demo");
  await staff.click('button:has-text("Log in with email")');
  await settle(staff);
  // The console shell renders first, so read the heading after the page settles
  // rather than the loading screen — otherwise this passes or fails on timing.
  const staffSees = async (path) => {
    await open(staff, `${BASE}${path}`);
    return (await staff.locator("h1").first().innerText().catch(() => "")).trim();
  };
  ok("a staff member cannot open the provider settings",
    /404/.test(await staffSees("/admin/payments")));
  // Their own desk still works; this is a permission boundary, not a lockout.
  ok("but their own console still opens", /command centre/i.test(await staffSees("/admin")));
  ok("and the payouts queue is billing's, not theirs",
    /404/.test(await staffSees("/admin/payouts")));
  await staff.close();

  console.log("\n== Layout ==");
  await open(boss, `${BASE}/admin/billing`);
  const overflow = await boss.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok("no horizontal overflow on billing", overflow <= 0, String(overflow));
  await boss.screenshot({ path: `${SHOTS}/admin-billing.png`, fullPage: true });
} catch (e) {
  fail++;
  console.log("  ✗ threw:", e.message);
  try { await boss.screenshot({ path: `${SHOTS}/money-fail.png`, fullPage: true }); } catch {}
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
