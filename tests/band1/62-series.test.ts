// The series builder, and the arithmetic that only runs one way.
//
// ===== THE RULE, AND WHY THE DIRECTION IS THE WHOLE OF IT =====
//
// 05 §2 and 03 §7, in the same words: *"admin enters the **prize**; the system
// computes the **bill** as `prize ÷ 0.5`. Never the reverse, or the split
// drifts."*
//
// "Drifts" is doing real work in that sentence. `splitOf` rounds — prize and
// server to the nearest cent, Cluster taking the remainder — so the mapping
// bill → prize is not injective. Run it backwards and you get *a* bill whose
// forward prize is sometimes a cent off the one you asked for. Which direction
// is authoritative therefore decides **who absorbs the cent**, and 02 §5
// answers it: the prize vault's balance equals the sum of every unredeemed
// money-trophy, so a prize allocation a cent short of its trophies is the
// platform's core promise broken by exactly that cent.
//
// So the prize is the input, the bill is derived, and it rounds **up**.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import { eq as sqlEq } from "drizzle-orm";
import {
  billForPrize,
  planSeries,
  checkTemplates,
  createSeries,
  seriesInstances,
  SeriesRefused,
} from "../../lib/challenges/series.ts";
import { splitOf, CHALLENGE_PRICE_CENTS, formatMoney } from "../../lib/money/amounts.ts";
import { instantiateTemplates, checkPrizePool } from "../../lib/trophies/trophies.ts";
import { isPeriodBoundary } from "../../lib/challenges/week.ts";
import { weekStartPlus } from "../../lib/challenges/week.ts";

// ── The arithmetic ──────────────────────────────────────────────────────────

test("the bill is computed from the prize, and never the other way round", () => {
  // The round trip, on the number the whole product is priced at: a $350
  // challenge buys a $175 prize, so a $175 prize must bill at $350.
  const split = splitOf(CHALLENGE_PRICE_CENTS);
  eq(
    billForPrize(split.prize),
    CHALLENGE_PRICE_CENTS,
    `${formatMoney(split.prize)} of prize bills at ${formatMoney(CHALLENGE_PRICE_CENTS)}`,
  );
});

test("at the shipped split the arithmetic is exact, and that is worth knowing", () => {
  // With a 50% prize share, `prize ÷ 0.5` is `prize × 2` — an integer for every
  // integer prize, so the rounding direction cannot matter and no cent is ever
  // in play. Stated as its own fact, because it is the reason the next test
  // exists: **the shipped configuration cannot exercise the rounding rule.**
  const uneven: number[] = [];
  for (let prize = 1; prize <= 2_000; prize++) {
    if (billForPrize(prize) !== prize * 2) uneven.push(prize);
  }
  eq(uneven, [], "the shipped split divides exactly, every time");
});

test("the bill rounds UP, so a prize is never under-covered by it", () => {
  // ===== THE FIXTURE HAD TO CHANGE BEFORE THIS COULD FAIL =====
  //
  // The first version of this swept prizes against the **shipped** split and
  // asserted `splitOf(billForPrize(p)).prize >= p`. Rounding the bill down
  // instead went green — because at a 50% share ceil and floor are the same
  // number, so the property could not vary. Trap 2 through the fixture rather
  // than the assertion, and trap 27's other face: the break applied, and the
  // test had no way to receive it.
  //
  // 02 §2 is what makes the fix legitimate rather than contrived: *"the shares
  // are an **operator setting**, not a constant hard-coded in the logic."* A
  // 70/15/15 split is a configuration somebody may set, and at that split
  // rounding down under-covers the prize hundreds of times in five thousand.
  //
  // Which matters because 02 §5's invariant is absolute: the prize vault holds
  // exactly the sum of every unredeemed money-trophy. A bill whose prize share
  // is a cent short of the trophies it funds is that promise broken, by that
  // cent, permanently.
  const seventy = { prize: 7_000, server: 1_500, cluster: 1_500 };

  const short: string[] = [];
  for (let prize = 1; prize <= 5_000; prize++) {
    const covered = splitOf(billForPrize(prize, seventy), seventy).prize;
    if (covered < prize) short.push(`${prize}¢ → bill covers only ${covered}¢`);
  }
  eq(short, [], "no prize is ever under-covered by the bill computed from it");

  // And the fixture is proven able to discriminate: at this split the two
  // roundings genuinely differ, so the sweep above is not passing for the same
  // reason the shipped split does.
  let differs = 0;
  for (let prize = 1; prize <= 5_000; prize++) {
    const up = billForPrize(prize, seventy);
    const down = Math.floor((prize * 10_000) / seventy.prize);
    if (up !== down) differs++;
  }
  ok(differs > 1_000, `the two roundings differ on ${differs} of 5,000 prizes here`);
});

test("a prize that cannot be split evenly costs the buyer the cent, not the vault", () => {
  // The smallest concrete case, at a split where it is a real question. A
  // buyer overpaying by a cent is nothing; a prize vault a cent light is the
  // one thing this platform cannot be.
  const seventy = { prize: 7_000, server: 1_500, cluster: 1_500 };
  const bill = billForPrize(2, seventy);
  eq(bill, 3, "2¢ of prize bills at 3¢ at a 70% share");
  ok(splitOf(bill, seventy).prize >= 2, "and the prize share covers the promise");
  ok(
    splitOf(Math.floor((2 * 10_000) / seventy.prize), seventy).prize < 2,
    "where rounding down would not have",
  );
});

test("a negative or impossible prize is refused rather than computed", () => {
  throws(() => billForPrize(-1), /cannot be negative/, "a negative prize is not an input");
  throws(
    () => billForPrize(100, { prize: 0, server: 5_000, cluster: 5_000 }),
    /prize share cannot be zero/,
    "and a zero prize share would divide by nothing",
  );
});

// ── The plan ────────────────────────────────────────────────────────────────

test("a series prize is the instance prize times the count, and the bill follows", () => {
  // 03 §7's worked example, exactly: $5/$3/$2 a day is $10 a day, seven days
  // is $70 of prize, and the bill is $140.
  const plan = planSeries({
    cadence: "daily",
    instances: 7,
    prizePerInstanceCents: 1_000,
    startAt: new Date("2026-09-07T00:00:00Z"),
  });
  eq(plan.seriesPrizeCents, 7_000, "seven days of $10");
  eq(plan.billCents, 14_000, "bills at $140 — prize ÷ 0.5");
  eq(plan.starts.length, 7, "and seven instances");
});

test("every instance starts on a boundary — there is no date picker, for anyone", () => {
  // C5/L6. Enforced in the model rather than in the form, which is what makes
  // it true for a series built by an API call as well as one built by a click.
  const weekly = planSeries({
    cadence: "weekly",
    instances: 4,
    prizePerInstanceCents: 17_500,
    startAt: weekStartPlus(new Date("2026-09-09T13:45:00Z"), 1),
  });
  for (const s of weekly.starts) {
    ok(isPeriodBoundary(s.startAt, "weekly"), `${s.startAt.toISOString()} is a Monday`);
  }
  // And consecutive: a series with a gap is not the thing anybody bought.
  for (let i = 1; i < weekly.starts.length; i++) {
    eq(
      weekly.starts[i].startAt.getTime() - weekly.starts[i - 1].startAt.getTime(),
      7 * 24 * 60 * 60 * 1000,
      "one week apart",
    );
  }
});

test("a series with no prize, or no instances, is refused", () => {
  throws(
    () => planSeries({ cadence: "weekly", instances: 0, prizePerInstanceCents: 100, startAt: new Date() }),
    /at least one/,
    "zero instances is not a series",
  );
  throws(
    () => planSeries({ cadence: "weekly", instances: 1, prizePerInstanceCents: 0, startAt: new Date() }),
    /needs a prize pool/,
    "and a challenge with nothing at stake is not a competition",
  );
});

// ── Templates, and the guard that has to still pass ─────────────────────────

test("three templates become twenty-one trophies, and the guard still passes", async () => {
  // 03 §7 steps 8 and 9, end to end. This is the case the whole template
  // mechanism exists for: hand-making twenty-one of anything is how one ends
  // up with the wrong value and the pool guard fails on a Sunday night.
  const db = await resetDemoDb();
  const plan = planSeries({
    cadence: "daily",
    instances: 7,
    prizePerInstanceCents: 1_000,
    startAt: new Date("2026-09-07T00:00:00Z"),
  });

  const { seriesId, challengeIds, invoiceId } = await createSeries(db, {
    title: "Brand X Daily",
    game: "Chess",
    provider: "chesscom",
    plan,
    places: 3,
    actorId: "admin-1",
  });

  eq(challengeIds.length, 7, "seven instances");
  ok(invoiceId.length > 0, "and one invoice for all of them");

  const templates = [
    { place: 1, name: "Winner", valueCents: 500 },
    { place: 2, name: "Second", valueCents: 300 },
    { place: 3, name: "Third", valueCents: 200 },
  ];
  eq(checkTemplates(templates, plan.prizePerInstanceCents).ok, true, "the templates balance");

  const created = await instantiateTemplates(db, challengeIds, templates);
  eq(created.length, 21, "21 trophies from 3 templates");

  // The real guard, per instance, from the module that will refuse an announce.
  for (const challengeId of challengeIds) {
    const check = await checkPrizePool(db, challengeId);
    ok(check.ok, `${challengeId}: ${formatMoney(check.totalCents)} against the pool`);
  }
});

test("templates that do not add up are refused — over AND under", () => {
  // T2 — *"flag if over **and** under."* Both, because money a brand paid
  // sitting against a challenge with nobody to give it to is as wrong as
  // promising more than the vault holds.
  const over = checkTemplates([{ valueCents: 600 }, { valueCents: 500 }], 1_000);
  no(over.ok, "over is refused");
  eq(over.differenceCents, 100, "by a dollar");
  ok(/more than the prize pool/.test(over.reason ?? ""), `and says so: ${over.reason}`);

  const under = checkTemplates([{ valueCents: 400 }], 1_000);
  no(under.ok, "under is refused too");
  eq(under.differenceCents, -600, "by six dollars");
  ok(/less than the prize pool/.test(under.reason ?? ""), `and says so: ${under.reason}`);

  // The positive half, or a checker that refused everything would pass.
  ok(checkTemplates([{ valueCents: 1_000 }], 1_000).ok, "and an exact match is accepted");
});

// ── One invoice, and the state everything starts in ─────────────────────────

test("a series is billed together and starts as drafts", async () => {
  // C9/B9 — one invoice. Billing each instance separately would let a brand
  // pay for week one and not week four, and 03 §7 is explicit that a late
  // payment shifts the **whole** series rather than starting a partial one.
  const db = await resetDemoDb();
  const plan = planSeries({
    cadence: "weekly",
    instances: 4,
    prizePerInstanceCents: 17_500,
    startAt: weekStartPlus(new Date("2026-09-07T00:00:00Z"), 0),
  });
  const { challengeIds, invoiceId } = await createSeries(db, {
    title: "Acme League",
    game: "Chess",
    provider: "chesscom",
    plan,
    places: 1,
    actorId: "admin-1",
  });

  const instances = await db.select().from(schema.challenges);
  const mine = instances.filter((c) => challengeIds.includes(c.id));
  eq(new Set(mine.map((c) => c.invoiceId)).size, 1, "one invoice across every instance");
  eq(mine[0].invoiceId, invoiceId, "and it is the one we made");

  // L1/C1 — nothing announces itself, and nothing here is even payable yet.
  eq(
    [...new Set(mine.map((c) => c.state))],
    ["pending_payment"],
    "every instance is awaiting payment — none is announced",
  );

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(sqlEq(schema.invoices.id, invoiceId));
  eq(invoice.paidAt, null, "and nothing has been paid");
});

test("a series is ordered, and reads back in order", async () => {
  const db = await resetDemoDb();
  const plan = planSeries({
    cadence: "daily",
    instances: 5,
    prizePerInstanceCents: 500,
    startAt: new Date("2026-09-07T00:00:00Z"),
  });
  const { seriesId } = await createSeries(db, {
    title: "Five Days",
    game: "Chess",
    provider: "chesscom",
    plan,
    places: 1,
    actorId: "admin-1",
  });

  const instances = await seriesInstances(db, seriesId);
  eq(instances.length, 5, "five of them");
  eq(
    instances.map((c) => c.seriesIndex),
    [0, 1, 2, 3, 4],
    "in order, because a series read out of order is a series nobody can set up",
  );
  for (let i = 1; i < instances.length; i++) {
    ok(
      instances[i].startAt.getTime() > instances[i - 1].startAt.getTime(),
      "and each starts after the last",
    );
  }
});

test("a series needs a person, and the log can name them", async () => {
  const db = await resetDemoDb();
  const plan = planSeries({
    cadence: "weekly",
    instances: 1,
    prizePerInstanceCents: 17_500,
    startAt: weekStartPlus(new Date("2026-09-07T00:00:00Z"), 0),
  });
  await throws(
    () =>
      createSeries(db, {
        title: "Nobody Built This",
        game: "Chess",
        provider: "chesscom",
        plan,
        places: 1,
        actorId: "",
      }),
    /built by a person/,
    "a series with no actor is a series nobody can be asked about",
  );
});
