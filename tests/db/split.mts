/**
 * How one challenge's money divides. B87 — C2 first.
 *
 * The defect this file is built around: `prizePool` was $175, a fixed dollar
 * figure, and the percentage we PUBLISH was derived from it. So the price was a
 * dial that silently moved the promise. At $350 it read 50% by coincidence. At
 * $400 it would have read 44% — on pages that say half of what a brand pays
 * reaches the players who win, with nothing anywhere to notice.
 *
 * Every assertion here is therefore a sweep across prices rather than a check of
 * one number. A single-price test would have passed against the broken version.
 *
 *   DEMO_DB=1 npx tsx tests/db/split.mts
 */
process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const near = (name: string, got: number, want: number, tol = 0.011) =>
  ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}`);

const {
  PRICING_DEFAULTS, buildPricing, derivePrizes, prizeSharePct,
  marginPerChallenge, PRICING_NUMBER_KEYS,
} = await import("../../lib/pricing.ts");
const { DEFAULT_SPLIT, SPLIT_PRESETS, VAULTS, splitProblems, allocate } =
  await import("../../lib/vaults.ts");

const PRICES = [100, 250, 333, 350, 400, 999, 1250];

console.log("== the published share does not move when the price does ==");
{
  for (const challengePrice of PRICES) {
    const cfg = derivePrizes({ ...PRICING_DEFAULTS, challengePrice });
    ok(`$${challengePrice} still says ${PRICING_DEFAULTS.prizePct}%`,
      prizeSharePct(cfg) === PRICING_DEFAULTS.prizePct, `${prizeSharePct(cfg)}%`);
    near(`…and the pool is actually that share of it`,
      cfg.prizePool, challengePrice * (PRICING_DEFAULTS.prizePct / 100));
  }
  // The regression itself, stated as the thing that must NOT happen: the old
  // code kept $175 and let the percentage fall out of it.
  const dearer = derivePrizes({ ...PRICING_DEFAULTS, challengePrice: 400 });
  ok("raising the price raises the prize rather than cutting the share",
    dearer.prizePool > PRICING_DEFAULTS.prizePool, `${dearer.prizePool}`);
}

console.log("\n== the podium always adds back to the pool, exactly ==");
{
  for (const challengePrice of PRICES) {
    const c = derivePrizes({ ...PRICING_DEFAULTS, challengePrice });
    // Not "roughly". Three independently rounded percentages lose cents, and a
    // pool that does not equal its prizes is precisely what C15 exists to catch.
    ok(`$${challengePrice}: ${c.prize1} + ${c.prize2} + ${c.prize3} = ${c.prizePool}`,
      Math.abs(c.prize1 + c.prize2 + c.prize3 - c.prizePool) < 0.005);
    ok("…and first place beats second beats third",
      c.prize1 > c.prize2 && c.prize2 > c.prize3);
  }
  // The weights are what keep it exact — 4:2:1 is 100/50/25 at a $175 pool, and
  // stays whole at prices where percentages would not.
  const c = derivePrizes({ ...PRICING_DEFAULTS, challengePrice: 350 });
  near("the historical podium survives the change", c.prize1, 100);
  near("…second", c.prize2, 50);
  near("…third", c.prize3, 25);
}

console.log("\n== a derived field cannot be set by hand ==");
{
  // An admin input that accepts a value and then silently overwrites it is
  // worse than no input. `prizePool` was editable; a row left over from then
  // must not win over the percentage.
  for (const k of ["prizePool", "prize1", "prize2", "prize3"]) {
    ok(`pricing.${k} is not an admin field`, !PRICING_NUMBER_KEYS.includes(`pricing.${k}`));
  }
  const built = buildPricing({ "pricing.challengePrice": "400", "pricing.prizePool": "175" });
  near("a stale prizePool row is ignored", built.prizePool, 200);
  ok("…and the share is still the configured one", prizeSharePct(built) === 50);
  // The percentage IS editable, and moves everything under it.
  const generous = buildPricing({ "pricing.challengePrice": "350", "pricing.prizePct": "60" });
  near("raising the percentage raises the pool", generous.prizePool, 210);
  near("…and the platform's share falls by the same amount", marginPerChallenge(generous), 140);
}

console.log("\n== the split totals 100, at every preset ==");
{
  for (const [name, split] of Object.entries(SPLIT_PRESETS)) {
    const problems = splitProblems(split);
    ok(`preset "${name}" is a valid split`, problems.length === 0, problems.join(" "));
    ok(`…and holds the prize half fixed`, split.prize === 50, String(split.prize));
  }
  ok("a split that does not total 100 is refused",
    splitProblems({ prize: 50, cluster: 20, server: 15, cp: 10 }).length > 0);
  ok("…and so is a negative share",
    splitProblems({ prize: 110, cluster: 20, server: -15, cp: -15 }).length > 0);
}

console.log("\n== every dollar a brand pays lands in exactly one vault ==");
{
  for (const price of PRICES) {
    const a = allocate(price, DEFAULT_SPLIT);
    const total = VAULTS.reduce((s, v) => s + a[v], 0);
    near(`$${price} allocates to $${total.toFixed(2)}`, total, price, 0.02);
  }
  // The prize vault and the derived pool must agree, or the money we promise
  // and the money we set aside are two different numbers.
  const a = allocate(PRICING_DEFAULTS.challengePrice, DEFAULT_SPLIT);
  near("the prize vault receives exactly the prize pool", a.prize, PRICING_DEFAULTS.prizePool);
}

console.log("\n== C8: a sold challenge's prize is not funded twice ==");
{
  const { finance, FINANCE_DEFAULTS } = await import("../../lib/finance.ts");
  const f = finance();
  const prizes = f.lines.find((l) => l.key === "prizes");
  const cfg = FINANCE_DEFAULTS;
  const perMonth = cfg.games * cfg.challengesPerGamePerMonth;
  const sold = Math.min(perMonth, cfg.brandsConverting * cfg.freeChallengesPerBrand);
  // The house pays for what nobody bought. It used to pay for ALL of them while
  // the model also took 50% of every sale for prizes — the same dollars twice.
  ok("the prizes line covers only unsold challenges",
    Math.abs((prizes?.cash ?? 0) - (perMonth - sold) * PRICING_DEFAULTS.prizePool * cfg.months) < 0.5,
    String(prizes?.cash));
  ok("…and it is smaller than funding every challenge",
    (prizes?.cash ?? 0) < perMonth * PRICING_DEFAULTS.prizePool * cfg.months);
  // The free first month is the one sponsored case we do fund, and it is now
  // cash rather than a toggle that could zero it.
  const brands = f.lines.find((l) => l.key === "brands");
  ok("the free month's prizes are counted as real cash",
    (brands?.cash ?? 0) === cfg.targetBrands * cfg.freeChallengesPerBrand * PRICING_DEFAULTS.prizePool,
    String(brands?.cash));
  ok("…and the unsent invoices are still shown as foregone, not cash",
    (brands?.foregone ?? 0) > 0);
  ok("the switch that hid the double count is gone",
    !("sponsorsUseHouseInventory" in (FINANCE_DEFAULTS as Record<string, unknown>)));
}

console.log("\n== C12: an active gamer is a definition, not a slider ==");
{
  const { vaultGamerDays, vaultRunwayDays, activeGamers } = await import("../../lib/active-gamers.ts");
  const { getDb } = await import("../../lib/db/index.ts");
  // The model's own arithmetic: 15% of $350 = $52.50, at 10,000 CP/$1 and a
  // 500 CP/day ceiling, funds 1,050 gamer-days.
  ok("one $350 challenge funds 1,050 maximal gamer-days",
    vaultGamerDays(52.5, 10000, 500) === 1050, String(vaultGamerDays(52.5, 10000, 500)));
  ok("a zero ceiling divides by nothing rather than by zero", vaultGamerDays(52.5, 10000, 0) === 0);
  // Null, never a big number, when there is nobody to divide by — "we are fine"
  // is the one answer an unmeasured population must not produce.
  ok("runway is null when the population is unmeasured", vaultRunwayDays(52.5, 10000, 500, 0) === null);
  ok("…and a real number when it is not", vaultRunwayDays(52.5, 10000, 500, 100) === 10);

  const counts = await activeGamers(await getDb());
  ok("the count runs against a real database", Number.isFinite(counts.day));
  ok("…and every window is a subset of the wider one",
    counts.day <= counts.week && counts.week <= counts.month && counts.month <= counts.everEarned,
    JSON.stringify(counts));
  ok("…and the rate is null rather than 0 when nobody has earned",
    counts.everEarned > 0 ? counts.dailyActiveRate !== null : counts.dailyActiveRate === null);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
