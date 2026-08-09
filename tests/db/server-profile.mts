// B47 — the server profile gates whether an owner can be paid.
//
// Written WITH the item, not deferred to Part II, because this decides whether
// somebody gets paid (§1.1's exception). A gate that wrongly pays is cash that
// has already left; a gate that wrongly withholds is a server owner who did the
// work and got nothing with no explanation.
//
// C3 MOVED THE GATE. It used to live inside the per-challenge rate
// (`earningOwnerPct` zeroed a tier's percentage until the profile was
// complete). There is no rate any more — owners are paid from the weekly pool —
// so the gate moved to `lib/week-close.ts`, which is where money is decided
// now. These assertions moved with it rather than being deleted: the rate
// disappearing must not take the gate with it, and that is exactly the kind of
// silent loss a deleted test would have hidden.
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
const { challengeEarning } = await import("../../lib/server-earnings.ts");

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
// INVERTED BY C3. These four used to assert a tier's RATE (5% at 500, 10% at
// 1,000, 25% at 5,000) and that an incomplete profile zeroed it. The rate is
// gone; what must still be true is that a tier is a LABEL and an incomplete
// server cannot be paid.
const earnings = await import("../../lib/server-earnings.ts");
for (const fn of ["ownerPctFor", "earningOwnerPct", "clusterPctFor", "monthlyCeiling"]) {
  ok(`${fn} no longer exists to be gated`, !(fn in earnings));
}
ok("a tier carries no rate at all",
  !earnings.EARN_TIERS.some((t: Record<string, unknown>) => "ownerPct" in t));

// The gate itself, where it lives now. Read from source rather than run,
// because running it needs a whole week of fixtures — and what is being checked
// is that the rule EXISTS in the path that decides money, which is precisely
// what a deleted rate could have quietly taken away.
{
  const { readFileSync } = await import("node:fs");
  // B99 moved the scoring out of `week-close.ts` into `week-standing.ts`, which
  // the close and the public pool page both call. The gate moved with it — so
  // the rule is asserted where it now lives, AND the close is asserted to call
  // it, because a gate in a file nobody calls is not a gate.
  const wc = readFileSync(new URL("../../lib/week-close.ts", import.meta.url), "utf8");
  const st = readFileSync(new URL("../../lib/week-standing.ts", import.meta.url), "utf8");
  ok("the scoring consults the server profile", /profileComplete\(/.test(st));
  ok("…and drops the incomplete from the run rather than paying them zero",
    /payable\.has\(g\)/.test(st));
  ok("…and says how many it skipped", /skippedForProfile/.test(st));
  ok("…and the weekly close is what runs it", /standingFor\(/.test(wc));
}

console.log("\n== the money it actually splits ==");
// `challengeEarning` still exists and still apportions a challenge by entrant
// share — that arithmetic was never wrong. What it no longer does is turn that
// share into an owner's money.
const args = { entrants: 10, totalEntrants: 10 };
const share = challengeEarning(args);
eq("a server that supplied the whole field has the whole share", share.serverShare, 1);
eq("…and half the field is half the share",
  challengeEarning({ entrants: 5, totalEntrants: 10 }).serverShare, 0.5);
ok("but a challenge no longer carries an owner cut", !("owner" in share));
ok("…nor a rate", !("ownerPct" in share));
// With no entrants anywhere, the split is even across the servers that carried
// it — the only fair answer when there is no participation to weigh.
eq("no entrants splits evenly across carriers",
  challengeEarning({ entrants: 0, totalEntrants: 0, serversCarrying: 4 }).serverShare, 0.25);

// ---- The manual mail (B47.4) ----
//
// The composer's one dangerous property is that its body is typed by a human
// and rendered into HTML we send under our own brand. So: escaped, and refused
// when it would render an unfilled slot.
console.log("\n== admin.message ==");
const { renderEmail } = await import("../../lib/email/templates.ts");
const msg = renderEmail("admin.message", {
  subject: "A note", body: "First line.\n\nSecond <b>paragraph</b> & more.",
});
eq("the subject is the admin's own", msg.subject, "A note");
ok("a blank line becomes a second paragraph", msg.html.split("<p style=\"margin:0 0 14px").length === 3);
ok("markup the admin typed is escaped, not rendered",
  msg.html.includes("&lt;b&gt;") && !msg.html.includes("<b>paragraph"),
  msg.html.slice(msg.html.indexOf("Second") - 40, msg.html.indexOf("Second") + 60));
ok("an ampersand survives as an entity", msg.html.includes("&amp; more"));
ok("the plain-text alternative carries the body", msg.text.includes("First line."));

// The exact condition the console refuses on: no address, nowhere to send.
console.log("\n== nowhere to send ==");
const { getProfile: gp } = await import("../../lib/discord/community.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const tdb = await getDb();
const [anyGuild] = await tdb.select().from(schema.discordGuilds).limit(1);
if (anyGuild) {
  const prior = anyGuild.contactEmail;
  await tdb.update(schema.discordGuilds).set({ contactEmail: null })
    .where(sqlEq(schema.discordGuilds.guildId, anyGuild.guildId));
  const blank = await gp(anyGuild.guildId);
  eq("a server with no contact email has no address to mail", blank.contactEmail, null);
  ok("…and is therefore incomplete, so it earns nothing", !blank.complete);
  await tdb.update(schema.discordGuilds).set({ contactEmail: prior })
    .where(sqlEq(schema.discordGuilds.guildId, anyGuild.guildId));
} else {
  ok("a guild exists to check", false, "no demo guild seeded");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
