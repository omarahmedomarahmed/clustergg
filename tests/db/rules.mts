/**
 * B90.10 — every rule, to the person it binds, with the reason it exists.
 *
 * The assertions here are about DRIFT and about TONE, and both are the point.
 *
 * Drift: every number in the guide is imported from the code that enforces it.
 * A guide quoting "$25 minimum withdrawal" while the code refuses below $20 is
 * not a documentation bug — it is a promise we are held to, and the person who
 * finds the gap is the one it cost money.
 *
 * Tone: a rule with no reason reads as an obstacle and gets worked around, and
 * a reason that is about US is worse than none.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { RULES, AUDIENCES, rulesByTopic } = await import("../../lib/rules.ts");
const { MIN_WITHDRAWAL } = await import("../../lib/server-wallet.ts");
const { PRIVATE_FEE_PCT, MIN_PRIZE_POOL } = await import("../../lib/private-quote.ts");
const { PARTICIPATION_SHARE, BRACKETS } = await import("../../lib/server-score.ts");
const { UNLOCK_STEPS } = await import("../../lib/unlock.ts");
const { US_REPORT_THRESHOLD } = await import("../../lib/eligibility.ts");

const all = [...RULES.gamer, ...RULES.owner, ...RULES.brand];

console.log("== all three audiences are covered ==");
{
  for (const who of ["gamer", "owner", "brand"] as const) {
    ok(`${who} has rules`, RULES[who].length >= 5, String(RULES[who].length));
    ok(`…and a lede that says what the page is for`, AUDIENCES[who].lede.length > 60);
  }
  eq("rules group by topic in the order written",
    rulesByTopic("owner")[0].topic, RULES.owner[0].topic);
}

console.log("\n== every rule carries its reason ==");
{
  ok("nothing is unexplained", all.every((r) => r.why.trim().length > 30),
    JSON.stringify(all.filter((r) => r.why.trim().length <= 30).map((r) => r.rule)));

  // A reason that is about US is worse than none: it tells somebody the rule
  // exists for our benefit and invites them to route around it.
  const aboutUs = all.filter((r) => /so we can (measure|track|monitor)|for our records|for compliance purposes/i.test(r.why));
  eq("no reason is about us", aboutUs.map((r) => r.rule), []);

  // And no rule is stated without one, which is the failure mode that creeps
  // in when somebody adds a line in a hurry.
  ok("no rule repeats itself as its own reason",
    all.every((r) => r.why.trim() !== r.rule.trim()));
}

console.log("\n== every number comes from the code that enforces it ==");
{
  const owner = RULES.owner.map((r) => r.rule).join(" ");
  const gamer = RULES.gamer.map((r) => r.rule).join(" ");

  ok("the withdrawal floor is the real one",
    owner.includes(`$${MIN_WITHDRAWAL}`), owner);
  ok("the private-challenge margin is the real one",
    owner.includes(`${PRIVATE_FEE_PCT}%`), owner);
  ok("…and so is its minimum prize pool",
    owner.includes(`$${MIN_PRIZE_POOL}`), owner);
  ok("the flat share of the pool is the real one",
    owner.includes(`${PARTICIPATION_SHARE}%`), owner);
  for (const b of BRACKETS) {
    ok(`the ${b.key} bracket's share is the real one`, owner.includes(`${b.share}%`), owner);
  }
  ok("the number of setup steps is the real one",
    gamer.includes(String(UNLOCK_STEPS)), gamer);
  ok("the US reporting line is the real one",
    gamer.includes(US_REPORT_THRESHOLD.toLocaleString("en-US")), gamer);
}

console.log("\n== the promises we must not overstate ==");
{
  // Every line is a promise. C3 deleted the tier percentage because a rate on a
  // badge is a rate we are held to; the same applies here.
  const owner = RULES.owner.map((r) => `${r.rule} ${r.why}`).join(" ");
  ok("no per-challenge rate is promised to owners",
    !/\b\d+%\s*(of|share of)\s*(each|every|the)\s*challenge/i.test(owner), owner);
  ok("nothing guarantees an amount",
    !/guaranteed|you will earn \$|at least \$/i.test(owner), owner);

  const brand = RULES.brand.map((r) => `${r.rule} ${r.why}`).join(" ");
  ok("reach is described as an estimate", /estimate/i.test(brand));
  ok("…and the thing they are billed against is named",
    /delivery ledger|what actually landed/i.test(brand), brand);
}

console.log("\n== the rules that exist because the product does ==");
{
  const gamer = RULES.gamer.map((r) => `${r.rule} ${r.why}`).join(" ");
  // B91: joinable at announcement, scored from the start line. It is the least
  // obvious rule in the product and the one most likely to generate a "why is
  // my score zero" message.
  ok("early joining is explained", /announced/i.test(gamer) && /until it starts/i.test(gamer), gamer);
  // B89.2: country is mandatory, and the reason is redemption eligibility.
  ok("the country requirement is explained by what it decides",
    /country/i.test(gamer) && /(money|redeem|cash)/i.test(gamer), gamer);

  const owner = RULES.owner.map((r) => `${r.rule} ${r.why}`).join(" ");
  // B90.7: the asymmetry that owners will ask about.
  ok("private challenges are said not to count for the pool",
    /private challenge/i.test(owner) && /does not count/i.test(owner), owner);
  ok("…while the members they bring in do",
    /grows you, it does not pay you twice/i.test(owner), owner);
}

console.log("\n== the visual guide shows the same product the rules describe ==");
{
  // B119 put a walkable journey and two diagrams above the rule list. Both are
  // built from the same modules the rules import, so the risk is not that a
  // number drifts — it is that the PATH drifts: a step nobody can take, a page
  // that has moved, or an audience quietly left with three steps while the
  // other two got eight.
  const { JOURNEYS, MONEY_FLOW, LIFECYCLE } = await import("../../lib/journeys.ts");
  const { readFileSync, existsSync } = await import("node:fs");
  const { DEFAULT_SPLIT } = await import("../../lib/vaults.ts");
  const { STAGE_ORDER } = await import("../../lib/challenge-stage.ts");

  for (const who of ["gamer", "owner", "brand"] as const) {
    const steps = JOURNEYS[who];
    ok(`${who}: the journey has enough steps to be a path`, steps.length >= 5, String(steps.length));
    ok(`…every step says what happens`, steps.every((s) => s.body.trim().length > 40));
    // The helper line is the reason this component exists. Most steps carry
    // one; a journey where none do is a journey that became a list of titles.
    const helped = steps.filter((s) => (s.helper ?? "").length > 30).length;
    ok(`…and most steps carry the sentence that stops them going wrong`,
      helped >= Math.ceil(steps.length * 0.6), `${helped} of ${steps.length}`);
    // A step pointing at a route that does not exist is a dead end in a guide,
    // which is worse than no link: it is the one place a lost reader clicks.
    const dead = steps.filter((s) => s.href && !s.href.includes("[")).filter((s) => {
      const p = `app${s.href}/page.tsx`;
      return !existsSync(new URL(`../../${p}`, import.meta.url));
    });
    ok(`…and every link goes somewhere real`, dead.length === 0,
      dead.map((s) => s.href).join(", "));
  }

  // The split is READ, never drawn. A guide with the percentages painted into
  // its bar widths would be wrong the day an operator moves the switch — and
  // this is the number the whole pitch rests on.
  for (const v of MONEY_FLOW) {
    ok(`the ${v.key} share matches the vault split`, v.pct === DEFAULT_SPLIT[v.key],
      `guide ${v.pct}%, vaults ${DEFAULT_SPLIT[v.key]}%`);
  }
  ok("…and the four shares total 100",
    MONEY_FLOW.reduce((n, v) => n + v.pct, 0) === 100);

  const flow = readFileSync("components/rules/MoneyFlow.tsx", "utf8");
  ok("the bar is drawn from the shares, not from fixed widths",
    /\$\{\(v\.pct \/ total\) \* 100\}%/.test(flow),
    "a hardcoded width is a share that lies the day the split changes");

  // The lifecycle is the stage machine, not a second copy of it.
  ok("the lifecycle shows every rung the product has",
    LIFECYCLE.length === STAGE_ORDER.length && LIFECYCLE.every((s, i) => s.key === STAGE_ORDER[i]),
    LIFECYCLE.map((s) => s.key).join(" → "));
  const life = readFileSync("components/rules/Lifecycle.tsx", "utf8");
  ok("…and both gates are called out", /Announced<\/b> is the first gate/.test(life) && /Live<\/b> is the second/.test(life));

  // The page has to actually render all three, or this is a suite guarding
  // components nobody reaches.
  const page = readFileSync("app/rules/[who]/page.tsx", "utf8");
  for (const c of ["Journey", "MoneyFlow", "Lifecycle"]) {
    ok(`the guide renders ${c}`, new RegExp(`<${c}[\\s/>]`).test(page));
  }
  ok("…and the rules are still on it in full", /rulesByTopic\(audience\)/.test(page),
    "the diagrams are an addition to the fine print, not a replacement for it");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
