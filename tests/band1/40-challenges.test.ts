// Stage 4 — challenges, baselining, scoring, and the entry chain.
//
// The baselining cases below are the ones docs/03-CHALLENGES.md §2 says are
// most likely to be built wrong, and they are written as the document frames
// them: the two obvious rules are each correct in one direction and exploitable
// in the other, and only `max(challengeStart, joinedAt)` is right in both.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import {
  weekStartFor,
  weekFor,
  isPeriodBoundary,
  earliestSellableWeek,
  phaseAt,
  joiningLateNotice,
  periodEnd,
} from "../../lib/challenges/week.ts";
import {
  baselineAtFor,
  scoreFrom,
  scoreOf,
  standingsOf,
  DEFAULT_METRIC_WEIGHTS,
} from "../../lib/challenges/scoring.ts";
import {
  createChallenge,
  attachInvoice,
  markScheduled,
  announce,
  readinessOf,
  fireTheGun,
  TransitionRefused,
} from "../../lib/challenges/lifecycle.ts";
import { enterChallenge } from "../../lib/challenges/entry.ts";
import { stampBaselinesAtGun, closeChallenges, freezeOnUnlink } from "../../lib/challenges/jobs.ts";
import { createInvoice, markPaid } from "../../lib/money/invoices.ts";
import { createGamer, setAgeBand, setCountry } from "../../lib/identity/gamers.ts";
import { linkAccount } from "../../lib/identity/accounts.ts";
import { CHALLENGE_PRICE_CENTS } from "../../lib/money/amounts.ts";
import { ADAPTERS, type StatsResult } from "../../lib/providers/adapters.ts";
import { PROVIDERS } from "../../lib/providers/registry.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";

// ── A provider the suite controls, so "what the game says" is a variable.
const FAKE = "test-challenge-provider";
if (!PROVIDERS.some((p) => p.id === FAKE)) {
  PROVIDERS.push({
    id: FAKE,
    name: "Test Game",
    game: "Test Game",
    glyph: "◆",
    color: "#888",
    authType: "public",
    envVars: [],
    identifierLabel: "Name",
    phase: 1,
    capabilities: [
      { key: "wins", label: "Wins", higherIsBetter: true },
      { key: "matches", label: "Matches", higherIsBetter: true },
      { key: "solo_tier", label: "Tier", higherIsBetter: true, ranks: [{ value: 0, label: "Bronze" }] },
    ],
  });
}

const game = { wins: 0, matches: 0, solo_tier: 0 };

ADAPTERS[FAKE] = {
  async verify() {
    return { ok: true as const, accountId: "a", name: "n" };
  },
  async fetchStats(): Promise<StatsResult> {
    return {
      ok: true,
      metrics: Object.fromEntries(Object.entries(game).map(([k, v]) => [k, { value: v }])),
    };
  },
};

const MONDAY = new Date("2026-09-07T00:00:00Z");
const FRIDAY = new Date("2026-09-11T00:00:00Z");

/** A gamer who has finished onboarding and linked an account on the fake game. */
async function aGamer(db: DB, name: string) {
  const userId = await createGamer(db, { displayName: name });
  const { id: accountId } = await linkAccount(db, {
    userId,
    provider: FAKE,
    providerAccountId: `acct-${name}-${uid()}`,
    inGameName: name,
    verifiedMethod: "exists",
  });
  await setAgeBand(db, userId, "adult");
  await setCountry(db, userId, "GB");
  return { userId, accountId };
}

/** A paid, set-up, announced challenge starting Monday. */
async function aChallenge(
  db: DB,
  opts: { prizePoolCents?: number; rankMin?: number; rankMax?: number; queue?: string } = {},
) {
  const prize = opts.prizePoolCents ?? 0;
  const challengeId = await createChallenge(db, {
    title: "Test Challenge",
    game: "Test Game",
    provider: FAKE,
    startAt: MONDAY,
    prizePoolCents: prize,
    metrics: DEFAULT_METRIC_WEIGHTS,
    rankMin: opts.rankMin ?? null,
    rankMax: opts.rankMax ?? null,
    queue: opts.queue ?? "solo",
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "Challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, challengeId, invoiceId);
  await markPaid(db, invoiceId);
  await markScheduled(db, challengeId);
  if (prize > 0) {
    await db.insert(schema.trophies).values({
      id: uid(),
      type: "podium",
      name: "First",
      valueCents: prize,
      challengeId,
      place: 1,
    });
  }
  await announce(db, challengeId, "admin-1", []);
  return challengeId;
}

// ── The week ────────────────────────────────────────────────────────────────

test("a week is Monday 00:00 UTC to Friday 00:00 UTC", () => {
  const w = weekFor(new Date("2026-09-09T13:37:00Z"));
  eq(w.start.toISOString(), "2026-09-07T00:00:00.000Z", "the gun is Monday midnight UTC");
  eq(w.end.toISOString(), "2026-09-11T00:00:00.000Z", "the close is Friday midnight UTC");
  eq(weekStartFor(new Date("2026-09-13T23:59:59Z")).toISOString(), "2026-09-07T00:00:00.000Z",
    "Sunday still belongs to the week that started on Monday");
  eq(weekStartFor(MONDAY).toISOString(), MONDAY.toISOString(), "and Monday is its own start");
});

test("five days of competition, two of grace", () => {
  eq(phaseAt(new Date("2026-09-08T12:00:00Z")), "run", "Tuesday is the competition");
  eq(phaseAt(new Date("2026-09-10T23:59:00Z")), "run", "and so is Thursday night");
  eq(phaseAt(new Date("2026-09-11T00:00:00Z")), "grace", "Friday midnight closes it");
  eq(phaseAt(new Date("2026-09-12T12:00:00Z")), "grace", "Saturday is the grace period");
});

test("there is no date picker, and the model is what enforces it", async () => {
  const db = await resetDemoDb();
  ok(isPeriodBoundary(MONDAY, "weekly"), "Monday midnight is a legal weekly start");
  no(isPeriodBoundary(new Date("2026-09-08T00:00:00Z"), "weekly"), "Tuesday is not");
  no(isPeriodBoundary(new Date("2026-09-07T09:00:00Z"), "weekly"), "and neither is Monday morning");

  await throws(
    () =>
      createChallenge(db, {
        title: "Wednesday",
        game: "Test Game",
        provider: FAKE,
        startAt: new Date("2026-09-09T00:00:00Z"),
      }),
    /week boundary/,
    "a script, a fixture and a form all hit the same refusal",
  );
});

test("bought mid-week means next week, never this one", () => {
  const wednesday = new Date("2026-09-09T15:00:00Z");
  eq(
    earliestSellableWeek(wednesday).toISOString(),
    "2026-09-14T00:00:00.000Z",
    "the gun has already fired on this week",
  );
});

test("a late joiner is told what they are getting into", () => {
  eq(joiningLateNotice(new Date("2026-09-09T00:00:00Z")), "Scoring starts now. 2 days left.",
    "the words the card shows, from the module that knows the week");
  eq(joiningLateNotice(new Date("2026-09-10T22:00:00Z")), "Scoring starts now. 2 hours left.",
    "and it counts down to hours near the end");
  eq(joiningLateNotice(MONDAY), null, "nobody is late in the first hour");
});

test("a daily challenge ends at midnight, a weekly one on Friday", () => {
  eq(periodEnd(MONDAY, "daily").toISOString(), "2026-09-08T00:00:00.000Z", "one day");
  eq(periodEnd(MONDAY, "weekly").toISOString(), FRIDAY.toISOString(), "five days");
});

// ── Baselining: the three cases from the document ───────────────────────────

test("the rule is max(challengeStart, joinedAt), in both directions", () => {
  const early = new Date("2026-09-03T12:00:00Z");
  const dayTwo = new Date("2026-09-08T12:00:00Z");

  eq(baselineAtFor(MONDAY, early).toISOString(), MONDAY.toISOString(),
    "joining before the gun baselines AT the gun — nothing from before the week counts");
  eq(baselineAtFor(MONDAY, dayTwo).toISOString(), dayTwo.toISOString(),
    "joining on day 2 baselines at join — they cannot bank days 1 and 2");
});

test("the early joiner does not score for the week before the gun", async () => {
  const db = await resetDemoDb();
  const challengeId = await aChallenge(db);
  const { userId } = await aGamer(db, "Early");

  // They join on announcement day, having already played all week.
  Object.assign(game, { wins: 100, matches: 200, solo_tier: 0 });
  const joinedAt = new Date("2026-09-03T12:00:00Z");
  const entry = await enterChallenge(db, { challengeId, userId }, joinedAt);
  ok(entry.ok, "they are in");
  no(entry.baselineStamped, "and their baseline waits for the gun");

  // More ordinary play before Monday. None of it may count.
  Object.assign(game, { wins: 140, matches: 260, solo_tier: 0 });
  await stampBaselinesAtGun(db, MONDAY);

  const [p] = await db
    .select()
    .from(schema.challengeParticipants)
    .where(sqlEq(schema.challengeParticipants.userId, userId));
  eq(p.baselineAt?.toISOString(), MONDAY.toISOString(), "the baseline is dated at the gun");

  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(sqlEq(schema.challenges.id, challengeId));
  const atGun = await scoreOf(db, p, challenge, new Date("2026-09-07T00:01:00Z"));
  eq(atGun.points, 0, "and they start the week on zero, not on a week of banked play");

  // Now they actually compete.
  Object.assign(game, { wins: 145, matches: 270 });
  const { forceSync } = await import("../../lib/core/sync.ts");
  await forceSync(db, p.linkedAccountId, { at: new Date("2026-09-08T12:00:00Z") });
  const later = await scoreOf(db, p, challenge, new Date("2026-09-09T00:00:00Z"));
  eq(later.points, 5 * 10 + 10 * 1, "5 wins and 10 matches inside the week");
});

test("the day-2 joiner does not bank days 1 and 2", async () => {
  const db = await resetDemoDb();
  const challengeId = await aChallenge(db);
  const { userId } = await aGamer(db, "DayTwo");

  // The gun fires. They are not in it yet, and they play hard for two days.
  Object.assign(game, { wins: 10, matches: 20, solo_tier: 0 });
  await stampBaselinesAtGun(db, MONDAY);
  Object.assign(game, { wins: 40, matches: 90, solo_tier: 0 });

  const dayTwo = new Date("2026-09-09T00:00:00Z");
  const entry = await enterChallenge(db, { challengeId, userId }, dayTwo);
  ok(entry.ok, "they join on day 2");
  ok(entry.baselineStamped, "and their baseline is stamped now, not at the gun");

  const [p] = await db
    .select()
    .from(schema.challengeParticipants)
    .where(sqlEq(schema.challengeParticipants.userId, userId));
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(sqlEq(schema.challenges.id, challengeId));

  eq(
    p.baselineAt?.toISOString(),
    dayTwo.toISOString(),
    "the baseline is dated at their join, not at the gun",
  );
  eq(
    p.baseline?.wins,
    40,
    "and its VALUES are what the account read at that instant, not at the gun — " +
      "storing the date from the rule and the numbers from 'now' is how a " +
      "broken rule produces a right-looking score",
  );

  const atJoin = await scoreOf(db, p, challenge, dayTwo);
  eq(atJoin.points, 0, "the 30 wins they made on days 1 and 2 are not theirs to bank");
  ok(entry.notice !== null, "and the card tells them scoring starts now");
});

test("the final-second joiner scores about nothing and is still an entrant", async () => {
  const db = await resetDemoDb();
  const challengeId = await aChallenge(db);
  const { userId } = await aGamer(db, "LastSecond");

  Object.assign(game, { wins: 500, matches: 900, solo_tier: 0 });
  const lastSecond = new Date(FRIDAY.getTime() - 1000);
  const entry = await enterChallenge(db, { challengeId, userId }, lastSecond);
  ok(entry.ok, "B5 — they may join until the final second");

  const [p] = await db
    .select()
    .from(schema.challengeParticipants)
    .where(sqlEq(schema.challengeParticipants.userId, userId));
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(sqlEq(schema.challenges.id, challengeId));
  eq((await scoreOf(db, p, challenge, FRIDAY)).points, 0, "with a score of zero");
});

test("two challenges on one account keep two independent baselines", async () => {
  // This is the case that makes every simpler design wrong, and it is why the
  // baseline is stored per (challenge, participant) rather than per account.
  const db = await resetDemoDb();
  const a = await aChallenge(db);
  const b = await aChallenge(db);
  const { userId } = await aGamer(db, "TwoChallenges");

  Object.assign(game, { wins: 10, matches: 20, solo_tier: 0 });
  await enterChallenge(db, { challengeId: a, userId }, new Date("2026-09-03T00:00:00Z"));
  await stampBaselinesAtGun(db, MONDAY);

  // Day 2: they have played, and now they enter the second challenge.
  Object.assign(game, { wins: 25, matches: 50, solo_tier: 0 });
  const dayTwo = new Date("2026-09-09T00:00:00Z");
  await enterChallenge(db, { challengeId: b, userId }, dayTwo);

  Object.assign(game, { wins: 30, matches: 60, solo_tier: 0 });
  const { forceSync } = await import("../../lib/core/sync.ts");
  const [account] = await db.select().from(schema.linkedGameAccounts);
  await forceSync(db, account.id, { at: new Date("2026-09-09T12:00:00Z") });

  const now = new Date("2026-09-10T00:00:00Z");
  const standingsA = await standingsOf(db, a, now);
  const standingsB = await standingsOf(db, b, now);

  eq(standingsA[0].points, 20 * 10 + 40 * 1, "challenge A counts from the gun: 20 wins, 40 matches");
  eq(standingsB[0].points, 5 * 10 + 10 * 1, "challenge B counts from day 2: 5 wins, 10 matches");
  ok(standingsA[0].points !== standingsB[0].points, "and the two do not interfere");
});

// ── Scoring ─────────────────────────────────────────────────────────────────

test("points are wins times ten plus matches", () => {
  const { points, deltas } = scoreFrom({ wins: 10, matches: 30 }, { wins: 14, matches: 42 });
  eq(deltas.wins, 4, "four wins");
  eq(deltas.matches, 12, "twelve matches");
  eq(points, 4 * 10 + 12 * 1, "and the score is the sum of the weighted deltas");
});

test("a decline never subtracts", () => {
  const { points, deltas } = scoreFrom({ wins: 50, matches: 100 }, { wins: 45, matches: 90 });
  eq(deltas.wins, 0, "a fall clamps at zero");
  eq(points, 0, "and the score never goes negative");
});

test("a metric the baseline never saw starts where it is", () => {
  // A lifetime counter that first appears mid-challenge is not five hundred
  // wins earned this week.
  const { deltas } = scoreFrom({ matches: 10 }, { wins: 500, matches: 20 });
  eq(deltas.wins, 0, "the newly discovered counter contributes nothing");
  eq(deltas.matches, 10, "while the one that was baselined counts normally");
});

test("volume beats win rate, deliberately", () => {
  // The accepted consequence, stated in the document: 50% over 40 games beats
  // 70% over 20. Grinding is a legitimate way to win a week.
  const grinder = scoreFrom({ wins: 0, matches: 0 }, { wins: 20, matches: 40 });
  const sharpshooter = scoreFrom({ wins: 0, matches: 0 }, { wins: 14, matches: 20 });
  ok(grinder.points > sharpshooter.points, "40 games at 50% beats 20 at 70%");
});

test("a season reset re-baselines rather than costing the week", async () => {
  const db = await resetDemoDb();
  const challengeId = await aChallenge(db);
  const { userId } = await aGamer(db, "SplitVictim");

  Object.assign(game, { wins: 100, matches: 200, solo_tier: 0 });
  await enterChallenge(db, { challengeId, userId }, MONDAY);

  const { forceSync } = await import("../../lib/core/sync.ts");
  const [account] = await db.select().from(schema.linkedGameAccounts);

  // Two days of real play.
  Object.assign(game, { wins: 110, matches: 225 });
  await forceSync(db, account.id, { at: new Date("2026-09-08T12:00:00Z") });

  const [p1] = await db.select().from(schema.challengeParticipants);
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(sqlEq(schema.challenges.id, challengeId));
  eq(
    (await scoreOf(db, p1, challenge, new Date("2026-09-09T00:00:00Z"))).points,
    10 * 10 + 25,
    "10 wins and 25 matches so far",
  );

  // Riot zeroes the split mid-week.
  Object.assign(game, { wins: 0, matches: 0 });
  await forceSync(db, account.id, { at: new Date("2026-09-09T00:00:00Z") });
  // And they keep playing on the new season.
  Object.assign(game, { wins: 3, matches: 7 });
  await forceSync(db, account.id, { at: new Date("2026-09-09T18:00:00Z") });

  const [p2] = await db.select().from(schema.challengeParticipants);
  const after = await scoreOf(db, p2, challenge, new Date("2026-09-10T00:00:00Z"));
  eq(
    after.points,
    (10 + 3) * 10 + (25 + 7),
    "the week they earned before the reset is kept, and the new season adds to it",
  );
  ok(
    after.points > 0,
    "the naive clamp would have read zero here — silently, for every League player, every split",
  );
});

// ── The lifecycle ───────────────────────────────────────────────────────────

test("an unpaid challenge can never be announced", async () => {
  const db = await resetDemoDb();
  const challengeId = await createChallenge(db, {
    title: "Unpaid",
    game: "Test Game",
    provider: FAKE,
    startAt: MONDAY,
    metrics: DEFAULT_METRIC_WEIGHTS,
  });

  await throws(
    () => announce(db, challengeId, "admin-1", []),
    /cannot be announced/,
    "a draft is not announceable",
  );

  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "Challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, challengeId, invoiceId);

  await throws(
    () => markScheduled(db, challengeId),
    /not paid/,
    "and an issued bill is not a paid one",
  );
  await throws(
    () => announce(db, challengeId, "admin-1", []),
    /cannot be announced/,
    "so there is no path to announced that does not go through payment",
  );
});

test("nothing announces itself", async () => {
  const db = await resetDemoDb();
  const challengeId = await aChallenge(db);
  await throws(
    () => announce(db, challengeId, "", []),
    /always an admin click/,
    "a job has no actor, so a job cannot announce",
  );
});

test("the dashboard says everything that is blocking, not the first thing", async () => {
  const db = await resetDemoDb();
  const challengeId = await createChallenge(db, {
    title: "Blocked",
    game: "Test Game",
    provider: FAKE,
    startAt: MONDAY,
    prizePoolCents: 17_500,
  });

  const readiness = await readinessOf(db, challengeId);
  no(readiness.ready, "it is not ready");
  ok(readiness.problems.includes("no_invoice"), "no bill");
  ok(readiness.problems.includes("no_metrics"), "no metrics");
  ok(readiness.problems.includes("no_trophies"), "no trophies");
  eq(readiness.problems.length, 3, "and all three are reported at once, not one per round trip");
  ok(
    readiness.blocking.every((b) => b.length > 20),
    "each one explained in a sentence a human can act on",
  );
});

test("the prize-pool guard flags over and under", async () => {
  const db = await resetDemoDb();
  const challengeId = await createChallenge(db, {
    title: "Guarded",
    game: "Test Game",
    provider: FAKE,
    startAt: MONDAY,
    prizePoolCents: 17_500,
    metrics: DEFAULT_METRIC_WEIGHTS,
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "Challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, challengeId, invoiceId);
  await markPaid(db, invoiceId);
  await markScheduled(db, challengeId);

  const trophyId = uid();
  await db.insert(schema.trophies).values({
    id: trophyId,
    type: "podium",
    name: "First",
    valueCents: 10_000,
    challengeId,
    place: 1,
  });
  const under = await readinessOf(db, challengeId);
  ok(under.problems.includes("prize_pool_mismatch"), "under is a mismatch");
  ok(under.blocking.some((b) => /under by \$75\.00/.test(b)), "and it says by how much");

  await db
    .update(schema.trophies)
    .set({ valueCents: 25_000 })
    .where(sqlEq(schema.trophies.id, trophyId));
  const over = await readinessOf(db, challengeId);
  ok(over.problems.includes("prize_pool_mismatch"), "over is a mismatch too");
  ok(over.blocking.some((b) => /over by \$75\.00/.test(b)), "and it says by how much");

  await db
    .update(schema.trophies)
    .set({ valueCents: 17_500 })
    .where(sqlEq(schema.trophies.id, trophyId));
  ok((await readinessOf(db, challengeId)).ready, "exactly equal passes");
});

test("a paid challenge whose trophies do not match the pool cannot be announced", async () => {
  // L5: the prize-pool guard must pass before an announcement. This test
  // exists because breaking the readiness check inside `announce` was caught
  // by nothing — every other test either announces a correctly set-up
  // challenge or is stopped earlier by the unpaid check. The guard was real,
  // reachable, and never called in the state it refuses.
  const db = await resetDemoDb();
  const challengeId = await createChallenge(db, {
    title: "Mismatched",
    game: "Test Game",
    provider: FAKE,
    startAt: MONDAY,
    prizePoolCents: 17_500,
    metrics: DEFAULT_METRIC_WEIGHTS,
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "Challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, challengeId, invoiceId);
  await markPaid(db, invoiceId);
  await markScheduled(db, challengeId);

  const trophyId = uid();
  await db.insert(schema.trophies).values({
    id: trophyId,
    type: "podium",
    name: "First",
    valueCents: 10_000,
    challengeId,
    place: 1,
  });

  const err = await throws(
    () => announce(db, challengeId, "admin-1", []),
    /not ready to announce/,
    "paid is not the same as ready — the pool guard still has to pass",
  );
  ok(err instanceof TransitionRefused, "with the transition error");
  ok(/under by \$75\.00/.test(err.message), "and it says exactly what is wrong");

  const [still] = await db
    .select()
    .from(schema.challenges)
    .where(sqlEq(schema.challenges.id, challengeId));
  eq(still.state, "scheduled", "and the challenge did not move");

  // Metrics missing is refused the same way, so the guard is not one check
  // wearing a general name.
  await db
    .update(schema.trophies)
    .set({ valueCents: 17_500 })
    .where(sqlEq(schema.trophies.id, trophyId));
  await db
    .update(schema.challenges)
    .set({ metrics: null })
    .where(sqlEq(schema.challenges.id, challengeId));
  await throws(
    () => announce(db, challengeId, "admin-1", []),
    /Metrics are not set/,
    "a challenge with nothing to score cannot be announced either",
  );

  await db
    .update(schema.challenges)
    .set({ metrics: DEFAULT_METRIC_WEIGHTS })
    .where(sqlEq(schema.challenges.id, challengeId));
  await announce(db, challengeId, "admin-1", []);
  const [announced] = await db
    .select()
    .from(schema.challenges)
    .where(sqlEq(schema.challenges.id, challengeId));
  eq(announced.state, "announced", "and once it is right, it announces");
});

test("the gun moves announced challenges to live", async () => {
  const db = await resetDemoDb();
  const challengeId = await aChallenge(db);
  eq(await fireTheGun(db, new Date("2026-09-06T00:00:00Z")), [], "not before Monday");
  eq(await fireTheGun(db, MONDAY), [challengeId], "and at Monday midnight it fires");
});

// ── The entry chain ─────────────────────────────────────────────────────────

test("a half-onboarded gamer is refused, naming the step", async () => {
  const db = await resetDemoDb();
  const challengeId = await aChallenge(db);
  const userId = await createGamer(db, { displayName: "Halfway" });
  await linkAccount(db, {
    userId,
    provider: FAKE,
    providerAccountId: "acct-halfway",
    verifiedMethod: "exists",
  });

  const result = await enterChallenge(db, { challengeId, userId }, MONDAY);
  no(result.ok, "refused");
  eq(result.ok ? "" : result.code, "onboarding", "with the onboarding code");
  ok(!result.ok && /ageBand/.test(result.reason), "and the reason names what is missing");
});

test("ownership is checked before rank", async () => {
  // R8. The rank test reads numbers off an account; running it first would
  // tell somebody the rank of an account they have not shown they own.
  const db = await resetDemoDb();
  const challengeId = await aChallenge(db, { rankMin: 1_000_000 });
  const userId = await createGamer(db, { displayName: "Unproven" });
  await linkAccount(db, {
    userId,
    provider: "riot-lol",
    providerAccountId: "puuid-unproven",
    verifiedMethod: "exists",
  });
  await setAgeBand(db, userId, "adult");
  await setCountry(db, userId, "GB");

  const riotChallenge = await createChallenge(db, {
    title: "Riot",
    game: "League of Legends",
    provider: "riot-lol",
    startAt: MONDAY,
    metrics: DEFAULT_METRIC_WEIGHTS,
    rankMin: 1_000_000,
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "c", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, riotChallenge, invoiceId);
  await markPaid(db, invoiceId);
  await markScheduled(db, riotChallenge);
  await announce(db, riotChallenge, "admin-1", []);

  const result = await enterChallenge(db, { challengeId: riotChallenge, userId }, MONDAY);
  no(result.ok, "refused");
  eq(
    result.ok ? "" : result.code,
    "unproven",
    "for ownership, not for rank — the rank test was never reached",
  );
  void challengeId;
});

test("an unprovable game carries no penalty at all", async () => {
  // G5/O2/O3. Chess.com cannot prove ownership, and that is not the gamer's
  // fault. No badge, no warning, no second class — and no refusal.
  const db = await resetDemoDb();
  const challengeId = await aChallenge(db);
  const { userId } = await aGamer(db, "Unprovable");
  const result = await enterChallenge(db, { challengeId, userId }, MONDAY);
  ok(result.ok, "an account that merely exists enters a game that cannot prove ownership");
});

test("the rank gate is a range, and the refusal shows the numbers", async () => {
  const db = await resetDemoDb();
  Object.assign(game, { wins: 0, matches: 0, solo_tier: 1_200 });

  const tooLow = await aChallenge(db, { rankMin: 2_000 });
  const { userId: low } = await aGamer(db, "TooLow");
  const belowResult = await enterChallenge(db, { challengeId: tooLow, userId: low }, MONDAY);
  eq(belowResult.ok ? "" : belowResult.code, "rank_below", "below the range is refused");
  ok(!belowResult.ok && /1200/.test(belowResult.reason), "and the reason shows their rank");
  ok(!belowResult.ok && /2000/.test(belowResult.reason), "and the range");

  const tooHigh = await aChallenge(db, { rankMax: 800 });
  const { userId: high } = await aGamer(db, "TooHigh");
  const aboveResult = await enterChallenge(db, { challengeId: tooHigh, userId: high }, MONDAY);
  eq(aboveResult.ok ? "" : aboveResult.code, "rank_above", "and above the range is too");

  const open = await aChallenge(db);
  const { userId: any } = await aGamer(db, "Ungated");
  ok((await enterChallenge(db, { challengeId: open, userId: any }, MONDAY)).ok,
    "while the default is no gate at all");
});

test("the rank gate is never re-checked after joining", async () => {
  // R2/R3: they will rank up during the week, and that is the point.
  const db = await resetDemoDb();
  Object.assign(game, { wins: 0, matches: 0, solo_tier: 1_200 });
  const challengeId = await aChallenge(db, { rankMax: 1_500 });
  const { userId } = await aGamer(db, "Climber");
  ok((await enterChallenge(db, { challengeId, userId }, MONDAY)).ok, "in range at join");

  // They climb straight past the ceiling.
  Object.assign(game, { wins: 40, matches: 60, solo_tier: 5_000 });
  const { forceSync } = await import("../../lib/core/sync.ts");
  const [account] = await db.select().from(schema.linkedGameAccounts);
  await forceSync(db, account.id, { at: new Date("2026-09-09T00:00:00Z") });

  const standings = await standingsOf(db, challengeId, new Date("2026-09-10T00:00:00Z"));
  eq(standings.length, 1, "they are still in the challenge");
  ok(standings[0].points > 0, "and still scoring — ranking up is the point, not a disqualification");
});

test("one gamer, one entry, and the refusal says which account", async () => {
  const db = await resetDemoDb();
  Object.assign(game, { wins: 0, matches: 0, solo_tier: 0 });
  const challengeId = await aChallenge(db);
  const { userId } = await aGamer(db, "Doubler");
  ok((await enterChallenge(db, { challengeId, userId }, MONDAY)).ok, "in once");

  const second = await enterChallenge(db, { challengeId, userId }, MONDAY);
  eq(second.ok ? "" : second.code, "same_account", "and not twice");
  ok(!second.ok && /Doubler/.test(second.reason), "the refusal names the account they used");
});

test("a community challenge needs the key you get by joining the server", async () => {
  const db = await resetDemoDb();
  const challengeId = await createChallenge(db, {
    title: "Nightfall's own",
    game: "Test Game",
    provider: FAKE,
    startAt: MONDAY,
    visibility: "community",
    accessKey: "nightfall-key",
    metrics: DEFAULT_METRIC_WEIGHTS,
    guildId: "guild-nightfall",
  });
  const invoiceId = await createInvoice(db, {
    payerType: "guild",
    lines: [{ description: "Community tier 1", amountCents: 500 }],
  });
  await attachInvoice(db, challengeId, invoiceId);
  await markPaid(db, invoiceId, { communityTier: 1 });
  await markScheduled(db, challengeId);
  await announce(db, challengeId, "admin-1", []);

  const { userId } = await aGamer(db, "Outsider");
  const locked = await enterChallenge(db, { challengeId, userId }, MONDAY);
  eq(locked.ok ? "" : locked.code, "locked", "no key, no entry");

  const wrong = await enterChallenge(db, { challengeId, userId, accessKey: "guess" }, MONDAY);
  eq(wrong.ok ? "" : wrong.code, "bad_key", "and a wrong key says so specifically");

  ok(
    (await enterChallenge(db, { challengeId, userId, accessKey: "nightfall-key" }, MONDAY)).ok,
    "the right key gets them in — the challenge is the server's advertising",
  );
});

test("a closed challenge cannot be joined", async () => {
  const db = await resetDemoDb();
  const challengeId = await aChallenge(db);
  const { userId } = await aGamer(db, "TooLate");
  const result = await enterChallenge(db, { challengeId, userId }, new Date("2026-09-12T00:00:00Z"));
  eq(result.ok ? "" : result.code, "not_active", "the week is over");
});

// ── The close ───────────────────────────────────────────────────────────────

test("placements are written once, on a final sync, and the challenge locks", async () => {
  const db = await resetDemoDb();
  Object.assign(game, { wins: 0, matches: 0, solo_tier: 0 });
  const challengeId = await aChallenge(db);

  const a = await aGamer(db, "Alpha");
  await enterChallenge(db, { challengeId, userId: a.userId }, MONDAY);
  const b = await aGamer(db, "Beta");
  await enterChallenge(db, { challengeId, userId: b.userId }, MONDAY);

  const { forceSync } = await import("../../lib/core/sync.ts");
  Object.assign(game, { wins: 20, matches: 40 });
  await forceSync(db, a.accountId, { at: new Date("2026-09-09T00:00:00Z") });
  Object.assign(game, { wins: 5, matches: 12 });
  await forceSync(db, b.accountId, { at: new Date("2026-09-09T00:00:00Z") });

  // A last hour of play that only the final sync can see. B3: placements are
  // never computed on stale data — and the reading the close takes must land
  // INSIDE the scoring window, or the final sync is an expensive no-op and the
  // placements come from the last hourly reading instead.
  Object.assign(game, { wins: 9, matches: 30 });
  const closed = await closeChallenges(db, new Date("2026-09-11T00:00:01Z"));
  eq(closed.closed, [challengeId], "the challenge closed");
  eq(closed.placements, 2, "and both entrants were placed");

  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(sqlEq(schema.challenges.id, challengeId));
  eq(challenge.state, "ended", "it locks at ended");

  const placed = await db
    .select()
    .from(schema.challengeParticipants)
    .where(sqlEq(schema.challengeParticipants.challengeId, challengeId));
  ok(placed.every((p) => p.placement !== null), "every entrant has a placement");
  eq(new Set(placed.map((p) => p.placement)).size, 2, "and no two share one");

  // Beta was on 5 wins / 12 matches at the last hourly sync and finished on
  // 9 / 30. If the final sync's reading fell outside the window, the standing
  // would read 62 rather than 120 — and nothing would have failed.
  const final = await standingsOf(db, challengeId, FRIDAY);
  const beta = final.find((s) => s.participant.userId === b.userId);
  eq(beta?.points, 9 * 10 + 30, "the final sync's reading is inside the window it decides");
});

test("a closed challenge reads the same on Sunday as it did on Friday", async () => {
  const db = await resetDemoDb();
  Object.assign(game, { wins: 0, matches: 0, solo_tier: 0 });
  const challengeId = await aChallenge(db);
  const { userId, accountId } = await aGamer(db, "WeekendPlayer");
  await enterChallenge(db, { challengeId, userId }, MONDAY);

  const { forceSync } = await import("../../lib/core/sync.ts");
  Object.assign(game, { wins: 10, matches: 20 });
  await forceSync(db, accountId, { at: new Date("2026-09-09T00:00:00Z") });
  await closeChallenges(db, new Date("2026-09-11T00:00:01Z"));

  const friday = await standingsOf(db, challengeId, FRIDAY);

  // They keep playing all weekend. Last week's result does not move.
  Object.assign(game, { wins: 90, matches: 200 });
  await forceSync(db, accountId, { at: new Date("2026-09-13T00:00:00Z") });
  const sunday = await standingsOf(db, challengeId, new Date("2026-09-13T12:00:00Z"));

  eq(sunday[0].points, friday[0].points, "the result is the week's, not the account's");
});

test("unlinking freezes a score and keeps the entrant in the standings", async () => {
  const db = await resetDemoDb();
  Object.assign(game, { wins: 0, matches: 0, solo_tier: 0 });
  const challengeId = await aChallenge(db);
  const { userId, accountId } = await aGamer(db, "Leaver");
  await enterChallenge(db, { challengeId, userId }, MONDAY);

  const { forceSync } = await import("../../lib/core/sync.ts");
  Object.assign(game, { wins: 12, matches: 30 });
  await forceSync(db, accountId, { at: new Date("2026-09-08T00:00:00Z") });

  const before = await standingsOf(db, challengeId, new Date("2026-09-09T00:00:00Z"));
  eq(before[0].points, 12 * 10 + 30, "they have a score");

  eq(
    await freezeOnUnlink(db, accountId, new Date("2026-09-09T00:00:00Z")),
    1,
    "unlinking freezes it",
  );
  await db
    .delete(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.id, accountId));

  const after = await standingsOf(db, challengeId, new Date("2026-09-10T00:00:00Z"));
  eq(after.length, 1, "they are still in the standings");
  eq(after[0].points, before[0].points, "at the score they had");
  ok(after[0].frozen, "and it is marked frozen rather than pretending to be live");
});
