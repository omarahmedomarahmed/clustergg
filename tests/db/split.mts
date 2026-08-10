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
  marginPerChallenge, paidOutPerChallenge, PRICING_NUMBER_KEYS, quote: quoteOf,
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
  // B120. This asserted 140 — `price − prizePool` — and that is not our share.
  // A sale divides FOUR ways: the prize pool, the server pool at 15%, the
  // points vault at 15%, and us. At a 60% prize share we keep 10% of $350.
  // The old number was on the investor deck under the words "gross margin".
  near("…and the platform's share falls by the same amount", marginPerChallenge(generous), 35);
  near("…while everything owed to somebody else is the rest", paidOutPerChallenge(generous), 315);
  // At the standard rate card we keep the cluster vault's 20%, not half.
  near("our share of a standard challenge is the cluster vault's",
    marginPerChallenge(PRICING_DEFAULTS), PRICING_DEFAULTS.challengePrice * 0.20);
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

console.log("\n== B120: our share is the cluster vault, not everything that is not a prize ==");
{
  const { finance, levers, FINANCE_DEFAULTS } = await import("../../lib/finance.ts");
  const { platformSharePct, obligationSharePct } = await import("../../lib/vault-split.ts");

  // THE ERROR THIS BLOCK EXISTS FOR.
  //
  // `marginPerChallenge` returned `price − prizePool` and the investor deck
  // printed it under the words "gross margin per challenge". A sale divides
  // FOUR ways: the prize pool, the server pool, the points vault and us. Two of
  // those three obligations were being counted as our money — the deck showed a
  // margin two and a half times the real one, and the financial model computed
  // contribution per brand the same wrong way underneath it.
  const price = PRICING_DEFAULTS.challengePrice;
  near("our share of a challenge is the cluster vault's share",
    marginPerChallenge(PRICING_DEFAULTS), price * (platformSharePct() / 100));
  ok("…which is well under what is NOT prize money",
    marginPerChallenge(PRICING_DEFAULTS) < price - PRICING_DEFAULTS.prizePool,
    `${marginPerChallenge(PRICING_DEFAULTS)} vs ${price - PRICING_DEFAULTS.prizePool}`);
  near("…and everything owed to somebody else is the rest",
    paidOutPerChallenge(PRICING_DEFAULTS), price * (obligationSharePct() / 100));
  near("the two halves add back to the price",
    marginPerChallenge(PRICING_DEFAULTS) + paidOutPerChallenge(PRICING_DEFAULTS), price);

  // The same correction, downstream. Contribution per brand must be our SHARE
  // of what they pay, not their payment minus the prize.
  const f = finance();
  const cfg = FINANCE_DEFAULTS;
  near("contribution per brand is our share of what they pay",
    f.unit.contributionPerBrand, cfg.revenuePerBrand * (marginPerChallenge(PRICING_DEFAULTS) / price));
  near("…so gross margin is the cluster vault's percentage",
    f.unit.grossMarginPct, platformSharePct());
  ok("…and it is not the old, flattering figure",
    f.unit.contributionPerBrand < cfg.revenuePerBrand - cfg.freeChallengesPerBrand * PRICING_DEFAULTS.prizePool);

  // What a brand pays must be a rate we can actually invoice. It sat at $1,500
  // while one game of challenges billed at $1,400.
  near("a paying brand pays a rate the rate card can produce",
    cfg.revenuePerBrand, PRICING_DEFAULTS.challengePrice * PRICING_DEFAULTS.challengesPerGame);

  // Unit economics have to be present and sane, or the round is priced on
  // nothing. A payback longer than the runway means the plan cannot compound.
  ok("payback is inside the raise's runway",
    f.unit.paybackMonths > 0 && f.unit.paybackMonths < cfg.months,
    `${f.unit.paybackMonths} months against ${cfg.months}`);
  ok("LTV covers CAC more than once", f.unit.ltvToCac > 1, String(f.unit.ltvToCac));
  ok("…and the churn behind LTV is stated rather than hidden",
    f.unit.assumedMonthlyChurnPct > 0 && f.unit.lifetimeMonths === 100 / f.unit.assumedMonthlyChurnPct);
  // CAC is measured against brands that STAYED. Dividing by everyone who took a
  // free month is the flattering version and it hides a conversion problem.
  ok("CAC counts only the brands that converted",
    f.unit.cacBrand > (cfg.targetBrands * cfg.freeChallengesPerBrand * PRICING_DEFAULTS.prizePool) / cfg.targetBrands,
    String(f.unit.cacBrand));

  // The raise has to be SPENT. Selling equity for cash that sits in the account
  // is the one cost a founder cannot recover.
  ok("most of the raise is allocated", f.cashTotal > cfg.raise * 0.85,
    `${f.cashTotal} of ${cfg.raise}`);
  ok("…and it is not overspent", f.buffer >= 0, String(f.buffer));

  // The base case may not be the heroic one. 83% free-to-paid was the plan;
  // an investor discounts that to nothing and everything built on it with it.
  ok("the base case assumes at most half of brands convert",
    cfg.brandsConverting / cfg.targetBrands <= 0.5,
    `${cfg.brandsConverting} of ${cfg.targetBrands}`);

  // ===== THE CAPACITY CONSTRAINT =====
  //
  // A game runs ONE sponsored challenge at a time and a campaign is four
  // consecutive weekly challenges — one month on one game. So a game serves one
  // paying brand per month and the network serves `games ÷ gamesPerPayingBrand`
  // of them.
  //
  // The plan projected 22 paying brands against six games. Every figure built
  // on that — MRR, ARR, the valuation multiple, breakeven — was revenue the
  // network had no inventory to deliver, and the house prize line read ZERO
  // because 22 brands "bought" 88 challenges out of a network that runs 24. The
  // plan looked cheapest exactly where it was least deliverable.
  ok("the capacity ceiling is games divided by games per brand",
    f.payingBrandCapacity === Math.floor(cfg.games / Math.max(1, cfg.gamesPerPayingBrand)),
    `${f.payingBrandCapacity} against ${cfg.games} games`);
  ok("paying brands never exceed it", f.exit.payingBrands <= f.payingBrandCapacity,
    `${f.exit.payingBrands} of ${f.payingBrandCapacity}`);
  ok("…and MRR is built from what fits, not from what converts",
    Math.abs(f.exit.mrr - f.exit.payingBrands * cfg.revenuePerBrand) < 0.5,
    `${f.exit.mrr}`);
  ok("no month projects more sponsors than slots",
    f.months.every((m) => m.payingBrands <= f.payingBrandCapacity),
    f.months.map((m) => m.payingBrands).join(","));

  // Onboarding more brands than the network can serve is cash spent on brands
  // we would have to turn away.
  ok("the funnel is sized to the slots, not past them",
    cfg.brandsConverting <= f.payingBrandCapacity,
    `${cfg.brandsConverting} converting against ${f.payingBrandCapacity} slots`);

  // Prove the ceiling BINDS: starve the games and revenue must fall, whatever
  // conversion says. An assertion that only holds at the planned numbers is not
  // an assertion about the model.
  {
    const starved = finance({ ...cfg, games: 2 });
    ok("halving the games halves the revenue, whatever converts",
      starved.exit.mrr < f.exit.mrr && starved.capacityBound,
      `${starved.exit.mrr} at capacity ${starved.payingBrandCapacity}`);
    const flooded = finance({ ...cfg, targetBrands: cfg.targetBrands * 4, brandsConverting: cfg.brandsConverting * 4 });
    ok("…and quadrupling the brands does not, once the slots are full",
      flooded.exit.mrr === f.exit.mrr,
      `${flooded.exit.mrr} vs ${f.exit.mrr}`);
  }

  // Every lever re-runs the model rather than asserting a number, so a lever
  // that moves nothing reports zero instead of a hope.
  const ls = levers();
  ok("there are levers, and they are measured", ls.length >= 4);
  ok("…at least one moves ARR materially", ls.some((l) => l.deltaArr > f.exit.arr * 0.2),
    ls.map((l) => `${l.key}:${l.deltaArr}`).join(" "));
  ok("…and every one says whether the raise still survives",
    ls.every((l) => typeof l.survives === "boolean"));
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

console.log("\n== C6: one to four challenges, and four is a default not a floor ==");
{
  const { campaignQuote, clampSlots, slotWindows, freshSlots, MIN_SLOTS, MAX_SLOTS } =
    await import("../../lib/sponsored-campaigns.ts");
  // The defect: `Math.max(4, slots)` meant asking for two sold and BILLED four.
  for (const n of [1, 2, 3, 4]) {
    const q = campaignQuote(PRICING_DEFAULTS, n);
    ok(`${n} week${n === 1 ? "" : "s"} quotes ${n}`, q.slots === n, String(q.slots));
    ok("…and the bill is that many challenges", q.total === PRICING_DEFAULTS.challengePrice * n, String(q.total));
    ok("…and that many windows are drawn", slotWindows(new Date(Date.UTC(2026, 0, 5)), n).length === n);
    ok("…and that many slots are created", freshSlots(new Date(Date.UTC(2026, 0, 5)), n).length === n);
  }
  ok("zero is not a package", clampSlots(0) === MIN_SLOTS);
  ok("…and neither is nine", clampSlots(9) === MAX_SLOTS);
  ok("junk falls back rather than clamping upward from NaN", clampSlots(NaN as number) === 4);
}

console.log("\n== C7: a package can be a mix of games ==");
{
  const { freshSlots, gameOfSlot, campaignGames } = await import("../../lib/sponsored-campaigns.ts");
  const slots = freshSlots(new Date(Date.UTC(2026, 0, 5)), 3, null, ["Chess", null, "Dota 2"]);
  ok("each week carries its own game", slots[0].game === "Chess" && slots[2].game === "Dota 2");
  // A blank week is the lead game, not a gap — which is also every campaign
  // bought before mixed packages existed.
  ok("a blank week falls back to the lead game", gameOfSlot(slots[1], "Chess") === "Chess");
  ok("…and so does a slot with no game field at all",
    gameOfSlot({ index: 0, startAt: "", endAt: "", status: "waiting" }, "Chess") === "Chess");
  const games = campaignGames({ game: "Chess", slotState: slots });
  ok("the campaign lists its distinct games in week order",
    JSON.stringify(games) === JSON.stringify(["Chess", "Dota 2"]), JSON.stringify(games));
  ok("a campaign with no slots still names its game",
    JSON.stringify(campaignGames({ game: "Chess", slotState: [] })) === JSON.stringify(["Chess"]));
}

console.log("\n== C13: money reaches a vault only when it has ARRIVED ==");
{
  const { getDb, schema } = await import("../../lib/db/index.ts");
  const { allocateInvoice, reverseInvoiceAllocation, balances, currentSplit } =
    await import("../../lib/vaults.ts");
  const { eq: sqlEq, and: sqlAnd } = await import("drizzle-orm");
  const { uid } = await import("../../lib/utils.ts");
  const db = await getDb();

  const mkInvoice = async (status: string, qty: number, unit: number) => {
    const [brand] = await db.select({ id: schema.brands.id }).from(schema.brands).limit(1);
    const id = uid();
    await db.insert(schema.brandInvoices).values({
      id, brandId: brand.id, number: `T-${id.slice(0, 6)}`, status,
      currency: "USD", periodLabel: "test", issuedAt: new Date(), dueAt: new Date(),
      payToken: uid(), ...(status === "paid" ? { paidAt: new Date() } : {}),
    });
    await db.insert(schema.invoiceLines).values({
      id: uid(), invoiceId: id, kind: "campaign", label: "test",
      quantity: qty, unitAmount: unit, sortOrder: 0,
    });
    return id;
  };
  const rowsFor = (id: string) => db.select({ vault: schema.vaultLedger.vault, amount: schema.vaultLedger.amount })
    .from(schema.vaultLedger)
    .where(sqlAnd(sqlEq(schema.vaultLedger.refType, "invoice"), sqlEq(schema.vaultLedger.refId, id)));

  // An invoice that has been SENT is a promise. Allocating it would fill the
  // vaults with money nobody sent, and every payout would draw on that.
  const unpaid = await mkInvoice("sent", 4, 350);
  ok("an unpaid invoice allocates nothing", (await allocateInvoice(db, unpaid)) === null);
  ok("…and writes no rows", (await rowsFor(unpaid)).length === 0);

  const before = await balances(db);
  const paid = await mkInvoice("paid", 4, 350);
  const res = await allocateInvoice(db, paid);
  ok("a paid invoice allocates", !!res);
  ok("…at its LINES, not a stored total", res?.total === 1400, String(res?.total));
  const rows = await rowsFor(paid);
  ok("…as one row per vault", rows.length === 4, String(rows.length));
  const sum = rows.reduce((a, r) => a + Number(r.amount), 0);
  near("…summing to every cent of the invoice", sum, 1400, 0.005);

  const split = await currentSplit(db);
  const prizeRow = rows.find((r) => r.vault === "prize");
  near("the prize vault gets its share", Number(prizeRow?.amount), 1400 * (split.prize / 100));

  const after = await balances(db);
  near("balances moved by exactly that", after.prize - before.prize, 1400 * (split.prize / 100));

  // Two admin actions and a webhook can all mark the same invoice paid.
  ok("a second allocation is refused", (await allocateInvoice(db, paid)) === null);
  ok("…and no fifth row appeared", (await rowsFor(paid)).length === 4);

  // Un-paying REVERSES, never deletes — a ledger you can delete from is one
  // nobody can reconcile.
  ok("reversing works", (await reverseInvoiceAllocation(db, paid)) === true);
  const reversed = await rowsFor(paid);
  ok("…by adding rows rather than removing them", reversed.length === 8, String(reversed.length));
  near("…leaving a net of zero", reversed.reduce((a, r) => a + Number(r.amount), 0), 0, 0.005);
  ok("…and reversing twice does nothing", (await reverseInvoiceAllocation(db, paid)) === false);
}

console.log("\n== C15: a challenge is checked against what it promised ==");
{
  const { promisedPool, reconcilePrizes, needsAttention } = await import("../../lib/prize-reconcile.ts");
  // The pool is a percentage of what the brand paid for THIS challenge.
  near("a $350 challenge promises $175", promisedPool(350, 50), 175);
  near("…and an unsponsored one promises nothing", promisedPool(0, 50), 0);

  const good = reconcilePrizes({ promised: 175, awarded: 175 });
  ok("a matching podium is quiet", good.verdict === "matches" && !needsAttention(good));
  // The two failures that had no detector at all.
  const under = reconcilePrizes({ promised: 175, awarded: 40 });
  ok("under-awarding is caught", under.verdict === "under" && needsAttention(under));
  ok("…and the note names both numbers", /175/.test(under.note) && /40/.test(under.note), under.note);
  const over = reconcilePrizes({ promised: 175, awarded: 400 });
  ok("over-awarding is caught", over.verdict === "over" && needsAttention(over));
  ok("…and says the vault was not funded for it", /vault/.test(over.note), over.note);

  // A house-funded challenge has no brand money to reconcile against, which is
  // not the same as promising zero and awarding zero.
  const house = reconcilePrizes({ promised: 0, awarded: 25 });
  ok("an unsponsored challenge is not a discrepancy",
    house.verdict === "unfunded" && !needsAttention(house));

  // Trophies are whole dollars; a pool is a percentage of a price. $333 × 50%
  // is $166.50 and no set of dollar trophies lands on it.
  ok("a dollar of slack is allowed",
    reconcilePrizes({ promised: 166.5, awarded: 166 }).verdict === "matches");
  ok("…but not two", reconcilePrizes({ promised: 166.5, awarded: 164 }).verdict === "under");
}

console.log("\n== C1: the CP dial, delivered the one safe way ==");
{
  const { planCpDial, missionEligibleActions, affordableCeiling } = await import("../../lib/cp-dial.ts");
  const { ACTION_CATALOG } = await import("../../lib/quests.ts");

  const eligible = new Set(missionEligibleActions());
  ok("the eligible set is read from the mission templates", eligible.size > 0);
  // The actions a mission never asks for keep their price. They are paid for
  // being rare, and scaling them would make a milestone cheaper on a quiet
  // month.
  const oneOffs = ACTION_CATALOG.filter((a) => !eligible.has(a.key) && a.defaultWeight > 0);
  const plan = planCpDial(250);
  ok("halving the ceiling rescales mission actions", Object.keys(plan.weights).length > 0);
  ok("…and touches no one-off action",
    oneOffs.every((a) => !(a.key in plan.weights)), Object.keys(plan.weights).join(","));
  ok("…and names the ones it left alone", plan.untouched.length === oneOffs.length);
  ok("the ceiling is the number asked for", plan.ceiling === 250);
  // The table should be able to REACH the ceiling without wildly overshooting:
  // a table paying 4x the ceiling means prices stop meaning anything.
  // The MISSION lands on the ceiling — that is the number a gamer is shown and
  // chases. The whole table can still pay more, because nobody maxes every
  // action every day and the ceiling is what bounds the worst case.
  ok("…and a mission is worth exactly it",
    Math.abs(plan.missionTotal - 250) <= 12, String(plan.missionTotal));
  ok("…while the table can still pay more than one mission",
    plan.eligibleCapSum >= plan.missionTotal, `${plan.eligibleCapSum} vs ${plan.missionTotal}`);

  // Nothing is scaled to zero. A retired action still listed in a mission is a
  // task worth nothing that a gamer is being asked to do.
  const tiny = planCpDial(1);
  ok("no mission action is scaled out of existence",
    Object.values(tiny.weights).every((w) => w >= 1), JSON.stringify(tiny.weights));

  const same = planCpDial(500);
  ok("asking for what is already set moves nothing", Object.keys(same.weights).length === 0, JSON.stringify(same.weights));
  ok("a zero ceiling says plainly that nothing earns", /nothing earns/.test(planCpDial(0).note));

  // The other direction: what the vault can afford.
  ok("the affordable ceiling divides the vault by gamers and days",
    affordableCeiling({ vaultDollars: 52.5, cpPerDollar: 10000, dailyActiveGamers: 100, days: 7 }) === 750);
  ok("…and is null when nobody is measured",
    affordableCeiling({ vaultDollars: 52.5, cpPerDollar: 10000, dailyActiveGamers: 0, days: 7 }) === null);

  // The mechanism the model rejected, asserted as still rejected.
  const { readFileSync } = await import("node:fs");
  const missions = readFileSync(new URL("../../lib/missions.ts", import.meta.url), "utf8");
  ok("a mission still awards no CP of its own",
    /a mission awards no CP[\s\S]{0,12}of its own/i.test(missions));
}

console.log("\n== C1: the dial is now connected to something ==");
{
  // `lib/cp-dial.ts` shipped with C1 and nothing called it, so the ceiling was
  // only movable by editing a settings row by hand. `applyCpDial` is the caller.
  // These assertions are on the ACTION's source, matching how every other
  // server action in this suite is checked — the action itself needs a session
  // and a request, which is a browser test's job, not this one's.
  const { readFileSync } = await import("node:fs");
  const dial = readFileSync(new URL("../../app/actions/cp-dial.ts", import.meta.url), "utf8");

  ok("something applies the plan", /export async function applyCpDial/.test(dial));
  ok("moving the ceiling is admin-only, not staff",
    /requireSystemFor\("\/admin\/cp"\)/.test(dial) && /access\.isAdmin/.test(dial));

  // The C6 defect, in the one place it would be most expensive: `Number(x) || d`
  // treats 0 as unset, and 0 is a REAL target here — it is how you stop the
  // economy without deleting it. A fallback would have silently reopened it.
  ok("a ceiling of zero is a target, not a missing value",
    /Number\.isFinite\(target\)/.test(dial) && !/Number\(formData\.get\("ceiling"\)\)\s*\|\|/.test(dial));
  ok("…and a change needs a stated reason", /Say why/.test(dial));

  // The plan is recomputed on the server from the LIVE quest weights. A form
  // that posted its own weights is a form somebody can post different ones
  // through, and a plan computed from ACTION_CATALOG defaults would be a plan
  // for a configuration nobody is running.
  ok("the plan is recomputed server-side", /planCpDial\(target, current\)/.test(dial));
  ok("…from the quests, not the catalogue defaults",
    /db\.select\(\)\.from\(schema\.quests\)/.test(dial));
  ok("…and no weight is read out of the form",
    !/formData\.get\("weight/.test(dial) && !/plan\s*=\s*JSON\.parse/.test(dial));

  // A quest that does not pay an action must not START paying it because the
  // dial moved. Writing the whole plan onto every quest would do exactly that.
  ok("a quest that does not pay an action is not given one",
    /this quest does not pay it/.test(dial));
  ok("…and only mission-eligible actions are written",
    /missionEligibleActions/.test(dial));

  // Both halves in one call. Either alone breaks the model.
  ok("the ceiling and the weights move together",
    /quests\.dailyCpCeiling/.test(dial) && /schema\.quests\)\.set\(\{ actionWeights/.test(dial));
  ok("the change is audited with its before and after", /auditChange\(/.test(dial));
  // The gamer-facing page reads the ceiling. Revalidating only the admin pages
  // would leave a gamer looking at yesterday's number.
  ok("the gamer's quests page is revalidated too", /revalidatePath\("\/quests"\)/.test(dial));
}

console.log("\n== C10: weekly and the hold are one sentence ==");
{
  const { PAYOUT_HOLD_DAYS, PAYOUT_HOLD_PHRASE } = await import("../../lib/abuse.ts");
  const { readFileSync } = await import("node:fs");
  const raw = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

  ok("the phrase names the hold", PAYOUT_HOLD_PHRASE.includes(String(PAYOUT_HOLD_DAYS)));
  ok("…and the word weekly", /weekly/i.test(PAYOUT_HOLD_PHRASE));
  // One constant, not four hand-written variants — the contradiction was found
  // because two pages said different things.
  for (const f of ["components/ServerPortal.tsx", "lib/discord/screens.ts", "app/admin/growth-review/page.tsx"]) {
    ok(`${f} uses the shared sentence`, /PAYOUT_HOLD_PHRASE/.test(raw(f)));
  }
}

console.log("\n== C11: the three-tier rate card is retired ==");
{
  ok("no placements base is charged", PRICING_DEFAULTS.reachBase === 0);
  ok("…nor a challenge-tier base", PRICING_DEFAULTS.challengeBase === 0);
  ok("…nor an ultimate base", PRICING_DEFAULTS.ultimateBase === 0);
  ok("…and the broadcast comes with the package", PRICING_DEFAULTS.streamAddon === 0);

  // A $0 line is not "free, stated" — it is a row that makes an invoice look
  // padded. It must be omitted, and must come back if somebody prices it up.
  const { draftLines } = await import("../../lib/invoices.ts");
  const free = draftLines({ games: 1, gameNames: ["Chess"], addon: true, cfg: PRICING_DEFAULTS });
  ok("no zero-value base line is drafted", !free.some((l) => l.kind === "base"));
  ok("…and no zero-value add-on line", !free.some((l) => l.kind === "addon"));
  ok("the challenges themselves are still billed", free.some((l) => l.kind === "game"));
  const priced = draftLines({ games: 1, addon: true, cfg: { ...PRICING_DEFAULTS, reachBase: 600, streamAddon: 400 } });
  ok("pricing a base back up brings its line back", priced.some((l) => l.kind === "base"));
  ok("…and the add-on too", priced.some((l) => l.kind === "addon"));

  // The package itself still prices: one to four challenges on a game.
  const q = quoteOf(PRICING_DEFAULTS, { games: 1 });
  ok("a one-game month is challenges only",
    q.monthly === PRICING_DEFAULTS.challengePrice * PRICING_DEFAULTS.challengesPerGame, String(q.monthly));
}

console.log("\n== C14: breakage is measured, never banked ==");
{
  const { measureBreakage, reachedGamersPct, CANNOT_REDEEM } = await import("../../lib/breakage.ts");
  const { getDb } = await import("../../lib/db/index.ts");

  // Under-18s hold value they cannot collect, and that includes the legacy
  // band nobody can pick any more but plenty of rows still carry (B95).
  ok("the legacy under-16 band cannot redeem", CANNOT_REDEEM.includes("under16"));
  ok("…and neither can 13-17", CANNOT_REDEEM.includes("teen"));
  ok("…but an adult can", !CANNOT_REDEEM.includes("adult"));

  const b = await measureBreakage(await getDb());
  ok("it runs against a real database", Number.isFinite(b.awarded));
  ok("outstanding is awarded minus redeemed",
    Math.abs(b.outstanding - Math.max(0, b.awarded - b.redeemed)) < 0.02, JSON.stringify(b));
  ok("…and never exceeds what was awarded", b.outstanding <= b.awarded + 0.01);
  ok("the un-collectable share is part of outstanding, not on top",
    b.heldByUnderAge <= b.outstanding + 0.01);

  // The honest version of the headline. Null rather than a comfortable number
  // when nothing has been awarded.
  ok("the reached-gamers rate is null before anything is awarded",
    reachedGamersPct({ ...b, awarded: 0 }, 50) === null);
  ok("…and is the promised share scaled by what was actually collected",
    reachedGamersPct({ ...b, awarded: 100, redeemed: 50 }, 50) === 25);

  // The rule the module exists to enforce.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../lib/breakage.ts", import.meta.url), "utf8");
  ok("the file states that breakage is never banked", /never banked/i.test(src));
  ok("…and refuses to invent an expiry", /does not today/i.test(src));
  // Nothing may sweep the prize vault into revenue.
  const vaults = readFileSync(new URL("../../lib/vaults.ts", import.meta.url), "utf8");
  ok("no code sweeps prizes into the Cluster vault",
    !/from: "prize"[\s\S]{0,80}to: "cluster"/.test(vaults));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
