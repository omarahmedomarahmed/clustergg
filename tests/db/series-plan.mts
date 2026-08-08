/**
 * B91.3 — a series, planned all the way out.
 *
 * A repeating challenge used to be a chain: run 1 exists, run 2 is created when
 * run 1 finishes. Fine for a machine, useless for everybody else — the month a
 * brand bought did not exist, so nobody could look at it, announce week 2
 * early, or tell a gamer this is week 2 of 8.
 *
 * The assertions that matter are about DATES: consecutive with no gap and no
 * overlap, computed from the first start rather than accumulated, and a monthly
 * series that keeps its day of the month.
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
  planRuns, materialiseSeries, runsOfSeries, nextToAnnounce, upcomingRuns, isSeries, MAX_RUNS, planSummary,
} = await import("../../lib/series-plan.ts");
const { stageOf } = await import("../../lib/challenge-stage.ts");

const db = await getDb();
const tag = uid().slice(0, 6);
const iso = (d: Date) => d.toISOString().slice(0, 10);

console.log("== weekly, eight of them ==");
{
  const start = new Date("2026-09-07T00:00:00Z"); // a Monday
  const runs = planRuns(start, "weekly", 8);
  eq("eight runs", runs.length, 8);
  eq("the first starts when asked", iso(runs[0].startAt), "2026-09-07");
  eq("…and ends a week later", iso(runs[0].endAt), "2026-09-14");

  // Consecutive means consecutive: no gap a gamer falls into, no overlap where
  // one account is scored in two runs of the same series at once.
  ok("every run starts exactly when the one before ended",
    runs.every((r, i) => i === 0 || +r.startAt === +runs[i - 1].endAt),
    JSON.stringify(runs.map((r) => iso(r.startAt))));

  // Computed from the FIRST start, not accumulated — the reason week 8 cannot
  // drift onto a Tuesday.
  eq("week eight is exactly seven weeks after week one", iso(runs[7].startAt), "2026-10-26");
  ok("…and it is still a Monday", runs[7].startAt.getUTCDay() === 1, String(runs[7].startAt.getUTCDay()));
}

console.log("\n== two months of weekly is what a sales deal sounds like ==");
{
  const runs = planRuns(new Date("2026-09-07T00:00:00Z"), "weekly", 8);
  ok("the summary says it in the units it was sold in",
    /8 weeks/.test(planSummary(runs, "weekly")), planSummary(runs, "weekly"));
}

console.log("\n== monthly keeps its day of the month ==");
{
  // A brand that buys the 31st for six months and gets the 30th, the 29th, the
  // 28th has been given something it did not ask for.
  const runs = planRuns(new Date("2026-01-31T00:00:00Z"), "monthly", 4);
  eq("january", iso(runs[0].startAt), "2026-01-31");
  eq("february clamps to the last day rather than jumping a month", iso(runs[1].startAt), "2026-02-28");
  eq("march is the 31st again, not the 28th", iso(runs[2].startAt), "2026-03-31");
  eq("april clamps to 30", iso(runs[3].startAt), "2026-04-30");
}

console.log("\n== the bounds ==");
{
  eq("zero runs is one run", planRuns(new Date(), "weekly", 0).length, 1);
  eq("nonsense is one run", planRuns(new Date(), "weekly", Number.NaN).length, 1);
  eq("a thousand is capped", planRuns(new Date(), "weekly", 1000).length, MAX_RUNS);
}

console.log("\n== materialising writes drafts, not live challenges ==");
{
  const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces).limit(1);
  const seriesId = uid();
  const start = new Date(Date.now() + 7 * 86400_000);
  const windows = planRuns(start, "weekly", 4);

  // Run 1, the way the admin action writes it.
  await db.insert(schema.challenges).values({
    id: seriesId, spaceId: space?.id, title: `Series ${tag} — Week 1`, baseTitle: `Series ${tag}`,
    game: "Chess.com", provider: "chesscom", format: "leaderboard", status: "draft",
    startAt: windows[0].startAt, endAt: windows[0].endAt,
    cadence: "weekly", seriesId, runIndex: 1, runsPlanned: 4,
  } as never);

  const res = await materialiseSeries(db, {
    seriesId,
    template: { spaceId: space?.id, game: "Chess.com", provider: "chesscom", format: "leaderboard", cadence: "weekly", baseTitle: `Series ${tag}` },
    windows: windows.slice(1),
  });
  eq("three more runs were written", res.created, 3);

  const runs = await runsOfSeries(db, seriesId);
  eq("the series is four runs", runs.length, 4);
  eq("…in order", runs.map((r) => r.runIndex), [1, 2, 3, 4]);
  ok("…every one of them a draft", runs.every((r) => r.status === "draft"),
    JSON.stringify(runs.map((r) => r.status)));
  ok("…titled by week", runs.every((r, i) => r.title.includes(`Week ${i + 1}`)),
    JSON.stringify(runs.map((r) => r.title)));

  // The reason they are drafts: an UNPAID one reads as a draft everywhere, and
  // a PAID one reads as queued — which is the rung that can be announced.
  eq("an unpaid run reads as a draft", stageOf({ ...runs[3], paid: false }), "draft");
  eq("…and a paid one is queued, ready to announce", stageOf({ ...runs[3], paid: true }), "queued");

  // Idempotent: a retry after a partial failure completes the series rather
  // than duplicating it. A brand who paid for four weeks and got seven rows is
  // the same conversation as one who got three.
  const again = await materialiseSeries(db, {
    seriesId,
    template: { spaceId: space?.id, game: "Chess.com", provider: "chesscom", format: "leaderboard", cadence: "weekly", baseTitle: `Series ${tag}` },
    windows: windows.slice(1),
  });
  eq("running it twice writes nothing", again.created, 0);
  eq("…and the series is still four runs", (await runsOfSeries(db, seriesId)).length, 4);

  ok("it knows it is a series", await isSeries(db, seriesId));
  eq("…with four runs still ahead", (await upcomingRuns(db, seriesId)).length, 4);

  // At most ONE run should be announced at a time. Telling a server about
  // weeks 2, 3 and 4 in the same minute is the noise the ladder exists to stop.
  const next = await nextToAnnounce(db, seriesId);
  eq("the next one to announce is week 1", next?.runIndex, 1);
  await db.update(schema.challenges).set({ announcedAt: new Date() })
    .where((await import("drizzle-orm")).eq(schema.challenges.id, seriesId));
  eq("…and once it is announced, week 2 is next", (await nextToAnnounce(db, seriesId))?.runIndex, 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
