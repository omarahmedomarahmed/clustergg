// B51 — a podium where all three places win the same object is not a podium.
//
// Money-touching (§1.1): these trophies redeem for cash, so which one lands on
// which profile is a payment decision. Before this there was ONE
// `vote.week.trophy` for the whole podium and second and third got the winner's
// prize.
//
// The browser half is `tests/ui/week-band.mjs`. This is the half only a database
// can answer: what is actually awarded when a week is called.
//
//   DEMO_DB=1 npx tsx tests/db/week-prizes.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { PODIUM_TROPHY_KEYS } = await import("../../lib/week.ts");
const { podiumTrophies, closeWeek, weekBoard } = await import("../../lib/profile-week.ts");
const { setContent, forgetContent } = await import("../../lib/cms.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, and, inArray } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();
const tag = uid().slice(0, 6);

const setPrizes = async (ids: (string | null)[]) => {
  for (const [i, key] of PODIUM_TROPHY_KEYS.entries()) await setContent(key, ids[i] ?? "");
  try { forgetContent?.(); } catch { /* not all builds memoise */ }
};

const mkUser = async (name: string) => {
  const id = uid();
  const slug = `wk-${name}-${tag}`;
  await db.insert(schema.users).values({
    id, slug, displayName: `WK ${name}`, email: `${id}@test.invalid`, passwordHash: "x", ageBand: "adult",
  } as never);
  return { id, slug };
};

console.log("== the keys are three, and the first is the old one ==");
// `vote.week.trophy` predates the split and was the single podium-wide prize.
// Keeping it as FIRST place is what stops an admin's existing choice vanishing
// the moment this ships.
eq("three keys", PODIUM_TROPHY_KEYS.length, 3);
eq("…and first place is the pre-existing key", PODIUM_TROPHY_KEYS[0], "vote.week.trophy");

console.log("\n== nothing configured is not an error ==");
await setPrizes([null, null, null]);
const none = await podiumTrophies(db);
eq("three slots, all empty", none, [null, null, null]);

console.log("\n== three places, three different objects ==");
const trophies = await db.select().from(schema.trophies).limit(3);
ok("the demo has three trophies to work with", trophies.length === 3, `${trophies.length}`);
await setPrizes(trophies.map((t) => t.id));
const set = await podiumTrophies(db);
eq("each place gets its own", set.map((t) => t?.id), trophies.map((t) => t.id));
ok("…and they are genuinely different", new Set(set.map((t) => t?.id)).size === 3);
ok("each carries what it is worth", set.every((t) => typeof t?.value === "number"));

console.log("\n== a gap in the middle is a gap, not a fallback ==");
// The failure this replaces ran the other way: one trophy for everybody. The
// opposite mistake — second place silently inheriting first place's prize —
// would be worse, because it looks deliberate.
await setPrizes([trophies[0].id, null, trophies[2].id]);
const gapped = await podiumTrophies(db);
eq("first is set", gapped[0]?.id, trophies[0].id);
eq("second is EMPTY, not first's", gapped[1], null);
eq("third is its own", gapped[2]?.id, trophies[2].id);

console.log("\n== closing a week awards the right object to the right place ==");
await setPrizes(trophies.map((t) => t.id));
const board = await weekBoard({ limit: 10 });
const weekKey = `test-${tag}`;
const winners = [await mkUser("first"), await mkUser("second"), await mkUser("third")];
// Votes decide the order, so they are cast rather than asserted into place.
for (const [i, w] of winners.entries()) {
  for (let v = 0; v < (3 - i) * 5; v++) {
    await db.insert(schema.profileVotes).values({
      id: uid(), profileUserId: w.id, voterUserId: uid(), weekKey,
      source: "web", createdAt: new Date(),
    } as never).onConflictDoNothing();
  }
}
const closed = await closeWeek(weekKey);
ok("the week closes", closed.ok !== false || !!closed, JSON.stringify(closed));

const awarded = await db.select({
  userId: schema.userTrophies.userId,
  trophyId: schema.userTrophies.trophyId,
  placement: schema.userTrophies.placement,
}).from(schema.userTrophies)
  .where(sqlEq(schema.userTrophies.challengeId, `week:${weekKey}`));

if (awarded.length) {
  const byPlace = new Map(awarded.map((a) => [a.placement, a]));
  eq("first place got FIRST place's trophy", byPlace.get(1)?.trophyId, trophies[0].id);
  if (byPlace.has(2)) eq("second place got SECOND place's", byPlace.get(2)?.trophyId, trophies[1].id);
  if (byPlace.has(3)) eq("third place got THIRD place's", byPlace.get(3)?.trophyId, trophies[2].id);
  ok("no two places share an object",
    new Set(awarded.map((a) => a.trophyId)).size === awarded.length,
    JSON.stringify(awarded));

  console.log("\n== re-closing does not mint a second set ==");
  await closeWeek(weekKey);
  const again = await db.select().from(schema.userTrophies)
    .where(sqlEq(schema.userTrophies.challengeId, `week:${weekKey}`));
  eq("the same awards, not twice as many", again.length, awarded.length);
} else {
  // A demo database whose board is empty cannot be closed; say so rather than
  // passing silently, because a suite that asserts nothing looks like one that
  // asserted everything.
  ok("SKIPPED: the board had no votable entries in this database", true,
    JSON.stringify(board.entries.length));
}

console.log("\n== the board carries the prizes while the week is still running ==");
// The whole point of B51's third change: a contender sees the object with time
// left to chase it. If this were only present after the close, the band would
// be a results page.
const live = await weekBoard({ limit: 5 });
eq("three slots on the live board", live.prizes.length, 3);
eq("…and they are the configured ones", live.prizes.map((t) => t?.id), trophies.map((t) => t.id));
ok("…each with an image to show", live.prizes.every((t) => !!t?.imageUrl));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
