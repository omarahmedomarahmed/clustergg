// The deck quoted a price we had stopped charging. B110.
//
// ===== WHAT WAS WRONG =====
//
// `/dataroom` told every reader, on its own front page:
//
//   "Every figure in these documents is counted from production when you load
//    them. Nothing is modelled or projected."
//
// The investor deck under it said "a challenge runs every week for $250", and
// "a brand pays $250… the $75 platform fee is the only line the business lives
// on, and EVERY TOTAL IN THIS DOCUMENT IS BUILT FROM IT", and "six games at
// $1,000 a month", and showed three unit-economics cards reading
// `{ revenue: 250, cost: 175 }` under a subtitle promising "every number here
// is the live rate card".
//
// `lib/pricing.ts` charges **$350**, of which **$175** is the prize. The
// platform fee is **$175**, not $75 — the deck was out by 2.33× on the one line
// it said everything else was built from.
//
// The MODEL was never wrong: `lib/finance.ts` derives price, prize and fee from
// the config and always has. Only the prose was — a sentence typed once against
// a rate card that changed underneath it. `tests/db/marketing-truth.mts` exists
// to stop exactly this on the public pages. The data room had no equivalent,
// which is why the worse copy of the bug lived in the more expensive document.
//
// Understating our own revenue is not the commercially dangerous direction. The
// dangerous part is an investor opening `/pricing` in the next tab and finding
// a fundraising document that contradicts the product.
//
//   DEMO_DB=1 npx tsx tests/db/dataroom-truth.mts

process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const { SEED_DOCS } = await import("../../lib/dataroom/defaults.ts");
const { fillTokens, tokensIn, pricingTokens, TOKEN_NAMES } = await import("../../lib/dataroom/tokens.ts");
const { PRICING_DEFAULTS, perGame, money } = await import("../../lib/pricing.ts");
const { challengeUnit, liveUnitRows } = await import("../../lib/finance.ts");

const cfg = PRICING_DEFAULTS;
const unit = challengeUnit(cfg);
const tokens = pricingTokens(cfg);

console.log("== the rate card, so the rest of this file has a subject ==");
{
  ok("a challenge has a price", unit.price > 0, String(unit.price));
  eq("the prize is the configured share", unit.prize, cfg.prizePool);
  eq("the fee is what is left", unit.fee, unit.price - unit.prize);
  ok("…and the fee is not a number somebody typed",
    !/const fee = \d/.test(read("lib/finance.ts")),
    "the whole defect was a fee that had been typed rather than derived");
}

console.log("\n== every price in the shipped deck is a token, not a figure ==");
{
  // Walk every string in every seeded document. This is the alarm: a currency
  // figure typed into the prose is a number that will be wrong the first time
  // the rate card moves, and nothing else in the codebase would notice.
  const strings: { where: string; text: string }[] = [];
  const walk = (value: unknown, where: string) => {
    if (typeof value === "string") strings.push({ where, text: value });
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, `${where}.${k}`);
    }
  };
  for (const doc of SEED_DOCS) walk(doc, doc.slug);
  ok("there is prose to check", strings.length > 50, String(strings.length));

  // The figures that ARE the rate card. A deck may say "$100,000 for 20%" —
  // that is the raise, not a price — so this looks only for the numbers that
  // have a live source and must therefore come from it.
  const forbidden: { label: string; re: RegExp }[] = [
    { label: "the old challenge price", re: /\$250\b/ },
    { label: "the old platform fee", re: /\$75\b/ },
    { label: "the old per-game month", re: /\$1,000 a month/ },
    { label: "the retired ultimate base", re: /ultimate base/i },
  ];
  for (const f of forbidden) {
    const hits = strings.filter((s) => f.re.test(s.text));
    ok(`no seeded string quotes ${f.label}`, hits.length === 0,
      hits.slice(0, 2).map((h) => `${h.where}: ${h.text.slice(0, 80)}`).join(" | "));
  }

  // And the general rule, not just the four known-bad values: any string that
  // states the challenge price, the prize or the fee must do it with a token.
  const live = [unit.price, unit.prize, unit.fee, perGame(cfg), perGame(cfg) * cfg.games];
  for (const n of live) {
    const written = money(n, cfg.currency);
    const hits = strings.filter((s) => s.text.includes(written));
    ok(`no seeded string hard-codes ${written}`, hits.length === 0,
      hits.slice(0, 2).map((h) => `${h.where}: ${h.text.slice(0, 80)}`).join(" | ") +
      " — right today, wrong the day the price moves");
  }

  // Tokens are used, and every one of them is real.
  const used = new Set<string>();
  for (const s of strings) for (const t of tokensIn(s.text)) used.add(t);
  ok("the deck actually uses tokens", used.size > 0, [...used].join(","));
  for (const t of used) {
    ok(`{{${t}}} is a token this codebase can fill`, TOKEN_NAMES.includes(t),
      `an unfilled {{${t}}} printed to an investor is worse than a stale number`);
  }
}

console.log("\n== filling behaves, including when it cannot ==");
{
  eq("a known token is replaced",
    fillTokens("a challenge costs {{challengePrice}}", tokens),
    `a challenge costs ${money(unit.price, cfg.currency)}`);
  eq("two in one sentence",
    fillTokens("{{prizePool}} of {{challengePrice}}", tokens),
    `${money(unit.prize, cfg.currency)} of ${money(unit.price, cfg.currency)}`);
  // An unknown token is LEFT VISIBLE on purpose: `{{whatever}}` in a deck is
  // embarrassing and gets fixed in an hour, while "a brand pays  for a
  // challenge" reads as a typo and survives for months.
  eq("an unknown token is left visible, not blanked",
    fillTokens("a brand pays {{nope}} for it", tokens),
    "a brand pays {{nope}} for it");
  eq("no tokens is the same string", fillTokens("plain text", tokens), "plain text");
  eq("null is empty, not a crash", fillTokens(null, tokens), "");
  eq("tokensIn finds them", tokensIn("{{a}} and {{b}} and {{a}}").sort(), ["a", "b"]);
}

console.log("\n== the unit-economics slide is the live rate card, as it claims ==");
{
  const rows = liveUnitRows(cfg);
  eq("three rows", rows.length, 3);
  eq("one challenge is the real price", rows[0].revenue, unit.price);
  eq("…against the real prize", rows[0].cost, unit.prize);
  eq("one game a month is the real month", rows[1].revenue, perGame(cfg));
  eq("the whole catalogue is the real network", rows[2].revenue, perGame(cfg) * cfg.games);
  // The defect in one line: the costs had been kept in step and the revenues
  // had not, so every margin on the slide was understated.
  ok("every margin is positive", rows.every((r) => r.revenue > r.cost));

  const seedUnit = SEED_DOCS.flatMap((d) => d.sections).find((s) => s.kind === "unit");
  ok("the shipped slide exists", !!seedUnit);
  ok("…and computes rather than stores",
    !!seedUnit && (seedUnit.data as { liveUnits?: boolean })?.liveUnits === true,
    "a stored revenue under a subtitle promising the live rate card is the exact defect");
  ok("…and stores no typed rows at all",
    !seedUnit || !(seedUnit.data as { units?: unknown[] })?.units,
    JSON.stringify(seedUnit?.data));
  ok("the renderer honours the flag",
    /d\.liveUnits \? liveUnitRows\(pricing\)/.test(read("components/dataroom/Investor.tsx")));
}

console.log("\n== the filling actually reaches the page ==");
{
  const sections = read("components/dataroom/Sections.tsx");
  ok("sections are filled before anything renders them",
    /const filled = fillSection\(section, pricingTokens\(live\.pricing\)\)/.test(sections));
  ok("…and it is the FILLED one that is rendered",
    /<Body section=\{filled\}/.test(sections),
    "filling a copy and rendering the original is the failure this assertion exists for");
  ok("…deeply, because one drifted number was inside a use-of-funds note",
    /function fillDeep/.test(sections) && /data: fillDeep\(section\.data, tokens\)/.test(sections));
  ok("it fills from the LIVE pricing, not the defaults",
    /pricingTokens\(live\.pricing\)/.test(sections),
    "PRICING_DEFAULTS would ignore whatever the owner set in the CMS");
}

console.log("\n== the front page no longer promises what it cannot keep ==");
{
  const page = strip(read("app/dataroom/page.tsx"));
  ok("the blanket claim is gone",
    !/Nothing is modelled or projected/.test(page),
    "the deck contains a six-month plan, a conversion assumption and an MRR run rate");
  ok("counted and planned are told apart",
    /Counted:/.test(page) && /Planned:/.test(page));
  ok("…and the projections are called projections",
    /is a projection/.test(page));
  // The deck was already honest about its own assumptions — the front page was
  // what took that honesty away. Check the deck still carries the slide.
  const risky = JSON.stringify(SEED_DOCS);
  // Asserted as a PROPERTY, not as one sentence. This pinned the exact string
  // "Nothing in this business has proven that yet" and went red the moment the
  // risks slide was rewritten — for a rewrite that made the slide MORE honest,
  // since it promoted the real constraint to the top. A guard that fails on an
  // improvement teaches people to edit the guard.
  ok("the deck still has a slide about what would break the plan",
    /What we.{0,3}d challenge|would push back on ourselves/.test(risky),
    "the front page borrowed its credibility from this slide");
  ok("…and it still admits something is unproven",
    /(has|have) (not )?proven|nothing .{0,30}proven|assumption about/i.test(risky),
    "a risks slide that asserts no risk is a marketing slide");
}

console.log("\n== an existing install can pick up the correction ==");
{
  // Seeded prose lives in the DATABASE. Changing `defaults.ts` fixes a fresh
  // install and does nothing for a deployed one, so the reseed path is part of
  // this fix rather than a nicety.
  const idx = read("lib/dataroom/index.ts");
  ok("reseedDoc replaces the stored sections", /reseedDoc/.test(idx)
    && /delete\(schema\.dataroomSections\)/.test(idx));
  ok("…and it is reachable from the admin",
    /reseedDoc/.test(read("app/actions/dataroom.ts")),
    "a fix only in the seed leaves the live deck quoting the old price");
}

console.log("\n== the ask in the deck is the ask in the model ==");
{
  // B120. The round was typed into two slides — amount, valuation, post-money,
  // equity, runway — while `lib/finance.ts` computed the same five numbers from
  // the raise it was actually planning. Two copies of one fact, and the deck's
  // copy is the one an investor reads.
  const { FINANCE_DEFAULTS, finance } = await import("../../lib/finance.ts");
  const f = finance();
  const found: Record<string, number>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.postMoney === "number" && typeof o.equityPct === "number") {
        found.push(o as unknown as Record<string, number>);
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(SEED_DOCS);

  ok("the deck states the round", found.length > 0, String(found.length));
  for (const a of found) {
    eq("the amount matches the model", a.amount, FINANCE_DEFAULTS.raise);
    eq("the equity matches", a.equityPct, FINANCE_DEFAULTS.equityPct);
    eq("the post-money matches", a.postMoney, f.valuation.post);
    eq("the pre-money matches", a.valuation, f.valuation.pre);
    eq("the runway matches the months planned", a.runwayMonths, FINANCE_DEFAULTS.months);
  }
  // Two slides carry it. They must agree with each other as well as with the
  // model — an investor who reads both is the one who finds the gap.
  ok("every slide that states the round states the same round",
    new Set(found.map((a) => `${a.amount}/${a.equityPct}/${a.postMoney}`)).size === 1,
    found.map((a) => `${a.amount}/${a.equityPct}`).join(" vs "));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
