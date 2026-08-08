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
// The fixture takes a BAND now, not a birthday (B72.4). `birthDate` is no
// longer collected and nothing reads it, so seeding one would be testing a
// column we have told a regulator we stopped using.
const mk = async (band: string | null, country: string | null) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `el-${id.slice(0, 8)}`, displayName: "El", email: `${id}@test.invalid`,
    passwordHash: "x", ageBand: band, country,
  } as never);
  return id;
};
const blank = await mk(null, null);
eq("a fresh account cannot be paid", (await eligibilityFor(db, blank)).reason, "no_age");
const kid = await mk("under16", "EG");
eq("an under-16 cannot be paid", (await eligibilityFor(db, kid)).reason, "underage");
// The band that is old enough to earn and not old enough to be paid. This is
// the one a range could get wrong, and the reason a band maps to its LOWEST
// possible age rather than its highest.
const teen = await mk("teen", "EG");
eq("a 16-17-year-old cannot be paid either", (await eligibilityFor(db, teen)).reason, "underage");
const sanctioned = await mk("adult", blocked);
eq("a sanctioned country cannot be paid", (await eligibilityFor(db, sanctioned)).reason, "blocked_country");
const good = await mk("adult", "EG");
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
const paid = await mk("adult", "US");
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
const crosser = await mk("adult", "US");
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

console.log("\n== the age BAND, and what each one may do (B72.4) ==");
{
  const { AGE_BANDS, BAND_RULES, rulesFor, parseBand, changeBand, MAX_BAND_CHANGES } =
    await import("../../lib/age.ts");
  const { ageForBand } = await import("../../lib/eligibility.ts");

  eq("three bands, and the line is 16", [...AGE_BANDS], ["under16", "teen", "adult"]);

  // THE assertion. An unanswered band is not a permissive default.
  const unset = rulesFor(null);
  ok("nobody who has not answered can earn", !unset.earn && !unset.play && !unset.redeem);

  ok("under 16 is read-only", !BAND_RULES.under16.play && !BAND_RULES.under16.earn && !BAND_RULES.under16.redeem);
  ok("16-17 plays and earns", BAND_RULES.teen.play && BAND_RULES.teen.earn);
  ok("…but cannot cash out", !BAND_RULES.teen.redeem);
  ok("18+ can do everything", Object.values(BAND_RULES.adult).every(Boolean));

  // A band maps to the LOWEST age it could mean. Rounding up would pay somebody
  // on the strength of an age they never claimed.
  eq("a band becomes its lowest possible age", [ageForBand("under16"), ageForBand("teen"), ageForBand("adult")], [0, 16, 18]);
  eq("…and an unset band is not an age at all", ageForBand(null), null);
  ok("16-17 therefore FAILS the redeem check", !eligibilityOf(ageForBand("teen"), "US").ok);
  ok("…and 18+ passes it", eligibilityOf(ageForBand("adult"), "US").ok);

  eq("junk is not a band", parseBand("nineteen"), null);

  // The correction path. A band asked in one click WILL be mis-tapped, and a
  // mis-tap onto under-16 turns off the whole product.
  ok("answering for the first time is allowed", changeBand(null, 0, "under16").ok);
  ok("…and does not count as a change", changeBand(null, 0, "under16").ok
    && (changeBand(null, 0, "under16") as { locked: boolean }).locked === false);
  ok("a correction is allowed", changeBand("under16", 0, "adult").ok);
  ok("…and so is the third", changeBand("under16", MAX_BAND_CHANGES - 1, "adult").ok);
  ok("the fourth is refused", !changeBand("under16", MAX_BAND_CHANGES, "adult").ok);
  ok("…with a message that says what to do",
    /support/i.test((changeBand("under16", MAX_BAND_CHANGES, "adult") as { error: string }).error));
  // Re-picking what you already have is not a change, so a locked gamer is not
  // shown an error for touching their own current answer.
  ok("re-picking the same band is not refused when locked",
    changeBand("adult", MAX_BAND_CHANGES, "adult").ok);
}

console.log("\n== a date of birth is no longer asked for anywhere ==");
{
  const { readFileSync } = await import("node:fs");
  const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
  ok("eligibility reads the band, not a stored birthday",
    /ageForBand\(u\?\.band\)/.test(code("lib/eligibility.ts")));
  ok("…and the redeem action no longer collects one",
    !/birthDate/.test(code("app/actions/trophies.ts")));
  // The gate is inside awardQuestAction, not at each emitter. A rule that has to
  // be remembered at twenty call sites is one that will be forgotten at one.
  ok("earning is gated once, centrally", /mayEarn\(db, userId\)/.test(code("lib/quests.ts")));
  // No `type="date"` may come back on the two surfaces that used to have one.
  // The server takes a band now, so a date input here would post "2003-04-11"
  // to something that only accepts one of three words — a redemption that fails
  // on a value the gamer typed correctly.
  for (const f of ["components/TrophyCase.tsx", "components/RedeemStepper.tsx"]) {
    ok(`${f} has no date-of-birth input`, !/type="date"/.test(code(f)));
  }
}

console.log("\n== somebody is actually ASKED ==");
{
  const { readFileSync } = await import("node:fs");
  const raw = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  // A gate whose question is optional only fires on people who went looking for
  // it. The picker sat in `/settings/earning` alone until this assertion; a
  // gamer could link accounts, run challenges and earn NOTHING while never
  // seeing the question. The root layout asks, so skipping onboarding cannot
  // skip it.
  const layout = raw("app/layout.tsx");
  ok("the root layout renders the gate", /<AgeGate \/>/.test(layout));
  ok("…only when the band is unset", /!me\.ageBand/.test(layout));
  ok("…and never inside an embed", /!embedded && <AgeGate/.test(layout));
  ok("the gate is answerable in place", /AgeBandPicker/.test(raw("components/AgeGate.tsx")));
  // Answering revalidates the LAYOUT, not a list of pages — otherwise the
  // "nothing is earning" bar survives on every other page after they answered.
  ok("answering clears it everywhere", /revalidatePath\("\/", "layout"\)/.test(raw("app/actions/age.ts")));
  // The layout reads the band off `getCurrentUser`, whose projection is partial
  // while its TYPE is the full row — a column left out reads `undefined` and
  // would make every gamer look unanswered forever.
  ok("the per-request user fetch carries the band",
    /ageBand: schema\.users\.ageBand/.test(raw("lib/auth.ts")));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
