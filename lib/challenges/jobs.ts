// The three jobs that make the gun and the close real events.
//
// B2 — a start-of-week job stamps baselines for everyone who joined early.
//      "The gun is a real event, not a computed offset."
// B3 — a final sync runs before the close. Placements are never computed on
//      stale data.
//
// And the rule that governs all three: **a job computes; a human releases**
// (docs/01-CYCLE.md). These stamp, score and place. None of them moves money,
// and none of them announces anything.

import { and, eq, isNull, lt, lte } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { forceSync, latestObservations } from "../core/sync.ts";
import { observationsAsAt, standingsOf } from "./scoring.ts";
import { fireTheGun, challengesToClose } from "./lifecycle.ts";
import { weekFor } from "./week.ts";
import { parentGuildToFreeze } from "../identity/attribution.ts";
import { freezeEligibilityAtGun } from "../pool/eligibility.ts";

/**
 * The gun. Monday 00:00 UTC.
 *
 * Every participant who joined before the start gets their baseline stamped
 * **now**, from a fresh sync — so nothing they played in the days between
 * announcement and Monday counts, which is the entire point of the rule.
 *
 * The baseline is dated at the challenge's start, not at the instant the job
 * happened to run. A job that runs at 00:04 must not hand four minutes of play
 * to whoever was awake.
 */
export async function stampBaselinesAtGun(
  db: DB,
  now = new Date(),
): Promise<{ started: string[]; stamped: number; eligibility: number }> {
  const started = await fireTheGun(db, now);

  const pending = await db
    .select({
      participant: schema.challengeParticipants,
      challenge: schema.challenges,
    })
    .from(schema.challengeParticipants)
    .innerJoin(
      schema.challenges,
      eq(schema.challengeParticipants.challengeId, schema.challenges.id),
    )
    .where(
      and(
        isNull(schema.challengeParticipants.baselineAt),
        lte(schema.challenges.startAt, now),
      ),
    );

  let stamped = 0;
  for (const { participant, challenge } of pending) {
    // Stamped **at the challenge's start**, not at the instant this job runs.
    // That is the whole difference between "the gun is a real event" and "the
    // gun is whenever the cron woke up": the reading taken here IS the reading
    // at Monday 00:00, and dating it later would put it outside the window the
    // baseline reads from and silently fall back to the joiner's older values.
    await forceSync(db, participant.linkedAccountId, {
      queue: challenge.queue as "solo" | "flex" | "both",
      at: challenge.startAt,
    });
    // As at the challenge's start, from the series — not "whatever the account
    // reads right now".
    const values = await observationsAsAt(db, participant.linkedAccountId, challenge.startAt);
    const fallback = Object.keys(values).length
      ? values
      : await latestObservations(db, participant.linkedAccountId);

    // ===== THE PARENT FREEZES HERE TOO. A1a / P6 =====
    //
    // Same instant as the baseline, from the same job, because they are the
    // same event. `max(challengeStart, joinedAt)` is one rule and it governs
    // both columns — an early joiner's attribution is decided by the gun, not
    // by what they clicked in the week before it.
    const frozenParent = await parentGuildToFreeze(db, participant.userId);

    await db
      .update(schema.challengeParticipants)
      .set({
        baselineAt: challenge.startAt,
        baseline: fallback,
        parentGuildIdAtBaseline: frozenParent,
      })
      .where(eq(schema.challengeParticipants.id, participant.id));
    stamped++;
  }

  // ===== ELIGIBILITY FREEZES AT THE GUN, ONCE, FOR EVERY SERVER (12 §4) =====
  //
  // All sponsored challenges share one gun, so this is **one check per week**
  // and not one per challenge — which is why it sits outside the loop above
  // and is keyed on the week rather than on any challenge.
  //
  // It runs whenever this job runs, not only when a challenge started: a week
  // with no sponsored challenge still needs its gate recorded, or the first
  // week that does have one would read a freeze from some earlier week and
  // silently score against it.
  //
  // This is the **only** caller of `freezeEligibilityAtGun`. E3 — never
  // re-checked mid-week — is enforced by that fact, and by `kpisForWeek`
  // reading `isFrozenEligible` rather than the live gate.
  const week = weekFor(now);
  const eligibility = await freezeEligibilityAtGun(db, week.start);

  return { started, stamped, eligibility: eligibility.length };
}

/**
 * The close. Friday 00:00 UTC.
 *
 * A final sync runs **before** anything is computed (B3). Then placements are
 * written once, and the challenge locks at `ended` (T6/V7).
 *
 * Trophies are not awarded here — Stage 5 owns that, and it needs the prize
 * vault's headroom check inside its own transaction. This job's output is the
 * placements those awards read.
 */
export async function closeChallenges(
  db: DB,
  now = new Date(),
): Promise<{ closed: string[]; placements: number }> {
  const due = await challengesToClose(db, now);
  const closed: string[] = [];
  let placements = 0;

  for (const challenge of due) {
    const participants = await db
      .select()
      .from(schema.challengeParticipants)
      .where(eq(schema.challengeParticipants.challengeId, challenge.id));

    // ===== THE FINAL SYNC, BEFORE ANYTHING IS COMPUTED =====
    //
    // Placements are never decided on stale data. An hourly sync means the
    // last reading before Friday 00:00 could be 59 minutes old, and an hour of
    // play on the last night of a five-day competition decides places.
    // Stamped **at the close instant**, for the same reason the gun's reading
    // is stamped at the gun — and here it is not a subtlety, it is the whole
    // point of the job. Scoring reads `observedAt <= endAt`. This job
    // necessarily runs a moment *after* endAt, so a reading dated "now" falls
    // outside the window and the final sync becomes an expensive no-op:
    // placements would be decided on the last hourly reading, which is exactly
    // what B3 forbids. Nothing would have failed. The leaderboard would just
    // have been slightly wrong, every week, forever.
    for (const p of participants) {
      await forceSync(db, p.linkedAccountId, {
        queue: challenge.queue as "solo" | "flex" | "both",
        at: challenge.endAt,
      });
    }

    const standings = await standingsOf(db, challenge.id, challenge.endAt);
    for (const s of standings) {
      await db
        .update(schema.challengeParticipants)
        .set({ placement: s.place })
        .where(eq(schema.challengeParticipants.id, s.participant.id));
      placements++;
    }

    await db
      .update(schema.challenges)
      .set({ state: "ended", endedAt: now })
      .where(eq(schema.challenges.id, challenge.id));
    closed.push(challenge.id);
  }

  return { closed, placements };
}

/**
 * B6 — freeze a participant's score when they unlink the account they entered
 * with.
 *
 * They stay in the standings. Dropping them would rewrite a leaderboard other
 * people have been watching, and the alternative — leaving them derivable from
 * an account that no longer exists — reads as zero, which is worse than
 * dropping them.
 */
export async function freezeOnUnlink(
  db: DB,
  linkedAccountId: string,
  now = new Date(),
): Promise<number> {
  const rows = await db
    .select({
      participant: schema.challengeParticipants,
      challenge: schema.challenges,
    })
    .from(schema.challengeParticipants)
    .innerJoin(
      schema.challenges,
      eq(schema.challengeParticipants.challengeId, schema.challenges.id),
    )
    .where(
      and(
        eq(schema.challengeParticipants.linkedAccountId, linkedAccountId),
        isNull(schema.challengeParticipants.frozenScore),
      ),
    );

  const { scoreOf } = await import("./scoring.ts");
  let frozen = 0;
  for (const { participant, challenge } of rows) {
    const { points } = await scoreOf(db, participant, challenge, now);
    await db
      .update(schema.challengeParticipants)
      .set({ frozenScore: points, frozenAt: now })
      .where(eq(schema.challengeParticipants.id, participant.id));
    frozen++;
  }
  return frozen;
}

/**
 * Rank-up recognition, for winners and non-winners alike.
 *
 * §4.5: *"You didn't place, but you went from Gold III to Gold I."* It costs
 * nothing and it is the only good news most entrants get.
 */
export async function rankMovementFor(
  db: DB,
  challengeId: string,
): Promise<{ userId: string; from: number; to: number; improved: boolean }[]> {
  const participants = await db
    .select()
    .from(schema.challengeParticipants)
    .where(eq(schema.challengeParticipants.challengeId, challengeId));

  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge) return [];

  const out: { userId: string; from: number; to: number; improved: boolean }[] = [];
  for (const p of participants) {
    if (p.rankAtJoin === null) continue;
    const current = await observationsAsAt(db, p.linkedAccountId, challenge.endAt);
    const key = challenge.queue === "flex" ? "flex_tier" : "solo_tier";
    const to = current[key];
    if (to === undefined) continue;
    if (to !== p.rankAtJoin) {
      out.push({ userId: p.userId, from: p.rankAtJoin, to, improved: to > p.rankAtJoin });
    }
  }
  return out;
}

/**
 * Everything the daily cron runs, **in 03 §9's order.**
 *
 * ===== IT USED TO RUN TWO OF THE NINE STEPS =====
 *
 * `stampBaselinesAtGun` and `closeChallenges`, and that was all. Trophies were
 * never awarded, no payout was ever drafted, no week record was ever written
 * and nothing was ever announced — on a real deployment the entire close, as a
 * gamer or an owner experiences it, did not happen.
 *
 * Every one of those steps was built, correct and guarded. The four-week
 * simulation ran them **by hand**, in this order, which is exactly why nothing
 * noticed: the band orchestrated the close itself, so it never asked whether
 * anything else did. §0.1, on the largest thing on the platform.
 *
 * 03 §9, and what each line is:
 *
 *   1. Final sync, then placements          — `closeChallenges`
 *   2. Podium and participation trophies    — `settleChallenge`
 *   3. Rank movement for **every** entrant  — `rankMovement`
 *   4. Winners announced **once**, Friday   — `announceWinners`
 *   5. The weekly pool, and **draft** payouts — `closeWeek`
 *   6. Pool standings announced once, Saturday — `announcePoolStandings`
 *
 * A1 still holds and is the reason step 5 says *draft*. This computes; a human
 * releases. Nothing in this path can pay anybody.
 */
export async function runDailyJobs(db: DB, now = new Date()) {
  const { settleChallenge } = await import("../trophies/settle.ts");
  const { awardEarnedMilestones } = await import("../trophies/milestones.ts");
  const { closeWeek } = await import("../pool/score.ts");
  const { announceWinners, announcePoolStandings } = await import("../discord/announce.ts");
  const { weekFor } = await import("./week.ts");

  const gun = await stampBaselinesAtGun(db, now);
  const close = await closeChallenges(db, now);

  let settled = 0;
  let announced = 0;
  const movements: { userId: string; from: number; to: number; improved: boolean }[] = [];

  for (const challengeId of close.closed) {
    // Steps 3 and 4 — podium trophies to the winners, the $0 branded
    // collectable to everybody else. Idempotent per challenge, so a cron that
    // fires twice awards nothing twice.
    const result = await settleChallenge(db, challengeId, { actorId: null, at: now });
    settled += result.podium + result.participation;

    // Step 5 — rank movement for **every** entrant, winners and non-winners
    // alike. It costs nothing and it is the only good news most entrants get.
    movements.push(...(await rankMovementFor(db, challengeId)));

    // Milestones are per gamer rather than per challenge, and a challenge
    // closing is when a run of consecutive weeks becomes true.
    const entrants = await db
      .select({ userId: schema.challengeParticipants.userId })
      .from(schema.challengeParticipants)
      .where(eq(schema.challengeParticipants.challengeId, challengeId));
    for (const e of entrants) await awardEarnedMilestones(db, e.userId, now);

    // Step 7 — **winners announced once, on Friday, on every server.** The
    // post queue's ledger is what makes "once" true: a second send is a no-op
    // rather than a second card, and a bot that repeats itself gets muted.
    const posted = await announceWinners(db, challengeId);
    announced += posted.queued;
  }

  // ===== STEP 8 AND 9 — THE WEEK, ONCE, NOT ONCE PER CHALLENGE =====
  //
  // Keyed on the week rather than on the challenges that closed, because a
  // week with two challenges has one pool. Idempotent: `closeWeek` writes no
  // second record and `draftPayout` is idempotent per (guild, week), so this
  // running every day of the grace period is safe and deliberate — Saturday's
  // standings need Friday's record to exist.
  const week = weekFor(now);
  let pool = { drafted: 0, recorded: 0, announced: 0 };
  if (close.closed.length > 0) {
    const closed = await closeWeek(db, week.start, now);
    const standings = await announcePoolStandings(db, week.start);
    pool = { drafted: closed.drafted, recorded: closed.recorded, announced: standings.queued };
  }

  return { gun, close, settled, movements: movements.length, announced, pool };
}

/** Challenges whose window has opened but which were never announced. */
export async function missedTheGun(db: DB, now = new Date()) {
  return db
    .select()
    .from(schema.challenges)
    .where(and(eq(schema.challenges.state, "scheduled"), lt(schema.challenges.startAt, now)));
}
