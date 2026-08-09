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
const { LOCKED_CP_CAP } = await import("../../lib/unlock.ts");
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
  ok("the locked-points cap is the real one",
    gamer.includes(LOCKED_CP_CAP.toLocaleString("en-US")), gamer);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
