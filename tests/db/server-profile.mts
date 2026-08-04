// B47 — the server profile gates the revenue share.
//
// Written WITH the item, not deferred to Part II, because this decides whether
// somebody gets paid (§1.1's exception). A gate that wrongly pays is cash that
// has already left; a gate that wrongly withholds is a server owner who was
// promised 5%, reached 500 linked members and got nothing with no explanation.
//
//   DEMO_DB=1 npx tsx tests/db/server-profile.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { missingFields, profileComplete, completeness, PROFILE_FIELDS, EMPTY_PROFILE } =
  await import("../../lib/discord/community.ts");
const { ownerPctFor, earningOwnerPct, challengeEarning } = await import("../../lib/server-earnings.ts");

const FULL = { games: ["Chess"], regions: ["mena"], vibes: ["competitive"], about: "Ranked chess, MENA.", answeredAt: new Date().toISOString() };
const EMAIL = "owner@example.com";

console.log("\n== what 'complete' means ==");
ok("a fully answered profile with an email is complete", profileComplete(FULL, EMAIL));
ok("an empty profile is not", !profileComplete(EMPTY_PROFILE, null));
eq("nothing is missing from a full profile", missingFields(FULL, EMAIL), []);

// Each required field, removed one at a time. This is the assertion that stops
// somebody quietly dropping a field from the gate later.
for (const f of PROFILE_FIELDS) {
  const p = { ...FULL };
  let email: string | null = EMAIL;
  if (f.key === "contactEmail") email = null;
  else if (f.key === "about") p.about = "";
  else (p as never as Record<string, string[]>)[f.key] = [];
  ok(`removing "${f.key}" makes it incomplete`, !profileComplete(p, email));
  eq(`…and names exactly that field`, missingFields(p, email), [f.key]);
}

ok("an email with no @ does not count as an email", !profileComplete(FULL, "not-an-address"));
eq("completeness is 100 when complete", completeness(FULL, EMAIL), 100);
eq("completeness is 0 when empty", completeness(EMPTY_PROFILE, null), 0);

console.log("\n== the gate ==");
eq("the TIER still pays 5% at 500 linked", ownerPctFor(500), 5);
eq("…and 10% at 1,000", ownerPctFor(1000), 10);
eq("…and 25% at 5,000", ownerPctFor(5000), 25);
// The ladder must be unaffected: hiding the reward is the wrong way to ask for
// the form, and an owner has to be able to see what they are working toward.
eq("ownerPctFor is unchanged by completeness — it has no such argument",
  ownerPctFor.length, 1);

eq("a COMPLETE server at 500 linked earns 5%", earningOwnerPct(500, true), 5);
eq("an INCOMPLETE server at 500 linked earns 0%", earningOwnerPct(500, false), 0);
eq("an incomplete server at 5,000 linked still earns 0%", earningOwnerPct(5000, false), 0);
eq("an incomplete server below any tier earns 0% either way", earningOwnerPct(10, false), 0);

console.log("\n== the money it actually splits ==");
const args = { linked: 500, entrants: 10, totalEntrants: 10 };
const complete = challengeEarning({ ...args, profileComplete: true });
const incomplete = challengeEarning({ ...args, profileComplete: false });
ok("a complete server is owed something", complete.owner > 0, `owner=${complete.owner}`);
eq("an incomplete server is owed nothing", incomplete.owner, 0);
eq("…and its ownerPct reads 0, not the tier rate", incomplete.ownerPct, 0);
// Projections must keep showing the real number, or every "what you could earn"
// figure on the site silently becomes zero.
eq("omitting the flag defaults to complete, so projections are unaffected",
  challengeEarning(args).owner, complete.owner);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
