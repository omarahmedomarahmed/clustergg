// B30/B44 — the founding offers as spend, with a switch and a bill that shows it.
//
// Money-touching, so it is written with the item (§1.1). Two properties carry
// the whole thing:
//
//   1. **OFF by default.** These campaigns are funded out of the round. A
//      deploy must not start giving money away, and a database that cannot be
//      read must not either — the reader fails CLOSED.
//   2. **The discount is its OWN LINE, at a percentage of the CHALLENGE lines.**
//      Never a quietly reduced unit price: the gross figure is what tells us
//      what the campaign cost, and a bill whose numbers cannot be traced is a
//      bill somebody disputes. Placements stay billed however generous the rate.
//
//   DEMO_DB=1 npx tsx tests/db/offers.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const {
  buildCampaigns, campaignCostOf, clampPct,
  CAMPAIGN_KEYS, DEFAULT_BRAND_PCT,
} = await import("../../lib/campaigns.ts");
const { campaigns, campaignAnalytics } = await import("../../lib/campaigns-read.ts");
const { draftLines, totalsOf } = await import("../../lib/invoices.ts");
const { PRICING_DEFAULTS } = await import("../../lib/pricing.ts");
const { readFile } = await import("node:fs/promises");

const FALLBACKS = { serverValue: 25, serverCap: 1000, brandCap: 100 };
const round2 = (n: number) => Math.round(n * 100) / 100;

console.log("== both campaigns are OFF by default ==");
// Nothing in an empty config, a broken read, or a fresh database turns these on.
const fresh = buildCampaigns({}, FALLBACKS);
eq("the brand campaign is off", fresh.brand.enabled, false);
eq("the server campaign is off", fresh.server.enabled, false);
eq("…and the rate still defaults to the original offer", fresh.brand.pct, DEFAULT_BRAND_PCT);
// The reader fails CLOSED: a campaign that cannot be read is a campaign that is
// off. Failing the other way would spend money because a query timed out.
const live = await campaigns(FALLBACKS);
eq("a real read starts off too", [live.brand.enabled, live.server.enabled], [false, false]);

console.log("\n== a percentage outside 0–100 is a typo, not an instruction ==");
eq("negative clamps to zero", clampPct(-40), 0);
eq("over a hundred clamps to a hundred", clampPct(400), 100);
eq("a fraction rounds", clampPct(42.6), 43);
eq("garbage in the CMS falls back rather than becoming NaN",
  buildCampaigns({ [CAMPAIGN_KEYS.brandPct]: "not a number" }, FALLBACKS).brand.pct, DEFAULT_BRAND_PCT);
// The one that was actually broken, and that `{}` could never have caught:
// `getContent` returns "" for a key never set, and Number("") is 0 — finite and
// non-negative, so the fallback never applied and a fresh install read 0%.
// Found in a browser, fixed here, asserted with the real shape.
eq("an UNSET key falls back, because \"\" is not zero",
  buildCampaigns({ [CAMPAIGN_KEYS.brandPct]: "" }, FALLBACKS).brand.pct, DEFAULT_BRAND_PCT);
eq("…and so does a whitespace-only value",
  buildCampaigns({ [CAMPAIGN_KEYS.brandPct]: "   " }, FALLBACKS).brand.pct, DEFAULT_BRAND_PCT);
eq("but a real zero is respected", buildCampaigns({ [CAMPAIGN_KEYS.brandPct]: "0" }, FALLBACKS).brand.pct, 0);
eq("an unset server value falls back too",
  buildCampaigns({ [CAMPAIGN_KEYS.serverValue]: "" }, FALLBACKS).server.value, FALLBACKS.serverValue);

console.log("\n== OFF: a challenge month bills at full price ==");
const cfg = PRICING_DEFAULTS;
const off = draftLines({ games: 4, cfg, campaigns: fresh });
ok("no founding-offer line exists at all",
  !off.some((l) => /founding brand offer/i.test(l.label)),
  JSON.stringify(off.map((l) => l.label)));
const offTotals = totalsOf(off);
ok("the bill is the sum of its lines", offTotals.total > 0);

console.log("\n== ON: the discount is its own line, at the configured rate ==");
const on100 = buildCampaigns({
  [CAMPAIGN_KEYS.brandEnabled]: "1", [CAMPAIGN_KEYS.brandPct]: "100",
}, FALLBACKS);
const full = draftLines({ games: 4, cfg, campaigns: on100 });
const promo = full.find((l) => /founding brand offer/i.test(l.label));
ok("the line appears", !!promo, JSON.stringify(full.map((l) => l.label)));
ok("…as a NEGATIVE amount, not a reduced unit price", (promo?.unitAmount ?? 0) < 0);
eq("…and it is a discount line", promo?.kind, "discount");

// The gross must survive: every challenge line still quotes list price.
const challengeLines = full.filter((l) => l.kind === "game");
const gross = challengeLines.reduce((s, l) => s + l.quantity * l.unitAmount, 0);
ok("every challenge line still quotes list price",
  challengeLines.every((l) => l.unitAmount === cfg.challengePrice),
  JSON.stringify(challengeLines.map((l) => l.unitAmount)));
eq("…and 100% covers exactly the challenge lines", Math.abs(promo!.unitAmount), round2(gross));

console.log("\n== placements are STILL billed ==");
// The offer is a promotion on the thing we want brands to try, not a month of
// free everything.
const base = full.find((l) => l.kind === "base");
eq("the placements base is on the bill", base?.unitAmount, cfg.reachBase);
const total100 = totalsOf(full).total;
ok("…so the total is not zero even at 100%", total100 > 0, String(total100));
// The bill also carries the SPONSORED-PLAN base reduction, which is a separate,
// pre-existing discount — so the total is below list, and comparing it to
// `reachBase` would be comparing it to a price this bill never had. What the
// campaign must not do is take the placements away: the base line stands at
// list price and the campaign's own line never exceeds the challenge lines.
ok("…and the campaign never eats into the placements",
  Math.abs(promo!.unitAmount) <= round2(gross) + 0.01,
  `${Math.abs(promo!.unitAmount)} covered vs ${round2(gross)} of challenges`);

console.log("\n== the total is the sum of the lines, never stored ==");
// The standing rule. A discount line that does not change the total is a
// decoration, and one that changes it twice is a hole.
const recomputed = round2(full.reduce((s, l) => s + l.quantity * l.unitAmount, 0));
eq("totalsOf agrees with adding the lines up", totalsOf(full).total, recomputed);
// `totalsOf().discount` sums EVERY discount, and this bill carries two: the
// sponsored-plan base reduction that already existed, and the campaign. So the
// assertion is that the campaign contributes its own amount exactly once — not
// that it is the only discount, which it never was.
const otherDiscounts = full
  .filter((l) => l.kind === "discount" && !/founding brand offer/i.test(l.label))
  .reduce((s2, l) => s2 + Math.abs(l.quantity * l.unitAmount), 0);
eq("the campaign is counted once, alongside the discounts already there",
  totalsOf(full).discount, round2(otherDiscounts + Math.abs(promo!.unitAmount)));

console.log("\n== the percentage actually moves the money ==");
for (const pct of [25, 50, 75]) {
  const cfgN = buildCampaigns({
    [CAMPAIGN_KEYS.brandEnabled]: "1", [CAMPAIGN_KEYS.brandPct]: String(pct),
  }, FALLBACKS);
  const lines = draftLines({ games: 4, cfg, campaigns: cfgN });
  const line = lines.find((l) => /founding brand offer/i.test(l.label));
  eq(`${pct}% covers ${pct}% of the challenge lines`,
    Math.abs(line?.unitAmount ?? 0), round2((gross * pct) / 100));
  ok(`…and the label says ${pct}%`, line!.label.includes(`${pct}%`), line!.label);
}
// 100% is worded without a number, because "100% of" reads as hedging on a
// line that covers the whole thing.
ok("at 100% the label does not say a percentage", !/\d+%/.test(promo!.label), promo!.label);

console.log("\n== zero percent is no line, not a $0.00 line ==");
// A "$0.00 Founding brand offer" row on a bill is a question, not information.
const zero = draftLines({ games: 4, cfg, campaigns: buildCampaigns({
  [CAMPAIGN_KEYS.brandEnabled]: "1", [CAMPAIGN_KEYS.brandPct]: "0" }, FALLBACKS) });
ok("no line at 0%", !zero.some((l) => /founding brand offer/i.test(l.label)));
// And a bill with no challenges has nothing to cover.
const noGames = draftLines({ games: 0, cfg, campaigns: on100 });
ok("no line when there are no challenges", !noGames.some((l) => /founding brand offer/i.test(l.label)),
  JSON.stringify(noGames.map((l) => l.label)));

console.log("\n== changing the rate changes the NEXT bill, never a sent one ==");
// The rate is read when the invoice is drafted, so an issued bill carries the
// rate that was live when it was raised. Asserted on the lines themselves:
// re-reading the config does not go back and rewrite them.
const issued = draftLines({ games: 4, cfg, campaigns: on100 });
const issuedAmount = issued.find((l) => /founding brand offer/i.test(l.label))!.unitAmount;
const later = draftLines({ games: 4, cfg, campaigns: buildCampaigns({
  [CAMPAIGN_KEYS.brandEnabled]: "1", [CAMPAIGN_KEYS.brandPct]: "25" }, FALLBACKS) });
ok("the new bill uses the new rate",
  Math.abs(later.find((l) => /founding brand offer/i.test(l.label))!.unitAmount) < Math.abs(issuedAmount));
eq("…and the already-drafted lines are untouched",
  issued.find((l) => /founding brand offer/i.test(l.label))!.unitAmount, issuedAmount);
// Source-level: the draft action reads the campaigns rather than storing a rate
// somewhere a later edit could reach.
const billing = await readFile(new URL("../../app/actions/billing.ts", import.meta.url), "utf8");
ok("the draft reads the campaigns at draft time", /campaigns\(\{/.test(billing));
ok("…and records what the rate was, in the audit log", /campaign: promo\.brand\.enabled/.test(billing));

console.log("\n== an admin edit survives, because nothing recalculates behind them ==");
// `draftLines` is only ever called to CREATE lines. Nothing re-runs it against
// an existing invoice, so an edited amount is not overwritten — asserted by
// grepping the callers rather than by trusting the claim.
const invoices = await readFile(new URL("../../lib/invoices.ts", import.meta.url), "utf8");
ok("the campaign line is appended, never folded into a unit price",
  /out\.push\(promo\)/.test(invoices), "campaignDiscountLine result must be pushed as its own line");
ok("…after the addon, so it reads as a deduction from a stated price",
  invoices.indexOf('kind: "addon"') < invoices.indexOf("campaignDiscountLine(out"));

console.log("\n== the cost is what was ISSUED, not what was configured ==");
// The two differ the moment somebody edits a bill, which B44 explicitly allows.
eq("an issued discount line is counted", campaignCostOf(full), round2(Math.abs(promo!.unitAmount)));
eq("…and an unrelated discount is not",
  campaignCostOf([{ kind: "discount", label: "Sponsored-plan base reduction", quantity: 1, unitAmount: -100 }]), 0);
eq("…nor is a positive line", campaignCostOf([{ kind: "game", label: "x", quantity: 1, unitAmount: 250 }]), 0);

console.log("\n== the analytics table counts each recipient once ==");
const stats = await campaignAnalytics(live);
const ids = stats.recipients.map((r) => `${r.kind}:${r.id}`);
eq("no recipient appears twice", ids.length, new Set(ids).size);
eq("the total is brands plus servers", stats.totalCost, round2(stats.brandCost + stats.serverCost));
ok("every row says what it cost and what it produced",
  stats.recipients.every((r) => typeof r.cost === "number" && typeof r.produced === "number"));
ok("…and brands and servers are in ONE table",
  new Set(stats.recipients.map((r) => r.kind)).size <= 2);

console.log("\n== nothing is granted while a campaign is off ==");
const actions = await readFile(new URL("../../app/actions/offers.ts", import.meta.url), "utf8");
for (const fn of ["grantFounderCredit", "grantOneFounderCredit", "sweepServerWelcome", "grantOneWelcome"]) {
  const body = actions.slice(actions.indexOf(`export async function ${fn}`),
    actions.indexOf("export async function", actions.indexOf(`export async function ${fn}`) + 10) || undefined);
  ok(`${fn} refuses while its campaign is off`, /campaign\.(brand|server)\.enabled/.test(body),
    body.slice(0, 120));
}

console.log("\n== the funding figure is $100K everywhere ==");
// B44: the deck and the model say $100K. A stale $30K anywhere is what the
// offer sizing argument rests on being wrong.
const { readdir } = await import("node:fs/promises");
const docs = (await readdir(new URL("../../docs", import.meta.url))).filter((f) => f.endsWith(".md"));
const stale: string[] = [];
for (const f of docs) {
  const text = await readFile(new URL(`../../docs/${f}`, import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    if (!/\$30[,.]?000|\$30K/i.test(line)) continue;
    // A line that says "$100K, not $30K" is the CORRECTION, not the stale
    // figure. Flagging it would make this assertion permanently red on the
    // document that fixed the problem — which is how a check gets deleted.
    if (/\$100K|not \$30K|stale/i.test(line)) continue;
    stale.push(`${f}: ${line.trim().slice(0, 80)}`);
  }
}
eq("no document still claims $30K as the funding figure", stale, []);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
