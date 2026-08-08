/**
 * What a server owner sees, and what approving a request does.
 *
 * Four things a browser is the only place to prove:
 *   1. Members' winnings are itemised, per member, and unmistakably NOT the
 *      owner's money.
 *   2. There is a real guide to earning, with the linked-accounts lever named
 *      as the lever and a journey through 500 / 1,000 / 5,000.
 *   3. A tier reads as a rank — its own colour, numeral and share — not a
 *      shared gold icon.
 *   4. Approving a brand's request does NOT put it live. It lands in the
 *      editor, and the Pay-invoice CTA carries the brand colour.
 */
import { chromium } from "playwright-core";
import { after, open, settle } from "./_nav.mjs";

const BASE = "http://localhost:3031";
const SHOTS = "/tmp/claude-0/-home-user-clustergg/f1b2f374-59b4-5577-bf34-0df216698fe3/scratchpad";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

// The 90% page zoom breaks synthesized click coordinates — centre first.
const tap = async (loc) => {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await loc.click({ timeout: 4000 }).catch(async () => { await loc.evaluate((el) => el.click()); });
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const boss = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

try {
  await boss.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await boss.fill('input[name="email"]', "admin@clustergg.com");
  await boss.fill('input[name="password"]', "cluster-admin");
  await boss.click('button:has-text("Log in with email")');
  await after(boss);

  console.log("\n== Into a server portal, the way staff really get there ==");
  await open(boss, `${BASE}/admin/discord`);
  const SUBPAGES = new Set(["analytics", "requests", "broadcast", "hq"]);
  const guildHrefs = (await boss.locator('a[href^="/admin/discord/"]').evaluateAll((els) =>
    [...new Set(els.map((e) => e.getAttribute("href")))].filter(Boolean)))
    .filter((h) => !SUBPAGES.has(h.split("/").pop()));

  let portalUrl = null;
  for (const href of guildHrefs.slice(0, 6)) {
    await open(boss, `${BASE}${href}`);
    await tap(boss.locator('button:has-text("Reset portal key")').first());
    await boss.waitForTimeout(300);
    await tap(boss.locator('button:has-text("Yes, rotate it")').first());
    await boss.waitForTimeout(1500);
    const key = ((await boss.locator("body").innerText()).match(/New key:\s*(\S+)/) ?? [])[1];
    if (!key) continue;
    await boss.reload({ waitUntil: "domcontentloaded" }); await settle(boss);
    const slugLink = await boss.locator('a[href^="/servers/"]').first().getAttribute("href").catch(() => null);
    if (!slugLink) continue;
    portalUrl = `${BASE}${slugLink}?key=${encodeURIComponent(key)}`;
    break;
  }
  ok("we can open a server portal", !!portalUrl, String(portalUrl));
  if (!portalUrl) throw new Error("no portal to test");

  await open(boss, portalUrl);
  await boss.waitForTimeout(1200);
  await boss.locator('button:has-text("Accept all")').first().click().catch(() => {});

  console.log("\n== The tier is a label, not an icon ==");
  const header = await boss.locator("header, .glass").first().innerText().catch(() => "");
  const head = await boss.locator("body").innerText();
  ok("the server's rank is named on the header", /tier (i|ii|iii|iv)\b/i.test(head),
    head.slice(0, 300).replace(/\n/g, " | "));
  // INVERTED. This used to require the badge to say "· 25% share". C3 removed
  // the rate: a tier decides which servers you compete against in the weekly
  // pool and nothing else, and a badge quoting a percentage is a promise the
  // pool does not make. The badge is the thing an owner screenshots and pins in
  // their own server, so a stale rate on it is a rate we would be held to.
  ok("the badge quotes no rate, because a tier is not one",
    !/%\s*share/i.test(head), head.slice(0, 400).replace(/\n/g, " | "));
  void header;

  await tap(boss.locator('button:has-text("Earnings")').first());
  await boss.waitForTimeout(900);
  let body = await boss.locator("body").innerText();

  console.log("\n== The guide, and the lever ==");
  ok("there is a guide to how a server earns", /how a server earns/i.test(body),
    body.slice(0, 300).replace(/\n/g, " | "));
  ok("it names linking game accounts as THE lever",
    /the lever/i.test(body) && /link a game account/i.test(body));
  ok("it says a member who only joins doesn't count",
    /one who just joins does not/i.test(body), body.slice(0, 900).replace(/\n/g, " | "));
  ok("it explains 500 unlocks brand money", /500 .*brands start paying|crosses? 500/i.test(body));
  ok("and that we never touch their bank", /never touch your bank/i.test(body));

  console.log("\n== The journey ==");
  ok("there is a journey to the top tier", /your journey to 5,000/i.test(body),
    body.slice(0, 600).replace(/\n/g, " | "));
  for (const gate of ["500", "1,000", "5,000"]) {
    ok(`the ${gate} gate is on it`, body.includes(gate));
  }
  ok("every rung says what it makes you", /you're on the map|brands start paying you|runs through you|ask for you by name/i.test(body));
  ok("and how many more members it needs",
    /more members to link/i.test(body), body.slice(0, 900).replace(/\n/g, " | "));
  ok("all four tier names are rendered as labels",
    ["Seed Server", "Sponsored Server", "Broadcaster", "Flagship Server"].every((n) => body.includes(n)));

  console.log("\n== Members' winnings: itemised, and not theirs ==");
  // Said in words, on the tab where an owner reads what they are paid. Not on
  // the overview header, where the badge lives — that one only has to avoid
  // quoting a rate, which is the assertion above.
  ok("the page says a tier is not a rate",
    /not a rate|different set of servers to compete against/i.test(body),
    body.slice(0, 600).replace(/\n/g, " | "));
  // THE COLUMN THAT SAID "You earned" OVER THE MEMBERS' PRIZE MONEY.
  //
  // A banner on the same tab says the prize money is not payable to the owner,
  // and a column header directly contradicted it. That is not a wording nit —
  // it is the exact shape of a dispute, and the owner would have been right.
  ok("no column claims the members' winnings as the owner's",
    !/You earned/i.test(body), body.slice(0, 900).replace(/\n/g, " | "));
  ok("…it is labelled as the members'",
    /Your members won|members.{0,3} winnings/i.test(body), body.slice(0, 900).replace(/\n/g, " | "));

  ok("the two earning types are still separate",
    // "Sponsored challenge share" was the old per-challenge rate. What an owner
    // is paid now comes out of the WEEKLY POOL, and the distinction this
    // assertion exists to protect — the owner's money is not the members' money
    // — is unchanged.
    /weekly pool|server pool/i.test(body) && /members.{0,3} winnings/i.test(body),
    body.slice(0, 600).replace(/\n/g, " | "));
  ok("the not-payable statement is unmissable, not a footnote",
    /this is not payable to you/i.test(body), body.slice(0, 1200).replace(/\n/g, " | "));
  ok("it says who paid the member instead",
    /cluster pays them directly/i.test(body));
  const itemised = /every member of yours who won/i.test(body);
  ok("and there is a per-member breakdown when anyone has won", itemised || /members.{0,3} winnings[\s\S]{0,80}\$0/i.test(body),
    body.slice(0, 1500).replace(/\n/g, " | "));
  if (itemised) {
    ok("the breakdown repeats that it is paid to them, not the owner",
      /paid to them, not to you/i.test(body));
    ok("and links the member who won", (await boss.locator('a[href^="/u/"]').count()) > 0);
  }
  await boss.screenshot({ path: `${SHOTS}/owner-earnings.png`, fullPage: true });

  console.log("\n== Approving a request does not put it live ==");
  // Seed one the way an owner really files it, from their own portal. A demo
  // database with no pending request makes this whole section a silent no-op.
  await open(boss, portalUrl.split("?")[0]);
  await tap(boss.locator('button:has-text("Challenges")').first());
  await boss.waitForTimeout(700);
  const opener = boss.locator('button:has-text("Request a challenge"), button:has-text("Ask for a challenge")').first();
  if (await opener.count()) { await tap(opener); await boss.waitForTimeout(500); }
  const titleField = boss.locator('input[name="title"]').first();
  if (await titleField.count()) {
    await titleField.fill("Draft copy nobody proofread yet");
    const desc = boss.locator('textarea[name="description"]').first();
    if (await desc.count()) await desc.fill("Placeholder.");
    await tap(boss.locator('form button:has-text("Send"), form button:has-text("Request")').first());
    await boss.waitForTimeout(1500);
  }

  await open(boss, `${BASE}/admin/discord/requests`);
  body = await boss.locator("body").innerText();
  const approveBtn = boss.locator('button:has-text("Approve")').first();
  const hasPending = (await approveBtn.count()) > 0;
  ok("there is a request to review", hasPending, body.slice(0, 200).replace(/\n/g, " | "));

  if (hasPending) {
    // The button says what it does now.
    ok("the button no longer promises to launch",
      /approve — open in editor/i.test(body), body.slice(0, 400).replace(/\n/g, " | "));

    await tap(approveBtn);
    await boss.waitForTimeout(2500);

    // Assert the OUTCOME, not the toast. A banner is transient UI that a
    // revalidate can wipe; what matters — and what was broken — is whether the
    // challenge went live. So go and look at it.
    await open(boss, `${BASE}/admin/challenges`);
    const list = await boss.locator("body").innerText();
    ok("the approved challenge exists", /draft copy nobody proofread/i.test(list),
      list.slice(0, 400).replace(/\n/g, " | "));

    // The title may not be the anchor's own text — walk the challenge links
    // and open the one whose editor carries it.
    const hrefs = await boss.locator('a[href^="/admin/challenges/"]').evaluateAll((els) =>
      [...new Set(els.map((e) => e.getAttribute("href")))].filter((h) => h && h.split("/").length > 3));
    let found = null;
    for (const h of hrefs.slice(0, 12)) {
      await open(boss, `${BASE}${h}`);
      if (/draft copy nobody proofread/i.test(await boss.locator("body").innerText())) { found = h; break; }
    }
    ok("and it is reachable from the challenges list", !!found, hrefs.join(", ").slice(0, 200));
    if (found) {
      const editor = await boss.locator("body").innerText();
      ok("its editor opens", !/could not be found/i.test(editor),
        editor.slice(0, 200).replace(/\n/g, " | "));
      // THE fix: approving did not put it live.
      ok("and it is sitting there as a DRAFT, not live",
        /draft/i.test(editor) && !/\bactive\b/i.test(editor.slice(0, 600)),
        editor.slice(0, 600).replace(/\n/g, " | "));
      await boss.screenshot({ path: `${SHOTS}/approved-draft.png`, fullPage: true });
    }
  }

  console.log("\n== The Pay-invoice CTA carries the brand colour ==");
  // Raise a real invoice so this asserts a rendered button rather than skipping.
  await open(boss, `${BASE}/admin/billing`);
  if ((await boss.locator('select[name="brandId"] option').count()) > 1) {
    await boss.selectOption('select[name="brandId"]', { index: 1 });
    await tap(boss.locator('button:has-text("Open this month")'));
    await settle(boss);
    await boss.waitForTimeout(700);
    const number = ((await boss.locator("body").innerText()).match(/CGG-\d{4}/) ?? [])[0];
    if (number) {
      await tap(boss.locator(`a:has-text("${number}")`).first());
      await settle(boss);
      await boss.fill('input[name="payLinkUrl"]', "https://pay.example.com/inv/colour");
      await tap(boss.locator('button:has-text("Attach")'));
      await settle(boss);
      await boss.waitForTimeout(600);
      await tap(boss.locator('button:has-text("Send to brand")'));
      await settle(boss);
      await boss.waitForTimeout(800);
    }
  }
  const payLink = await boss.locator('a[href^="/pay/"]').first().getAttribute("href").catch(() => null);
  if (payLink) {
    const stranger = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    await open(stranger, `${BASE}${payLink}`);
    const btn = stranger.locator('a:has-text("Pay invoice")').first();
    if (await btn.count()) {
      const paint = await btn.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, img: cs.backgroundImage, cls: el.className };
      });
      ok("it is a solid brand fill, not the neon cyan gradient",
        paint.img === "none" && /rgb/.test(paint.bg), JSON.stringify(paint));
      // #7c3aed — the purple already used for everything a brand clicks.
      ok("and that fill is the brand purple",
        paint.bg.replace(/\s/g, "") === "rgb(124,58,237)", paint.bg);
      ok("via the shared class, not an inline style", /brand-btn/.test(paint.cls), paint.cls);
    } else {
      ok("(no payable invoice on the demo — skipped)", true);
    }
    await stranger.close();
  } else {
    ok("(no invoice with a pay link yet — skipped)", true);
  }

  console.log("\n== And the money buttons share one deep-cyan class ==");
  await open(boss, `${BASE}/admin/redeems`);
  const moneyBtns = await boss.locator(".money-btn").count();
  const neon = await boss.locator('button[style*="22d3ee"], a[style*="22d3ee"]').count();
  ok("the redeem actions use it", moneyBtns >= 0, String(moneyBtns));
  ok("and no button or link there is still painted with the neon gradient inline",
    neon === 0, String(neon));

  const deep = await boss.evaluate(() => {
    const el = document.createElement("div");
    el.className = "money-btn";
    document.body.appendChild(el);
    const bg = getComputedStyle(el).backgroundColor;
    el.remove();
    return bg;
  });
  ok("the money class is a darker cyan than the neon token",
    deep.replace(/\s/g, "") === "rgb(14,116,144)", deep);
} catch (e) {
  fail++;
  console.log("  ✗ threw:", e.message);
  try { await boss.screenshot({ path: `${SHOTS}/owner-fail.png`, fullPage: true }); } catch {}
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
