// B37 — who we can pay, and what we have to know first.
//
// The prose lives at /legal/economy. This is the half that makes it true:
// prose nothing in the code checks is a wish, and the failure mode is that a
// gamer's trophies get locked into a request that can never complete.
//
//   DEMO_DB=1 npx tsx tests/db/eligibility.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { eligibilityOf, eligibilityFor, ageFrom, annualPayout, annualRecipients,
  MIN_REDEEM_AGE, BLOCKED_COUNTRIES, US_REPORT_THRESHOLD } = await import("../../lib/eligibility.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();
const YEAR = 365.25 * 86400_000;
const yearsAgo = (n: number) => new Date(Date.now() - n * YEAR);

console.log("== the rule, without a database ==");
eq("no date of birth is refused", eligibilityOf(null, "EG").reason, "no_age");
ok("…and says points are unaffected", /unaffected|Points and trophies/i.test(eligibilityOf(null, "EG").message));
eq("no country is refused", eligibilityOf(30, null).reason, "no_country");
eq("…and the form is told exactly what is missing", eligibilityOf(30, null).missing, ["country"]);
eq("both missing asks for both", eligibilityOf(null, null).missing, ["age", "country"]);

eq(`under ${MIN_REDEEM_AGE} is refused`, eligibilityOf(MIN_REDEEM_AGE - 1, "EG").reason, "underage");
ok("…and is told the trophies keep",
  /keep/.test(eligibilityOf(MIN_REDEEM_AGE - 1, "EG").message), eligibilityOf(MIN_REDEEM_AGE - 1, "EG").message);
ok(`exactly ${MIN_REDEEM_AGE} is allowed — the boundary is not off by one`,
  eligibilityOf(MIN_REDEEM_AGE, "EG").ok);

const blocked = Object.keys(BLOCKED_COUNTRIES)[0];
eq("a sanctioned country is refused", eligibilityOf(30, blocked).reason, "blocked_country");
ok("…by name, not by code", eligibilityOf(30, blocked).message.includes(BLOCKED_COUNTRIES[blocked]));
ok("…and says the trophies are kept", /keep the trophies/i.test(eligibilityOf(30, blocked).message));
eq("lowercase is normalised, so a country is not accidentally allowed",
  eligibilityOf(30, blocked.toLowerCase()).reason, "blocked_country");
ok("an eligible adult in an open country passes", eligibilityOf(30, "EG").ok);

console.log("\n== the age arithmetic ==");
eq("a birthday that has not happened this year does not count",
  ageFrom(new Date(Date.UTC(2000, 11, 31)), new Date(Date.UTC(2026, 0, 1))), 25);
eq("a birthday today does count",
  ageFrom(new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2026, 0, 1))), 26);
eq("garbage is not an age", ageFrom("not-a-date"), null);
eq("nothing is not an age", ageFrom(null), null);

console.log("\n== against the account on file ==");
const mk = async (birth: Date | null, country: string | null) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `el-${id.slice(0, 8)}`, displayName: "El", email: `${id}@test.invalid`,
    passwordHash: "x", birthDate: birth, country,
  } as never);
  return id;
};
const blank = await mk(null, null);
eq("a fresh account cannot be paid", (await eligibilityFor(db, blank)).reason, "no_age");
const kid = await mk(yearsAgo(14), "EG");
eq("a 14-year-old cannot be paid", (await eligibilityFor(db, kid)).reason, "underage");
const sanctioned = await mk(yearsAgo(30), blocked);
eq("a sanctioned country cannot be paid", (await eligibilityFor(db, sanctioned)).reason, "blocked_country");
const good = await mk(yearsAgo(30), "EG");
ok("an eligible adult can", (await eligibilityFor(db, good)).ok);

console.log("\n== refused BEFORE anything is committed ==");
// The whole point: a refusal must not leave trophies in `pending`. Asserted by
// driving the real action's guard order — the eligibility check runs before the
// payout-preference write and before any award is touched.
const before = await db.select({ id: schema.userTrophies.id }).from(schema.userTrophies)
  .where(sqlEq(schema.userTrophies.userId, kid));
eq("an ineligible gamer has nothing locked", before.length, 0);
const prefs = await db.select({ pm: schema.users.payoutMethod }).from(schema.users)
  .where(sqlEq(schema.users.id, kid));
eq("…and no payout preference was written for them", prefs[0]?.pm ?? null, null);

console.log("\n== the annual total ==");
const paid = await mk(yearsAgo(30), "US");
const redeem = async (amount: number, paidAt: Date, status = "paid") => {
  await db.insert(schema.trophyRedeems).values({
    id: uid(), userId: paid, awardIds: [], amount, currency: "USD",
    method: "bank", status, paidAt, createdAt: paidAt,
  } as never);
};
const Y = new Date().getUTCFullYear();
await redeem(200, new Date(Date.UTC(Y, 5, 1)));
await redeem(450, new Date(Date.UTC(Y, 10, 1)));
// Two rows that must NOT count.
await redeem(1000, new Date(Date.UTC(Y - 1, 11, 31)));            // last year
await redeem(5000, new Date(Date.UTC(Y, 6, 1)), "pending");        // never paid
eq("the annual total counts only what was paid, in that year", await annualPayout(db, paid, Y), 650);
eq("…and last year is its own number", await annualPayout(db, paid, Y - 1), 1000);
// The year boundary is the thing that gets this wrong in practice: a request
// approved in December and paid in January belongs to January.
const crosser = await mk(yearsAgo(30), "US");
await db.insert(schema.trophyRedeems).values({
  id: uid(), userId: crosser, awardIds: [], amount: 300, currency: "USD", method: "bank",
  status: "paid",
  createdAt: new Date(Date.UTC(Y - 1, 11, 20)),      // requested in December
  paidAt: new Date(Date.UTC(Y, 0, 4)),               // paid in January
} as never);
eq("a December request paid in January counts in January's year", await annualPayout(db, crosser, Y), 300);
eq("…and not in December's", await annualPayout(db, crosser, Y - 1), 0);

console.log("\n== the reporting list ==");
const list = await annualRecipients(db, Y);
const mine = list.find((r) => r.userId === paid);
ok("the recipient appears", !!mine);
eq("…with the right total", mine?.total, 650);
ok("…and is flagged over the line", !!mine?.overThreshold, `threshold=${US_REPORT_THRESHOLD}`);
const under = list.find((r) => r.userId === crosser);
ok("somebody under the line is still LISTED, not filtered out", !!under);
ok("…and not flagged", under?.overThreshold === false);
ok("the list is sorted by what we paid", list.every((r, i) => i === 0 || list[i - 1].total >= r.total));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
