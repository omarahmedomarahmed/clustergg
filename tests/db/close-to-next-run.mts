/**
 * B91.6 — the seam between two runs of a series.
 *
 * B91.3 changed what "the next run already exists" means. It used to be the
 * rare double-call case; now every run is written up front, so it is the NORMAL
 * case — and the branch that handled it returned early. Left alone, that is a
 * weekly series that silently stops after week one: week 2 sits as a draft,
 * never activated, never carrying week 1's field, never announced.
 *
 * The other half of this file is the close itself: placements frozen, trophies
 * on profiles, and everybody told where they came.
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
const { closeChallenge } = await import("../../lib/challenges.ts");
const { planRuns, materialiseSeries, runsOfSeries } = await import("../../lib/series-plan.ts");
const { eq: dEq, and } = await import("drizzle-orm");

const db = await getDb();
const tag = uid().slice(0, 6);
const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces).limit(1);

// Two gamers with linked accounts, so there is a podium to freeze.
const gamers: { id: string; accountId: string }[] = [];
for (let i = 0; i < 2; i++) {
  const id = uid();
  await db.insert(schema.users).values({
    id, email: `${id}@seam.test`, displayName: `Seam ${i} ${tag}`,
    slug: `seam-${tag}-${i}-${id.slice(0, 4)}`, passwordHash: "x",
    ageBand: "adult", unlockedAt: new Date(), country: "US",
  });
  const accountId = uid();
  await db.insert(schema.linkedGameAccounts).values({
    id: accountId, userId: id, provider: "chesscom",
    providerAccountId: `seam-${tag}-${i}`, inGameName: `p${i}`, verified: true,
  });
  gamers.push({ id, accountId });
}

// A two-run weekly series: week 1 running and about to end, week 2 written
// ahead as a draft — exactly what the admin builder produces now.
const seriesId = uid();
const windows = planRuns(new Date(Date.now() - 7 * 86400_000), "weekly", 2);
const template = {
  spaceId: space?.id, game: "Chess.com", provider: "chesscom",
  format: "top3", cadence: "weekly", baseTitle: `Seam ${tag}`,
  pointsEngine: { wins: 10 },
};
await db.insert(schema.challenges).values({
  ...template, id: seriesId, title: `Seam ${tag} — Week 1`,
  status: "active", startAt: windows[0].startAt, endAt: windows[0].endAt,
  seriesId, runIndex: 1, runsPlanned: 2,
} as never);
await materialiseSeries(db, { seriesId, template, windows: windows.slice(1) });

for (const [i, g] of gamers.entries()) {
  await db.insert(schema.challengeParticipants).values({
    id: uid(), challengeId: seriesId, userId: g.id, linkedAccountId: g.accountId,
    baseline: {}, baselineAt: windows[0].startAt, currentPoints: 100 - i * 10,
  } as never);
}

console.log("== closing week one freezes the podium ==");
{
  const res = await closeChallenge(seriesId);
  ok("it closed", res.ok, JSON.stringify(res));

  const [c] = await db.select({ status: schema.challenges.status }).from(schema.challenges)
    .where(dEq(schema.challenges.id, seriesId));
  eq("the run is completed", c.status, "completed");

  const parts = await db.select({
    userId: schema.challengeParticipants.userId,
    place: schema.challengeParticipants.finalPlacement,
    status: schema.challengeParticipants.status,
  }).from(schema.challengeParticipants).where(dEq(schema.challengeParticipants.challengeId, seriesId));
  ok("every entrant has a frozen placement", parts.every((p) => (p.place ?? 0) > 0),
    JSON.stringify(parts));
  ok("…and the higher score placed first",
    parts.find((p) => p.userId === gamers[0].id)?.place === 1, JSON.stringify(parts));

  // Everybody hears where they finished, not just the podium. A gamer who
  // played all week and is told nothing assumes the thing was abandoned.
  const notes = await db.select({ userId: schema.notifications.userId })
    .from(schema.notifications)
    .where(and(dEq(schema.notifications.type, "challenge"),
      dEq(schema.notifications.userId, gamers[1].id)));
  ok("the one who did not win was still told", notes.length > 0, String(notes.length));
}

console.log("\n== …and week two actually opens ==");
{
  const runs = await runsOfSeries(db, seriesId);
  eq("the series is still two runs, not three", runs.length, 2);

  const week2 = runs[1];
  // THE BUG THIS FILE EXISTS FOR. `openNextRun` found week 2 already written
  // and returned early, leaving it a draft with nobody in it — a weekly series
  // that silently stops after week one.
  ok("week two is no longer a draft", week2.status !== "draft", week2.status);

  const carried = await db.select({ userId: schema.challengeParticipants.userId })
    .from(schema.challengeParticipants).where(dEq(schema.challengeParticipants.challengeId, week2.id));
  eq("…and week one's field was carried into it", carried.length, 2);

  // Carried at ZERO. Copying the old baseline would carry a whole week's play
  // into the new week and hand week 1's winner an insurmountable head start.
  const points = await db.select({ n: schema.challengeParticipants.currentPoints })
    .from(schema.challengeParticipants).where(dEq(schema.challengeParticipants.challengeId, week2.id));
  ok("…starting from zero", points.every((p) => p.n === 0), JSON.stringify(points));

  // And stamped, or the scorer treats them as pre-B91 rows and never
  // rebaselines them at week 2's start line.
  const stamps = await db.select({ at: schema.challengeParticipants.baselineAt })
    .from(schema.challengeParticipants).where(dEq(schema.challengeParticipants.challengeId, week2.id));
  ok("…with the baseline stamped, so the start line still applies",
    stamps.every((s) => !!s.at), JSON.stringify(stamps));
}

console.log("\n== closing twice does nothing twice ==");
{
  const again = await closeChallenge(seriesId);
  eq("the second close is a no-op", again.reason, "already_completed");
  eq("…and no third run appeared", (await runsOfSeries(db, seriesId)).length, 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
