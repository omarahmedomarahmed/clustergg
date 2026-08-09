/**
 * B88.2 + B88.3 — the week has a budget, and the ceiling comes out of it.
 *
 * Two numbers used to be typed by a human with no connection to the money
 * behind them: the daily CP ceiling (500, in a settings row) and the server
 * pool (the whole vault, no reserve). Both are now derived from an amount
 * somebody deliberately released for one week.
 *
 * The assertions that matter here are the ones about REFUSAL and about
 * DIRECTION — an allocation that can be lowered after gamers have been shown a
 * ceiling computed from it is worse than no allocation at all, and a ceiling
 * that does not fall when the platform grows is a ceiling that overspends.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { getDb, schema } = await import("../../lib/db/index.ts");
const { uid } = await import("../../lib/utils.ts");
const { postToLedger, balances } = await import("../../lib/vaults.ts");
const {
  setAllocation, allocationFor, lockWeek, weekBudget, weekKeyOf, daysLeftInWeek, weekStartOfDate,
} = await import("../../lib/allocations.ts");
const { planDailyCeiling, CEILING_FLOOR, CEILING_CAP } = await import("../../lib/daily-ceiling.ts");

const db = await getDb();
const ACTOR = "admin-test";

console.log("\n== the week, and the days left in it ==");
{
  const mon = new Date(Date.UTC(2026, 7, 3));      // a Monday
  const sun = new Date(Date.UTC(2026, 7, 9));      // the Sunday after it
  eq("Monday is the start of its own week", weekKeyOf(mon), "2026-08-03");
  eq("…and Sunday belongs to the same week", weekKeyOf(sun), "2026-08-03");
  eq("Monday has the whole week left", daysLeftInWeek(mon), 7);
  eq("Sunday has one day left, never zero", daysLeftInWeek(sun), 1);
  // A divisor of zero on the last day would hand one gamer the whole remaining
  // allocation, which is the single worst arithmetic bug available here.
  ok("no day of the week divides by zero",
    [0, 1, 2, 3, 4, 5, 6].every((d) =>
      daysLeftInWeek(new Date(weekStartOfDate(mon).getTime() + d * 86400_000)) >= 1));
}

console.log("\n== releasing money for a week ==");
const week = weekKeyOf();
{
  // Put money in the vaults first — releasing what has not arrived is the
  // failure this refuses.
  await postToLedger(db, [
    { vault: "cp", amount: 500, kind: "challenge_sale", refType: "test", refId: uid() },
    { vault: "server", amount: 500, kind: "challenge_sale", refType: "test", refId: uid() },
  ]);

  eq("nothing released reads as zero, not as 'all of it'",
    (await allocationFor(db, "cp", "1999-01-04")).amount, 0);

  const r = await setAllocation(db, { vault: "cp", week, amount: 105, actorId: ACTOR, note: "week 1" });
  ok("an admin can release an amount", r.ok, JSON.stringify(r));
  eq("…and it reads back", (await allocationFor(db, "cp", week)).amount, 105);

  // Releasing ZERO is a real instruction — it pauses a week without deleting
  // anything — so it must not be treated as "unset".
  const z = await setAllocation(db, { vault: "cp", week: "1999-01-11", amount: 0, actorId: ACTOR });
  ok("releasing zero is allowed and means zero", z.ok);
  eq("…and reads back as zero", (await allocationFor(db, "cp", "1999-01-11")).amount, 0);

  const tooMuch = await setAllocation(db, { vault: "cp", week, amount: 9_999_999, actorId: ACTOR });
  ok("you cannot release money that has not arrived", !tooMuch.ok);
  ok("…and the refusal says what the vault holds",
    !tooMuch.ok && /vault holds/i.test(tooMuch.error), !tooMuch.ok ? tooMuch.error : "");
}

console.log("\n== a locked week can go up and never down ==");
{
  await lockWeek(db, "cp", week);
  ok("locked", (await allocationFor(db, "cp", week)).locked);

  const down = await setAllocation(db, { vault: "cp", week, amount: 50, actorId: ACTOR });
  ok("lowering a locked week is refused", !down.ok);
  // The REASON matters as much as the refusal. An operator who does not know
  // why will do it in the database instead.
  ok("…and the reason is that people were already shown the number",
    !down.ok && /shown/i.test(down.error), !down.ok ? down.error : "");
  eq("…and nothing changed", (await allocationFor(db, "cp", week)).amount, 105);

  const up = await setAllocation(db, { vault: "cp", week, amount: 200, actorId: ACTOR });
  ok("raising a locked week is allowed — nobody is worse off", up.ok, JSON.stringify(up));
  eq("…and it took", (await allocationFor(db, "cp", week)).amount, 200);
}

console.log("\n== what is NOT released is the reserve ==");
{
  const bank = (await balances(db)).cp;
  const b = await weekBudget(db, "cp");
  eq("allocated is what was released", b.allocated, 200);
  ok("the reserve is the rest of the vault",
    Math.abs(b.reserve - (bank - 200)) < 0.02, `${b.reserve} vs ${bank - 200}`);
  ok("remaining is never negative", b.remaining >= 0, String(b.remaining));
}

console.log("\n== the ceiling comes out of the money ==");
{
  const plan = await planDailyCeiling(db);
  ok("it is bounded below", plan.ceiling >= CEILING_FLOOR || plan.ceiling === 0, String(plan.ceiling));
  ok("…and above", plan.ceiling <= CEILING_CAP, String(plan.ceiling));
  ok("it shows its own arithmetic", /÷/.test(plan.note) || /floor|released|spent/i.test(plan.note), plan.note);
  ok("the divisor is stated, not hidden", typeof plan.eligible === "number");

  // MORE GAMERS, SAME MONEY → A SMALLER CEILING. This is the property the whole
  // design rests on: the platform cannot outgrow its budget.
  const { planDailyCeiling: plan2 } = await import("../../lib/daily-ceiling.ts");
  const before = await plan2(db);
  for (let i = 0; i < 40; i++) {
    const userId = uid();
    await db.insert(schema.users).values({
      id: userId, email: `${userId}@alloc.test`, displayName: `Alloc ${i}`, slug: `alloc-${userId}`,
      passwordHash: "x", ageBand: "adult", role: "user", status: "active",
    }).onConflictDoNothing();
  }
  const after = await plan2(db);
  ok("more gamers on the same money means a smaller ceiling — or the floor",
    after.eligible > before.eligible
      ? (after.ceiling <= before.ceiling || after.ceiling === CEILING_FLOOR)
      : true,
    `${before.eligible}→${after.eligible} gamers, ${before.ceiling}→${after.ceiling} CP`);
}

console.log("\n== a week nobody funded pays nothing, and says so ==");
{
  const far = "2031-01-06";
  await setAllocation(db, { vault: "cp", week: far, amount: 0, actorId: ACTOR });
  const b = await weekBudget(db, "cp", new Date(Date.UTC(2031, 0, 8)));
  eq("nothing released, nothing remaining", b.remaining, 0);

  const plan = await planDailyCeiling(db, new Date(Date.UTC(2031, 0, 8)));
  eq("the ceiling is zero", plan.ceiling, 0);
  // Zero is not a bug and must not read as one. It also must not read as
  // "we took your points" — the actions are still recorded.
  ok("…and it says nothing was released rather than showing an error",
    /released|budget/i.test(plan.note), plan.note);
}

console.log("\n== the manual override still wins ==");
{
  // A derived value with no manual escape is a value nobody can stop during an
  // incident. The override is deliberate, and an override of 0 is real.
  await db.insert(schema.platformSettings)
    .values({ key: "quests.dailyCpCeiling", value: { cp: 777 }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value: { cp: 777 }, updatedAt: new Date() } });
  const { dailyCpCeiling } = await import("../../lib/quests.ts");
  eq("a pinned ceiling is used ahead of the derivation", await dailyCpCeiling(db), 777);

  await db.insert(schema.platformSettings)
    .values({ key: "quests.dailyCpCeiling", value: { cp: 0 }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value: { cp: 0 }, updatedAt: new Date() } });
  eq("…and pinning it to zero stops earning rather than reading as unset",
    await dailyCpCeiling(db), 0);

  // Clean up, so the rest of the suite (and any suite after it) sees the
  // derived value rather than a pin this test left behind.
  await db.delete(schema.platformSettings)
    .where((await import("drizzle-orm")).eq(schema.platformSettings.key, "quests.dailyCpCeiling"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
