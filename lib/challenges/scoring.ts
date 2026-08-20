// Scoring, and baselining, which is the same subject.
//
// ===== THE BASELINE RULE, AND WHY BOTH OBVIOUS ANSWERS ARE WRONG =====
//
//     baseline = max(challengeStart, joinedAt)
//
// docs/03-CHALLENGES.md §2 shows the failure cases before it gives the rule,
// and they are worth restating because the rule looks arbitrary until you have
// seen them. One gamer, one game account, two challenges on the same game in
// the same week — Challenge A joined the week before it starts, Challenge B
// joined on day 2:
//
//   * Baseline **when the gamer joined**: Challenge A baselines a week early,
//     so a full week of ordinary play counts before the gun ever fires.
//   * Baseline **when the challenge started**: Challenge B baselines at the
//     gun, but they joined on day 2 — so they bank two days they played before
//     entering. Watch the standings, join on day 6 with six days already in
//     the bank.
//
// `max` of the two is the only rule that is right in both directions, and it
// has to be stored **per (challenge, participant)**: the same account holds
// two different baselines for the two challenges at once, and any design that
// keeps one baseline per account cannot express that.
//
// ===== AND THE SCORE =====
//
//     points = (Δwins × 10) + (Δmatches × 1)
//
// Counts, not ratios (S1). Every delta clamped at zero (S2). No tiebreak,
// because ties are effectively impossible (S3). Matches is always counted and
// always shown whether or not it scores (S4).

import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";

/** The weights. `metrics` on a challenge overrides them; this is the product. */
export const DEFAULT_METRIC_WEIGHTS: Record<string, number> = {
  wins: 10,
  matches: 1,
};

export type Baseline = Record<string, number>;

/** P2 — `max(challengeStart, joinedAt)`. The whole rule, in one place. */
export function baselineAtFor(challengeStart: Date, joinedAt: Date): Date {
  return joinedAt.getTime() > challengeStart.getTime() ? joinedAt : challengeStart;
}

/**
 * The score, from a baseline and a current reading.
 *
 * Pure, so the rule can be exercised without a database, and so that the
 * standings page, the bot card, the brand report and Friday's placement all
 * call the same eleven lines.
 */
export function scoreFrom(
  baseline: Baseline,
  current: Record<string, number>,
  weights: Record<string, number> = DEFAULT_METRIC_WEIGHTS,
): { points: number; deltas: Record<string, number> } {
  const deltas: Record<string, number> = {};
  let points = 0;
  for (const [metric, weight] of Object.entries(weights)) {
    // S2: clamped at zero. A decline never subtracts — and a metric the
    // baseline never saw is treated as starting at its current value, so a
    // lifetime counter that first appears mid-week is not five hundred wins
    // earned this week.
    const from = baseline[metric] ?? current[metric] ?? 0;
    const to = current[metric] ?? from;
    const delta = Math.max(0, to - from);
    deltas[metric] = delta;
    points += delta * weight;
  }
  return { points, deltas };
}

/**
 * The metric values as they stood at an instant, from the observation series.
 *
 * This is what makes the gun a real event rather than a computed offset. An
 * early joiner's baseline is stamped from the readings **as at Monday
 * 00:00**, not from whatever the account looks like when the job happens to
 * run at 00:04.
 */
export async function observationsAsAt(
  db: DB,
  linkedAccountId: string,
  at: Date,
): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(schema.observations)
    .where(
      and(
        eq(schema.observations.linkedAccountId, linkedAccountId),
        lte(schema.observations.observedAt, at),
      ),
    )
    .orderBy(asc(schema.observations.observedAt));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.metricKey] = r.value;
  return out;
}

// ===== `stampBaseline` WAS DELETED HERE, AND THE INVESTIGATION SAID WHY =====
//
// It was a fourth way to write `baselineAt` and nothing called it.
//
// The question asked was whether the gun is the only path. **It is not** —
// there are two live ones, and neither went through this function:
//
//   * `lib/challenges/entry.ts` stamps at join, in the same INSERT that creates
//     the participant, for anybody joining a challenge that is already live.
//   * `lib/challenges/jobs.ts` stamps at the gun (`stampBaselinesAtGun`) for
//     everybody who joined early, dated at the challenge's start rather than at
//     the instant the job ran.
//
// So the reason to delete it is stronger than "unused". Its own doc carried
// B1 — *"the caller forces a sync first; a stale reading becomes free
// progress"* — as an instruction to whoever called it, and a rule stated as an
// instruction to a caller that does not exist is a rule enforced by nobody.
// Both live paths call `forceSync` immediately before stamping
// (`entry.ts:202`, `jobs.ts:63`), so B1 holds where it is actually applied,
// and this was a way to stamp a baseline with that rule attached to a comment.

/**
 * A participant's live score.
 *
 * Derived every time, from the baseline and the latest observation (P5). The
 * two exceptions are both honest:
 *
 *   * **Before the baseline is stamped** there is nothing to measure from, so
 *     the score is zero rather than a guess. An early joiner scores nothing
 *     until the gun, which is the rule.
 *   * **A frozen score** (B6) is used when the gamer unlinked the account they
 *     entered with. That is not a cache — the inputs are gone, and the
 *     alternative is dropping them out of a standing they earned.
 */
export async function scoreOf(
  db: DB,
  participant: schema.ChallengeParticipant,
  challenge: schema.Challenge,
  now = new Date(),
): Promise<{ points: number; deltas: Record<string, number>; frozen: boolean }> {
  if (participant.frozenScore !== null) {
    return { points: participant.frozenScore, deltas: {}, frozen: true };
  }
  if (!participant.baselineAt || !participant.baseline) {
    return { points: 0, deltas: {}, frozen: false };
  }

  // After the close, score as at the close. A challenge that ended on Friday
  // must read the same on Sunday as it did on Friday, and a gamer who kept
  // playing over the weekend has not changed last week's result.
  const asAt = now.getTime() > challenge.endAt.getTime() ? challenge.endAt : now;
  const current = await observationsAsAt(db, participant.linkedAccountId, asAt);
  const weights = challenge.metrics ?? DEFAULT_METRIC_WEIGHTS;

  // ===== A SEASON RESET RE-BASELINES; IT DOES NOT ZERO A WEEK =====
  //
  // Riot puts `wins` back to 0 at a split. Without this, every baseline
  // stamped before the reset is above every reading after it, the clamp reads
  // zero and *keeps* reading zero — and every League player silently loses
  // their whole week. Nothing throws. The first signal is a gamer asking why
  // they have no points.
  //
  // A reset splits the window into eras. Each era is measured from where that
  // era started, and the eras are added:
  //
  //     baseline 100 ─(plays to 110)─┤reset├─ 0 ─(plays to 3)─► now
  //             era 1: 110 − 100 = 10      era 2: 3 − 0 = 3    total 13
  //
  // Written as segments rather than as a special case because that is what it
  // is, and because the arithmetic then handles two resets in one week — which
  // a patch-up around a single reset would not.
  const resets = await db
    .select()
    .from(schema.seasonResets)
    .where(
      and(
        eq(schema.seasonResets.linkedAccountId, participant.linkedAccountId),
        gt(schema.seasonResets.detectedAt, participant.baselineAt),
        lte(schema.seasonResets.detectedAt, asAt),
      ),
    )
    .orderBy(asc(schema.seasonResets.detectedAt));

  if (resets.length === 0) {
    return { ...scoreFrom(participant.baseline, current, weights), frozen: false };
  }

  const deltas: Record<string, number> = {};
  let points = 0;
  for (const [metric, weight] of Object.entries(weights)) {
    let from = participant.baseline[metric] ?? current[metric] ?? 0;
    let delta = 0;
    for (const reset of resets.filter((r) => r.metricKey === metric)) {
      // What they reached before that era ended, minus where the era began.
      delta += Math.max(0, reset.previousValue - from);
      from = reset.newValue;
    }
    delta += Math.max(0, (current[metric] ?? from) - from);
    deltas[metric] = delta;
    points += delta * weight;
  }
  return { points, deltas, frozen: false };
}

export type Standing = {
  participant: schema.ChallengeParticipant;
  points: number;
  deltas: Record<string, number>;
  frozen: boolean;
  place: number;
};

/**
 * The standings.
 *
 * **The only implementation.** `/challenges/[id]`, the bot's standings card,
 * the brand report and Friday's placement all read this — docs/01-CYCLE.md is
 * explicit that there is no second implementation of anything that decides
 * money, and a placement is money.
 */
export async function standingsOf(
  db: DB,
  challengeId: string,
  now = new Date(),
): Promise<Standing[]> {
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge) return [];

  const participants = await db
    .select()
    .from(schema.challengeParticipants)
    .where(eq(schema.challengeParticipants.challengeId, challengeId));

  const scored = await Promise.all(
    participants.map(async (p) => ({ participant: p, ...(await scoreOf(db, p, challenge, now)) })),
  );

  // S3: no tiebreak rule, because ties are effectively impossible. Where one
  // does occur, the earlier entrant is listed first — a stable order that is
  // not a rule, just something better than an arbitrary one.
  scored.sort(
    (a, b) =>
      b.points - a.points ||
      a.participant.joinedAt.getTime() - b.participant.joinedAt.getTime(),
  );

  return scored.map((s, i) => ({ ...s, place: i + 1 }));
}
