/**
 * B91.7 — a podium of any depth.
 *
 * It was three named slots: first, second, third. A custom deal is routinely
 * "one winner takes everything" or "the top ten each get something", and
 * neither could be expressed — a ten-winner challenge had to be built as a
 * three-winner one and the rest handed out by hand, which means seven trophies
 * on nobody's profile and missing from the prize vault's arithmetic.
 *
 * The assertion that matters most is the LEGACY one. There are challenges in
 * the database holding the old shape, and a podium that stops being read is a
 * trophy somebody already won going missing from their profile.
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
const {
  placesOf, payingPlaces, trophiesForPlace, toPrizeBag, podiumLabel, allPrizeTrophies, MAX_PLACES,
} = await import("../../lib/prize-places.ts");
const { awardChallengeTrophies } = await import("../../lib/trophies.ts");
const { eq: dEq } = await import("drizzle-orm");

const db = await getDb();
const tag = uid().slice(0, 6);

console.log("== both shapes are read ==");
{
  eq("the new shape, by position",
    placesOf({ places: [["a"], ["b", "c"], [], ["d"]] }), [["a"], ["b", "c"], [], ["d"]]);

  // The one that protects trophies people already won.
  eq("the old shape still works",
    placesOf({ first: ["a"], second: ["b"], third: ["c"] }), [["a"], ["b"], ["c"]]);

  // Older still: one column, one trophy, first place.
  eq("and the single-trophy column before that", placesOf(null, "solo"), [["solo"]]);
  eq("nothing at all is no podium", placesOf(null), []);

  // Trailing empties are trimmed: an empty rung would tell a gamer they can
  // place sixth and win something.
  eq("empty places at the end are not places",
    placesOf({ places: [["a"], [], []] }), [["a"]]);
  eq("…but a gap in the middle is kept, because 3rd is still 3rd",
    placesOf({ places: [["a"], [], ["c"]] }), [["a"], [], ["c"]]);
}

console.log("\n== reading one place, and describing the shape ==");
{
  const bag = { places: [["gold"], ["silver"], ["bronze"]] };
  eq("first place", trophiesForPlace(bag, 1), ["gold"]);
  eq("third place", trophiesForPlace(bag, 3), ["bronze"]);
  eq("a place nobody pays", trophiesForPlace(bag, 9), []);
  eq("how many places pay", payingPlaces(bag), 3);
  eq("…described", podiumLabel(bag), "Top 3");
  eq("one place is winner-takes-all", podiumLabel({ places: [["gold"]] }), "Winner takes all");
  eq("…and none says so rather than lying", podiumLabel(null), "No trophies set");
  eq("every trophy on it, deduped", allPrizeTrophies({ places: [["a", "b"], ["a"]] }), ["a", "b"]);
}

console.log("\n== what the builder writes ==");
{
  const bag = toPrizeBag([["a"], ["b"], [], ["d"]]);
  eq("places are stored by position", bag.places, [["a"], ["b"], [], ["d"]]);
  // The duplicate is deliberate: readers exist that have not moved yet — a card
  // renderer, a brand report — and a challenge saved by the new builder must
  // not lose its podium on a screen nobody remembered to update.
  eq("…and the top three are ALSO written the old way", [bag.first, bag.second, bag.third], [["a"], ["b"], []]);
  eq("duplicates within a place collapse", (toPrizeBag([["a", "a", "b"]]).places as string[][])[0], ["a", "b"]);
  eq("more than ten places is ten", (toPrizeBag(Array.from({ length: 20 }, () => ["x"])).places as string[][]).length, MAX_PLACES);
}

console.log("\n== ten places actually award ten trophies ==");
{
  // The bug in one line: the award query was hard-coded to places 1, 2 and 3.
  const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces).limit(1);
  const trophyIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = uid();
    await db.insert(schema.trophies).values({
      id, name: `Place ${i + 1} ${tag}`, imageUrl: "/x.png", value: "0", inMarketplace: false,
    } as never);
    trophyIds.push(id);
  }

  const challengeId = uid();
  await db.insert(schema.challenges).values({
    id: challengeId, spaceId: space?.id, title: `Deep podium ${tag}`,
    game: "Chess.com", provider: "chesscom", format: "leaderboard", status: "completed",
    startAt: new Date(Date.now() - 8 * 86400_000), endAt: new Date(Date.now() - 86400_000),
    prizes: toPrizeBag(trophyIds.map((t) => [t])),
  } as never);

  const users: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = uid();
    await db.insert(schema.users).values({
      id, email: `${id}@pp.test`, displayName: `PP ${i} ${tag}`,
      slug: `pp-${tag}-${i}-${id.slice(0, 4)}`, passwordHash: "x", ageBand: "adult", unlockedAt: new Date(),
    });
    const accountId = uid();
    await db.insert(schema.linkedGameAccounts).values({
      id: accountId, userId: id, provider: "chesscom",
      providerAccountId: `pp-${tag}-${i}`, inGameName: "x", verified: true,
    });
    await db.insert(schema.challengeParticipants).values({
      id: uid(), challengeId, userId: id, linkedAccountId: accountId,
      baseline: {}, baselineAt: new Date(), finalPlacement: i + 1, status: "completed",
    } as never);
    users.push(id);
  }

  await awardChallengeTrophies(db, challengeId);

  const awarded = await db.select({
    userId: schema.userTrophies.userId, placement: schema.userTrophies.placement,
  }).from(schema.userTrophies).where(dEq(schema.userTrophies.challengeId, challengeId));
  eq("all five places got their trophy", awarded.length, 5);
  eq("…including fifth", awarded.filter((a) => a.placement === 5).length, 1);
  ok("…and each went to the gamer who placed there",
    users.every((u, i) => awarded.some((a) => a.userId === u && a.placement === i + 1)),
    JSON.stringify(awarded));

  // Idempotent: the close, a cron and a retry all call this.
  await awardChallengeTrophies(db, challengeId);
  eq("running it again awards nothing twice",
    (await db.select({ id: schema.userTrophies.id }).from(schema.userTrophies)
      .where(dEq(schema.userTrophies.challengeId, challengeId))).length, 5);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
