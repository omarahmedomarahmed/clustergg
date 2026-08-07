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

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
