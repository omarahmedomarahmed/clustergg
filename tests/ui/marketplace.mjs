// B48 — the marketplace has to say how you get the points.
//
// Drives a real browser against a production build, because every assertion here
// is about what a gamer can SEE and CLICK, and none of it is checkable from the
// database.
//
//   DEMO_DB=1 npx next build && DEMO_DB=1 npx next start -p 3031
//   node tests/ui/marketplace.mjs

import { chromium } from "playwright-core";

const B = process.env.BASE_URL || "http://localhost:3031";
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let pass = 0;
const fails = [];
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const br = await chromium.launch({ executablePath: CHROME });
const ctx = await br.newContext({ viewport: { width: 1440, height: 1400 } });
const p = await ctx.newPage();
const pageErrors = [];
p.on("pageerror", (e) => pageErrors.push(e.message));

await p.goto(`${B}/login`, { waitUntil: "networkidle" });
await p.fill('input[name="email"]', "nova@demo.gg");
await p.fill('input[name="password"]', "cluster-demo");
await p.locator("form button.glow-btn").first().click();
await p.waitForTimeout(4000);
await p.goto(`${B}/marketplace`, { waitUntil: "networkidle" });

// §0 trap: assert on the heading, not on body text — the console shell paints a
// loading screen first and `notFound()` returns HTTP 200.
console.log("== the page ==");
eq("the marketplace renders", (await p.locator("h1").first().textContent())?.trim(), "What your points are for");
eq("nothing threw on the client", pageErrors, []);

console.log("\n== the balance is a way in, not a number ==");
const bal = await p.evaluate(() => {
  // §0 trap: innerText returns the CSS-TRANSFORMED text, and this label is
  // `uppercase`, so a case-sensitive match here finds nothing and reports a
  // missing link that is right there on the screen.
  const a = [...document.querySelectorAll("a")]
    .find((x) => /earned all-time|sign in to see your balance/i.test(x.innerText));
  return a ? { href: a.getAttribute("href"), text: a.innerText.replace(/\s+/g, " ").trim() } : null;
});
ok("the balance is an anchor", !!bal, "no anchor wrapping the balance");
eq("…that goes to the quests", bal?.href, "/quests");
ok("…and says what it is for", /earn more/i.test(bal?.text ?? ""), bal?.text);

console.log("\n== the quests are on the shelf ==");
const quests = await p.evaluate(() => {
  const links = [...document.querySelectorAll('a[href^="/quests"]')]
    .map((a) => a.getAttribute("href"));
  return { all: links, perQuest: [...new Set(links.filter((h) => h !== "/quests"))] };
});
ok("every quest is reachable from the marketplace by a link",
  quests.perQuest.length >= 4, JSON.stringify(quests.perQuest));
ok("…and there is a way into the quest hub itself", quests.all.includes("/quests"));
ok("the section says what it is for",
  /How you earn them/.test(await p.evaluate(() => document.body.innerText)));

console.log("\n== the tile ==");
const tiles = await p.evaluate(() => {
  return [...document.querySelectorAll("[data-trophy]")].map((el) => {
    const dollar = [...el.querySelectorAll("span")].find((s) => /^\$[\d,]+$/.test(s.textContent.trim()));
    const cp = el.querySelector('[aria-hidden="true"]');
    const cpBlock = [...el.querySelectorAll("div")].find((d) => /Cluster Points/.test(d.innerText) && d.children.length);
    const px = (e) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0);
    const txt = el.innerText.replace(/\s+/g, " ");
    return {
      dollar: dollar?.textContent.trim() ?? null,
      dollarPx: px(dollar),
      cpPx: px(cpBlock),
      cp: (txt.match(/([\d,]+) Cluster Points/) || [])[1] ?? null,
      short: /to go/.test(txt),
      hasBuy: /Get it/.test(txt),
    };
  });
});
ok("there are tiles to check", tiles.length > 0);
// The claim the price rests on has to outsize the price.
const sized = tiles.filter((t) => t.dollar && t.cpPx > 0);
ok("every tile shows its redemption value", sized.length === tiles.filter((t) => t.dollar).length);
ok("the redemption value renders LARGER than the CP price",
  sized.every((t) => t.dollarPx > t.cpPx),
  JSON.stringify(sized.map((t) => `${t.dollar} @${t.dollarPx}px vs CP @${t.cpPx}px`)));

// The two numbers are two views of ONE number. If they ever disagree, one of
// them is lying to somebody about what a trophy is worth.
console.log("\n== the two numbers agree ==");
const rate = await p.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g, " ");
  const m = t.match(/([\d,]+) Cluster Points = \$1/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
});
ok("the page states the rate", typeof rate === "number" && rate > 0, String(rate));
const disagreeing = tiles.filter((t) => {
  if (!t.dollar || !t.cp) return false;
  const usd = Number(t.dollar.replace(/[$,]/g, ""));
  const cp = Number(t.cp.replace(/,/g, ""));
  // priceOf rounds up to a clean hundred and floors at 500.
  const expected = Math.max(500, Math.ceil((usd * rate) / 100) * 100);
  return cp < expected;   // a tier multiplier may push it higher, never lower
});
eq("no tile prices below its own dollar value at the platform rate",
  disagreeing.map((t) => `${t.dollar} / ${t.cp} CP`), []);

console.log("\n== a gamer who is short still has somewhere to go ==");
ok("at least one tile is out of reach in the demo", tiles.some((t) => t.short));
ok("…and it says how far, not just no",
  await p.evaluate(() => /[\d,]+ Cluster Points to go/.test(document.body.innerText.replace(/\s+/g, " "))));
ok("…and at least one is affordable, so the shelf is not a wall", tiles.some((t) => t.hasBuy));

// A signed-out visitor must still see the path — they are the ones deciding
// whether any of this is worth an account.
console.log("\n== signed out ==");
await ctx.clearCookies();
await p.goto(`${B}/marketplace`, { waitUntil: "networkidle" });
ok("the quests are still shown to a stranger",
  (await p.evaluate(() => document.querySelectorAll('a[href^="/quests/"]').length)) > 0);
ok("…and the balance still points at them",
  (await p.evaluate(() => !!document.querySelector('a[href="/quests"]'))));

await br.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
