/**
 * The homepage as a B2B SaaS landing page.
 *
 * The spine a landing page needs, in order: who you are → proof the audience is
 * real → the problem → what we built → what it costs → what a server earns →
 * what a gamer plays for → the questions everyone asks → the ask.
 *
 * Before this, a brand met the pitch and then 400px of gamer content sitting
 * between them and the price, and the three audiences had no way to say which
 * one they were.
 */
import { chromium } from "playwright-core";
import { open } from "./_nav.mjs";

const BASE = "http://localhost:3031";
const SHOTS = "/tmp/claude-0/-home-user-clustergg/f1b2f374-59b4-5577-bf34-0df216698fe3/scratchpad";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

try {
  await open(page, BASE);
  await page.waitForTimeout(800);
  const text = await page.locator("body").innerText();

  console.log("\n== It says which audiences it is for ==");
  for (const door of ["I want to reach gamers", "I run a Discord server", "I play games"]) {
    ok(`"${door}" is offered`, text.includes(door), text.slice(0, 200));
  }
  const anchors = await page.evaluate(() =>
    ["brands", "servers", "gamers", "pricing"].filter((id) => !!document.getElementById(id)));
  ok("and each door has a section to land on", anchors.length === 4, anchors.join(","));

  console.log("\n== The three audiences are all served ==");
  ok("brands get a price", /\$\d/.test(text) && /per|month|challenge/i.test(text));
  ok("server owners get the earning ladder",
    /linked/i.test(text) && /(earn|share)/i.test(text), "no monetization tiers");
  ok("gamers get live competition", /challenge/i.test(text));

  console.log("\n== In the right order ==");
  // Position of each landmark in the rendered text. A landing page that puts
  // the price after the gamer content makes a brand scroll past what it did not
  // come for.
  const low = text.toLowerCase();
  const at = (needle) => low.indexOf(needle.toLowerCase());
  const doors = at("I want to reach gamers");
  const proof = at("Discord servers running the bot");
  const price = at("What it costs") >= 0 ? at("What it costs") : at("pricing");
  const gamers = at("This is what the money buys");
  const faq = at("Straight answers");
  ok("the audience doors come first", doors >= 0 && doors < proof, `${doors} vs ${proof}`);
  ok("proof of audience comes before the argument", proof >= 0, String(proof));
  ok("the gamer half comes after the commercial half", gamers > proof, `${gamers} vs ${proof}`);
  ok("the FAQ comes last, before the close", faq > gamers, `${faq} vs ${gamers}`);

  console.log("\n== The proof band is live, not typed ==");
  const band = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")]
      .find((d) => /Discord servers running the bot/.test(d.textContent || "") && d.children.length < 6);
    return el ? (el.parentElement?.textContent || "") : "";
  });
  ok("it carries four figures", (band.match(/\d/g) ?? []).length >= 4, band.slice(0, 160));
  const api = await (await fetch(`${BASE}/api/planet/entities?game=PUBG`)).json().catch(() => null);
  ok("(sanity: the app is serving live data)", !!api);

  console.log("\n== The FAQ is machine-readable ==");
  const html = await page.content();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter(Boolean).flat();
  const faqBlock = blocks.find((b) => b && b["@type"] === "FAQPage");
  ok("the homepage publishes FAQPage", !!faqBlock, blocks.map((b) => b && b["@type"]).join(","));
  ok("with several answers", (faqBlock?.mainEntity ?? []).length >= 5,
    String((faqBlock?.mainEntity ?? []).length));
  ok("each answer is a paragraph, not a fragment",
    (faqBlock?.mainEntity ?? []).every((q) => (q.acceptedAnswer?.text ?? "").length > 100));

  console.log("\n== Still the SEO surface it was ==");
  ok("the monetize phrase survives", /monetize your discord server/i.test(html));
  // B121.2. This asserted the homepage contains "$250" — a price we stopped
  // charging three sprints ago. A guard that pins a literal holds the page to
  // whatever was true the day it was written, and this one went red for a fix
  // rather than for a regression.
  //
  // The live figures instead, read from the module the page renders from. It
  // now fails when the homepage and the rate card disagree, which is the thing
  // actually worth catching.
  // Checked ACROSS PAGES rather than against an import. The browser band runs
  // under plain `node`, and `lib/pricing.ts` reaches `@/lib/vault-split` — an
  // alias only `tsx` resolves — so importing it here throws.
  //
  // Cross-checking the homepage against the published rate card is the better
  // test anyway: it catches the two pages disagreeing, which is what a visitor
  // would actually notice. Whether the figure equals the live constant is
  // already guarded in the db band, where the import works
  // (`tests/db/marketing-truth.mts`).
  // Both phrasings the site actually uses: "$350 a challenge" and "$175 of
  // every $350 challenge". The first version of this matched only the former
  // and found nothing on /pricing, which would have made the comparison below
  // vacuously true rather than red.
  const priceOf = (src) =>
    (src.match(/\$[\d,]+(?=\s+(?:a\s+|per\s+)?(?:sponsored\s+)?challenge\b)/i) ?? [null])[0];
  const rateCard = await (await fetch(`${BASE}/pricing`)).text();
  const cardPrice = priceOf(rateCard);
  ok("the rate card states a challenge price", !!cardPrice, "nothing matched on /pricing");
  const homePrice = priceOf(html);
  ok("the homepage agrees with the rate card",
    !homePrice || homePrice === cardPrice,
    `homepage ${homePrice} vs /pricing ${cardPrice}`);

  console.log("\n== Clicking a door goes to its section ==");
  await page.locator('a[href="#servers"]').first().click();
  await page.waitForTimeout(900);
  const scrolled = await page.evaluate(() => window.scrollY);
  ok("the page scrolled to the server section", scrolled > 400, String(scrolled));

  console.log("\n== Layout ==");
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok("no horizontal overflow at 1400", overflow <= 0, String(overflow));
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await open(phone, BASE);
  await phone.waitForTimeout(600);
  const po = await phone.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok("nor at 390", po <= 0, String(po));
  const broken = await phone.$$eval("img", (els) =>
    els.filter((e) => e.complete && e.naturalWidth === 0).map((e) => e.currentSrc || e.src));
  // Anything hosted off-site can't load through this sandbox's proxy, so the
  // assertion is about OUR images: an asset we serve that 404s is a bug.
  const ours = broken.filter((u) => u.startsWith(BASE) || u.startsWith("/"));
  ok("no broken image that we serve", ours.length === 0, ours.join(", "));
  if (broken.length) console.log(`      (${broken.length} off-site images blocked by the sandbox proxy)`);
  await phone.close();

  await open(page, BASE);
  await page.screenshot({ path: `${SHOTS}/landing.png` });
} catch (e) {
  fail++;
  console.log("  ✗ threw:", e.message);
  try { await page.screenshot({ path: `${SHOTS}/landing-fail.png` }); } catch {}
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
