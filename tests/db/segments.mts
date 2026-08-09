/**
 * B89.5 — who the audience is, in aggregate, and never who anybody is.
 *
 * The decision this encodes: a brand asked to see "the gamers", and the answer
 * is a shape, never a list. Every assertion here is about the FLOOR, because
 * the floor is the only thing standing between an aggregate and a fact about
 * three people somebody can name.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { readFileSync } = await import("node:fs");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { uid } = await import("../../lib/utils.ts");
const { audienceSegments, describable, COHORT_FLOOR } = await import("../../lib/segments.ts");

const db = await getDb();
const tag = uid().slice(0, 5).toLowerCase();

// A tiny country: 3 gamers. Below the floor, and therefore the whole point.
const TINY = "ZZ";
// A big one: comfortably over.
const BIG = "QQ";

const mk = async (i: number, country: string, provider: string) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, email: `${id}@seg.test`, displayName: `Seg ${i}`,
    slug: `seg-${tag}-${i}-${id.slice(0, 4)}`, passwordHash: "x",
    ageBand: "adult", unlockedAt: new Date(), country,
  });
  await db.insert(schema.linkedGameAccounts).values({
    id: uid(), userId: id, provider,
    providerAccountId: `seg-${tag}-${i}-${provider}`, inGameName: "x", verified: true,
  });
  return id;
};

// 30 in BIG on one game — over the floor.
for (let i = 0; i < 30; i++) await mk(i, BIG, `segbig-${tag}`);
// 3 in TINY — under it.
for (let i = 100; i < 103; i++) await mk(i, TINY, `segbig-${tag}`);

console.log("== the floor suppresses, and says that it did ==");
{
  const a = await audienceSegments(db);
  ok("there is an audience to describe", describable(a), String(a.total));

  const countries = a.segments.find((s) => s.dimension === "Countries")!;
  ok("the big country is described", countries.slices.some((s) => s.key === BIG),
    JSON.stringify(countries.slices.map((s) => s.key)));
  // The assertion the whole file exists for. Three people in a country is three
  // people, and "fewer than 25" is still a fact about them.
  ok("the three-person country is NOT described",
    !countries.slices.some((s) => s.key === TINY),
    JSON.stringify(countries.slices.map((s) => s.key)));
  ok("…and nothing shown is under the floor",
    countries.slices.every((s) => s.gamers >= COHORT_FLOOR),
    JSON.stringify(countries.slices));

  // Suppressed, not hidden. A silent omission reads as a gap in the market
  // rather than a rule, and a brand that does not know the rule exists cannot
  // plan around it.
  ok("the suppressed people are counted", countries.suppressed >= 3, String(countries.suppressed));
  ok("…and so are the groups they were in", countries.suppressedGroups >= 1, String(countries.suppressedGroups));
}

console.log("\n== the percentages are of one honest population ==");
{
  const a = await audienceSegments(db);
  for (const s of a.segments) {
    // A slice over 100% means the numerator and the denominator are counting
    // different people. The first run of this function reported a size bracket
    // at 291% — every guild member measured against a total of linked gamers.
    ok(`${s.dimension}: no slice exceeds the population`,
      s.slices.every((x) => x.pct <= 100), JSON.stringify(s.slices));
    ok(`${s.dimension}: and none is negative`, s.slices.every((x) => x.pct >= 0));
  }
  // The visible slices deliberately do NOT have to add to 100 — what is missing
  // is what was suppressed, and a brand should be able to see the gap.
  ok("a dimension may add to less than 100, and that is the design",
    a.segments.every((s) => s.slices.reduce((t, x) => t + x.pct, 0) <= 101));
}

console.log("\n== overlaps obey the floor on all three counts ==");
{
  const a = await audienceSegments(db);
  ok("no overlap smaller than the floor",
    a.overlaps.every((o) => o.gamers >= COHORT_FLOOR), JSON.stringify(a.overlaps));
  // A pair with 200 on each side and 4 in common is four people, so the
  // intersection is checked as well as each side.
  ok("…and none is a percentage of nothing",
    a.overlaps.every((o) => o.pctOfA > 0 && o.pctOfA <= 100), JSON.stringify(a.overlaps));
}

console.log("\n== what is deliberately not here ==");
{
  const src = readFileSync("lib/segments.ts", "utf8");
  // Slicing by age band turns a compliance field into a targeting field, which
  // is the profiling of under-18s that nine jurisdictions bar.
  ok("no age slice", !/ageBand/.test(src));
  // Per-server composition is a fact about forty people the owner can name.
  ok("no per-server composition", !/group\s*by[^\n]*guildId/i.test(src) && !/groupBy\(schema\.discordGuildMembers\.guildId/.test(src));
  // A list is the thing this module exists not to produce.
  ok("no identity leaves this module",
    !/displayName|\.email|\bslug\b/.test(src), "");
}

console.log("\n== an empty network says so rather than inventing a shape ==");
{
  // Below the floor the honest answer is "not yet". A page of suppressed rows
  // reads like a bug.
  ok("describable is false for a tiny population",
    !describable({ total: COHORT_FLOOR - 1, segments: [], overlaps: [] }));
  ok("…and true once there is a real one",
    describable({ total: COHORT_FLOOR, segments: [], overlaps: [] }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
