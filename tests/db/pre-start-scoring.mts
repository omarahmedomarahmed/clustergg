/**
 * B91 — nothing counts before the gun.
 *
 * A challenge is joinable from the moment it is ANNOUNCED, which is days
 * before it starts. The baseline was taken at JOIN and never moved, so every
 * match played in between counted. Two things wrong at once: an early joiner
 * was scored for a week they were not competing in, and a start-line joiner
 * was scored fairly — so entering early bought a head start nobody could match.
 *
 * The test drives the real scorer against real stat rows. The assertion that
 * matters is the SECOND one: rebaselining at the start has to leave a gamer on
 * zero for the play that happened before it, and then score the play after.
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
const { scoreChallengesForAccount } = await import("../../lib/sync.ts");
const { eq: dEq, and } = await import("drizzle-orm");

const db = await getDb();
const tag = uid().slice(0, 6);
const day = (n: number) => new Date(Date.now() + n * 86400_000);

const gamer = uid();
await db.insert(schema.users).values({
  id: gamer, email: `${gamer}@ps.test`, displayName: `PS ${tag}`,
  slug: `ps-${tag}-${gamer.slice(0, 5)}`, passwordHash: "x", ageBand: "adult",
  unlockedAt: new Date(), country: "US",
});
const accountId = uid();
await db.insert(schema.linkedGameAccounts).values({
  id: accountId, userId: gamer, provider: "chesscom",
  providerAccountId: `ps-${tag}`, inGameName: "x", verified: true,
});

/** Set the account's current stats, the way a sync would. */
const setStat = async (metric: string, value: number) => {
  const [row] = await db.select({ id: schema.statCurrent.id }).from(schema.statCurrent)
    .where(and(dEq(schema.statCurrent.linkedAccountId, accountId), dEq(schema.statCurrent.metricKey, metric)))
    .limit(1);
  if (row) {
    await db.update(schema.statCurrent).set({ metricValue: value })
      .where(dEq(schema.statCurrent.id, row.id));
  } else {
    await db.insert(schema.statCurrent).values({
      id: uid(), linkedAccountId: accountId, game: "Chess.com", metricKey: metric, metricValue: value,
    });
  }
};

// Every challenge belongs to a space, so borrow the demo's first one rather
// than inventing a second world for this test to live in.
const [anySpace] = await db.select({ id: schema.spaces.id }).from(schema.spaces).limit(1);

const mkChallenge = async (startAt: Date, endAt: Date) => {
  const id = uid();
  await db.insert(schema.challenges).values({
    id, spaceId: anySpace?.id, title: `Pre-start ${tag}`, game: "Chess.com", provider: "chesscom",
    format: "leaderboard", status: "active", startAt, endAt,
    pointsEngine: { wins: 10 },
  } as never);
  return id;
};

const enter = async (challengeId: string, baseline: Record<string, number>, baselineAt: Date | null) => {
  const id = uid();
  await db.insert(schema.challengeParticipants).values({
    id, challengeId, userId: gamer, linkedAccountId: accountId,
    baseline, baselineAt, joinedAt: new Date(),
  } as never);
  return id;
};

const pointsOf = async (participantId: string) => {
  const [p] = await db.select({ n: schema.challengeParticipants.currentPoints })
    .from(schema.challengeParticipants).where(dEq(schema.challengeParticipants.id, participantId));
  return Number(p?.n ?? -1);
};

console.log("== a challenge that has not started scores nobody ==");
{
  // ANNOUNCED, joinable, not begun. A leaderboard on screen for a competition
  // that has not started is a competition people think they are losing.
  const ch = await mkChallenge(day(3), day(10));
  await setStat("wins", 100);
  const p = await enter(ch, { wins: 90 }, new Date());
  await scoreChallengesForAccount(db, accountId);
  eq("ten wins before the start are worth nothing", await pointsOf(p), 0);
}

console.log("\n== the start line rebaselines everybody who joined early ==");
{
  // Joined on announcement day at 100 wins, played to 130 before the start.
  // Under the old behaviour that is 30 wins × 10 = 300 points banked before
  // the competition began.
  const ch = await mkChallenge(day(-1), day(6));
  await setStat("wins", 130);
  const p = await enter(ch, { wins: 100 }, day(-4));

  await scoreChallengesForAccount(db, accountId);
  eq("the pre-start 30 wins are gone", await pointsOf(p), 0);

  const [row] = await db.select().from(schema.challengeParticipants).where(dEq(schema.challengeParticipants.id, p));
  eq("…because the baseline moved to where they actually stood", row.baseline?.wins, 130);
  ok("…and it is stamped, so it never moves again", !!row.baselineAt && row.baselineAt > day(-2),
    String(row.baselineAt));

  // And play AFTER the start scores normally.
  await setStat("wins", 135);
  await scoreChallengesForAccount(db, accountId);
  eq("five wins after the start are worth 50", await pointsOf(p), 50);

  // Idempotent: scoring twice must not rebaseline twice and wipe them.
  await scoreChallengesForAccount(db, accountId);
  eq("…and scoring again does not reset them", await pointsOf(p), 50);
}

console.log("\n== a challenge already running when this shipped is left alone ==");
{
  // baselineAt null can only mean a row written before the column existed.
  // Rebaselining those would wipe points people have already been shown, and a
  // scoreboard that resets itself is worse than one that started slightly early.
  const ch = await mkChallenge(day(-2), day(5));
  await setStat("wins", 200);
  const p = await enter(ch, { wins: 180 }, null);
  await scoreChallengesForAccount(db, accountId);
  eq("their existing progress survives", await pointsOf(p), 200);
}

console.log("\n== joining stamps the baseline ==");
{
  // The whole legacy rule above depends on a null being IMPOSSIBLE for a new
  // row. If join stops stamping, every new entrant looks like a legacy one and
  // the rebaseline silently stops happening.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("lib/challenges.ts", "utf8");
  ok("the join path records when the baseline was taken",
    /baselineAt: new Date\(\)/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
