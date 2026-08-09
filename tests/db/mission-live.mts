// The Daily Mission was built and never wired up. B113 / B63.1.
//
// ===== WHAT WAS WRONG, AND IT IS WORSE THAN A MISSING FEATURE =====
//
// `lib/missions.ts` is a complete system: templates, per-day schedules, task
// progress, a streak that loops, milestones that award trophies. 89 assertions
// in `tests/db/missions.mts`, all green, for months.
//
// **Nothing imported it.** One hit in the whole codebase — `lib/cp-dial.ts`,
// which reads the templates to price them for an admin screen and never asks
// whether anybody is running one.
//
// So no gamer had ever seen a daily mission, no streak had ever been counted,
// and `milestonesHit` had never been called — meaning **no milestone trophy had
// ever been awarded to anybody**, while `lib/cards/render.tsx` tells gamers a
// trophy might have been "earned at a streak milestone". A promise in the
// product with no path behind it, which is worse than an absent feature because
// it reads as working.
//
//   DEMO_DB=1 npx tsx tests/db/mission-live.mts

process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, and: sqlAnd } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { DEFAULT_DAILY_CP_CEILING } = await import("../../lib/quests.ts");
const { dayKey, streakFrom } = await import("../../lib/missions.ts");
const {
  liveMission, awardStreakMilestones, fullDaysFor, runStartOf, reachedThisRun,
  streakAwardKey, DEFAULT_MILESTONES, STREAK_SOURCE, STREAK_LOOKBACK_DAYS,
} = await import("../../lib/mission-live.ts");

const db = await getDb();

console.log("== something finally imports it ==");
{
  // The assertion this file exists for. Everything below is only meaningful if
  // the system is reachable from the product at all.
  const nav = code("components/Nav.tsx");
  const jobs = code("lib/jobs.ts");
  ok("the nav reads the mission", /liveMission\(db, user\.id\)/.test(nav),
    "the whole system had one importer, and it was an admin pricing screen");
  ok("…only for a signed-in gamer", /if \(user\) \{[\s\S]{0,400}liveMission/.test(nav),
    "there is no mission for somebody with no account");
  ok("a job awards the milestones", /case "streak-milestones"/.test(jobs)
    && /awardStreakMilestones/.test(jobs));
  ok("…and it is registered as a daily job",
    /key: "streak-milestones", cadence: "daily"/.test(jobs));

  // THE RULE THAT MATTERS MOST HERE.
  ok("the page render does NOT award",
    !/awardStreakMilestones/.test(nav),
    "handing somebody a redeemable trophy because they loaded a page is a write nobody asked for — and it would fire from a prefetch");
}

console.log("\n== the streak is derived, never stored ==");
{
  ok("there is no streak column", !/streak/i.test(code("lib/db/schema.ts")),
    "a stored counter and the events it came from disagree the first time a job runs twice");
  ok("it is counted from quest_events", /from\(schema\.questEvents\)/.test(code("lib/mission-live.ts")));
  ok("…in ONE query, grouped by day",
    /groupBy\(sql`1`\)/.test(code("lib/mission-live.ts")),
    "a query per day is what turns a nav band into a hundred queries per page");
}

console.log("\n== a real gamer, a real streak ==");
const userId = uid();
{
  await db.insert(schema.users).values({
    id: userId, displayName: "Streak Fixture", slug: `streak-${uid().slice(0, 8)}`,
    email: `${uid().slice(0, 10)}@example.test`, ageBand: "adult", unlockedAt: new Date(),
  } as never);
  const [quest] = await db.select({ id: schema.quests.id }).from(schema.quests).limit(1);

  const earn = async (daysAgo: number, cp: number) => {
    await db.insert(schema.questEvents).values({
      id: uid(), userId, questId: quest.id, actionKey: "join_planet",
      qpAwarded: cp, cpAwarded: cp,
      createdAt: new Date(Date.now() - daysAgo * 86400000),
    } as never);
  };

  const fresh = await liveMission(db, userId);
  eq("a new gamer has no streak", fresh.streak, 0);
  ok("…but still gets a mission", fresh.progress.tasks.length > 0,
    "no schedule set must mean this week's template, not an empty day");
  ok("…and milestones to climb", fresh.milestones.length > 0);
  eq("…defaulting to the shipped ladder", fresh.milestones.map((m) => m.days), DEFAULT_MILESTONES.map((m) => m.days));

  // Three consecutive FULL days, ending yesterday.
  for (const d of [1, 2, 3]) await earn(d, DEFAULT_DAILY_CP_CEILING);
  const days = await fullDaysFor(db, userId);
  eq("three full days are counted", days.size, 3);
  eq("…and the streak is three", streakFrom(days), 3);

  const three = await liveMission(db, userId);
  eq("the live read agrees", three.streak, 3);
  eq("the run started three days ago", three.runStart, dayKey(new Date(Date.now() - 3 * 86400000)));
  eq("the next milestone is the 7-day one", three.next?.milestone.days, 7);
  eq("…four days away", three.next?.away, 4);

  // A day that did NOT hit the ceiling must not count.
  await earn(5, Math.max(1, Math.floor(DEFAULT_DAILY_CP_CEILING / 2)));
  const partial = await fullDaysFor(db, userId);
  eq("a half day is not a full day", partial.size, 3);
  eq("…so the streak is unchanged", (await liveMission(db, userId)).streak, 3);
}

console.log("\n== the milestone award, and it awards exactly once per run ==");
{
  const [trophy] = await db.select({ id: schema.trophies.id }).from(schema.trophies).limit(1);
  ok("there is a trophy to award", !!trophy);

  await db.insert(schema.platformSettings).values({
    key: "missions.milestones",
    value: [{ days: 3, trophyId: trophy.id }] as never,
  } as never).onConflictDoUpdate({
    target: schema.platformSettings.key,
    set: { value: [{ days: 3, trophyId: trophy.id }] as never },
  });

  const live = await liveMission(db, userId);
  eq("staff milestones replace the default", live.milestones.map((m) => m.days), [3]);
  eq("…and the streak has reached it", live.streak >= 3, true);

  const first = await awardStreakMilestones(db, userId);
  eq("the 3-day trophy is handed over", first.filter((a) => a.awarded).map((a) => a.days), [3]);

  const held = await db.select().from(schema.userTrophies)
    .where(sqlAnd(sqlEq(schema.userTrophies.userId, userId),
      sqlEq(schema.userTrophies.challengeId, streakAwardKey(3, live.runStart))));
  eq("…and there is exactly one row for it", held.length, 1);
  eq("…marked as a streak award, not a challenge one",
    String(held[0].challengeId).split(":")[0], STREAK_SOURCE);

  // THE IDEMPOTENCE ASSERTION. A daily job runs every day for the length of a
  // streak; without this it would hand over the same trophy seven times.
  const again = await awardStreakMilestones(db, userId);
  eq("running it again awards nothing", again.filter((a) => a.awarded).length, 0);
  await awardStreakMilestones(db, userId);
  const after = await db.select().from(schema.userTrophies)
    .where(sqlAnd(sqlEq(schema.userTrophies.userId, userId),
      sqlEq(schema.userTrophies.challengeId, streakAwardKey(3, live.runStart))));
  eq("…and there is still exactly one row", after.length, 1);

  eq("the run knows what it has banked", (await reachedThisRun(db, userId, live.runStart)), [3]);

  // TWO INDEPENDENT LAYERS, and this suite can only prove ONE of them. Said
  // plainly, because a test that implies more coverage than it has is worse
  // than a missing test.
  //
  // Layer 1 — `reachedThisRun` feeds `milestonesHit`, so a second sequential
  // call finds nothing due. That is what the assertion above proves. Deleting
  // layer 2 and re-running this suite still passes, which is how I know.
  //
  // Layer 2 — the existence check immediately before the insert. It covers the
  // case layer 1 cannot see: two callers that both read `reached` before either
  // has written. The daily job plus a manual run of the same job from Mission
  // Control is exactly that shape.
  //
  // ⚠ THE RACE BELOW DOES NOT ACTUALLY RACE HERE. PGlite is one in-process
  // connection and serialises writers for free, so the second call's
  // `liveMission` always observes the first call's row and layer 1 catches it
  // again. This is the same limitation `tests/db/concurrency.mts` was rewritten
  // for — that suite runs against a REAL Postgres in CI precisely because this
  // one cannot contend. So: the assertion below is a regression guard, not a
  // proof, and layer 2's presence is asserted structurally underneath it.
  await db.delete(schema.userTrophies).where(sqlAnd(
    sqlEq(schema.userTrophies.userId, userId),
    sqlEq(schema.userTrophies.challengeId, streakAwardKey(3, live.runStart)),
  ));
  await Promise.all([awardStreakMilestones(db, userId), awardStreakMilestones(db, userId)]);
  const raced = await db.select().from(schema.userTrophies).where(sqlAnd(
    sqlEq(schema.userTrophies.userId, userId),
    sqlEq(schema.userTrophies.challengeId, streakAwardKey(3, live.runStart)),
  ));
  eq("two calls at once still award exactly one", raced.length, 1);
  ok("…and the row check that would catch a real race is present",
    /const \[existing\] = await db\.select\(\{ id: schema\.userTrophies\.id \}\)/.test(code("lib/mission-live.ts"))
    && /if \(existing\) \{[\s\S]{0,120}continue; \}/.test(code("lib/mission-live.ts")),
    "structural, because PGlite cannot contend — see the note above");
}

console.log("\n== the streak is a LOOP, so a new run awards it again ==");
{
  // The whole point of the key being the RUN's start day rather than the
  // milestone alone. "Have they had the 7-day trophy" is the wrong question;
  // "have they had it for THIS run" is the right one.
  const runA = "2026-01-01";
  const runB = "2026-05-01";
  ok("two runs produce different keys", streakAwardKey(7, runA) !== streakAwardKey(7, runB));
  ok("…and the same run the same key", streakAwardKey(7, runA) === streakAwardKey(7, runA));
  const src = code("lib/mission-live.ts");
  ok("the key carries the run start", /\$\{STREAK_SOURCE\}:\$\{days\}:\$\{runStart\}/.test(src));
  ok("…and the lookback outlasts the longest milestone",
    STREAK_LOOKBACK_DAYS > Math.max(...DEFAULT_MILESTONES.map((m) => m.days)),
    `${STREAK_LOOKBACK_DAYS} vs ${Math.max(...DEFAULT_MILESTONES.map((m) => m.days))}`);
}

console.log("\n== a milestone with no trophy promises nothing ==");
{
  const noTrophy = DEFAULT_MILESTONES.filter((m) => !m.trophyId);
  ok("the shipped default has none attached", noTrophy.length === DEFAULT_MILESTONES.length,
    "staff attach a trophy when they have one — the ladder still shows and still marks the run");
  const band = read("components/MissionBand.tsx");
  ok("the band says so rather than implying a prize",
    /Trophies for these are being chosen/.test(band));
  ok("…and only draws a trophy icon where there is one", /m\.hasTrophy && <Icon name="trophy"/.test(band));
  const src = code("lib/mission-live.ts");
  ok("the award path skips them without erroring", /if \(!m\.trophyId\) \{/.test(src));
}

console.log("\n== the band is chrome, and behaves like the one above it ==");
{
  const band = read("components/MissionBand.tsx");
  ok("it takes the nav's background art", /bgUrl/.test(band) && /backgroundImage/.test(band),
    "B63.2 — the two bands must read as one piece of chrome");
  ok("…collapsed and expanded", (band.match(/style=\{art\}/g) ?? []).length >= 2);
  ok("clicking anywhere in the panel closes it", /onClick=\{toggle\} className="cursor-pointer/.test(band),
    "B63.1, and it is what people try first");
  ok("…but a link inside still navigates", /e\.stopPropagation\(\)/.test(band));
  ok("it remembers the choice", /localStorage\.setItem\(KEY/.test(band));
  ok("…starting collapsed, unlike the week band",
    /localStorage\.getItem\(KEY\) === "open"/.test(band),
    "two panels opening over every page on every visit is what makes people collapse both");
  const nav = code("components/Nav.tsx");
  ok("both bands get the same art", (nav.match(/optImg\(navBg, 1600\)/g) ?? []).length >= 3);
}

console.log("\n== the job only walks gamers who could have moved ==");
{
  const jobs = code("lib/jobs.ts");
  ok("it selects recently active gamers, not every user",
    /selectDistinct\(\{ id: schema\.questEvents\.userId \}\)/.test(jobs),
    "walking the whole user table nightly is the shape that stops working at the size we plan for");
  ok("…over a short window", /interval '2 days'/.test(jobs));
  ok("…and reports what it did", /Awarded \$\{awarded\} streak trophy/.test(read("lib/jobs.ts")));
}

// Fixtures out.
await db.delete(schema.userTrophies).where(sqlEq(schema.userTrophies.userId, userId));
await db.delete(schema.questEvents).where(sqlEq(schema.questEvents.userId, userId));
await db.delete(schema.users).where(sqlEq(schema.users.id, userId));
await db.delete(schema.platformSettings).where(sqlEq(schema.platformSettings.key, "missions.milestones"));
void runStartOf;

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
