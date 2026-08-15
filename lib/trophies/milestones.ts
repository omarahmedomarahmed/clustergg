// Milestone trophies — the two automatic $0 ones, and their live progress.
//
// Both are collectables. They cost nothing, they are worth nothing, and they
// are the only thing on this platform that is not funded by a brand — which is
// exactly why they must never carry a value: a milestone with money on it
// would be a liability nobody paid for, and the prize vault could never be
// green again.
//
// T7 — progress is shown live: *"3 of 5 challenges in League"*. T13 — for our
// own milestones, show what a gamer is **missing** to earn it, which is the
// difference between a badge and a reason to come back.
//
// Derived, never stored. A milestone's progress is a count of rows that exist
// for another reason, and a stored counter would be one more thing that can
// disagree with the truth.

import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { weekStartFor } from "../challenges/week.ts";

export const MILESTONES = {
  /** Five challenges in one game. Per game, so it is earnable more than once. */
  five_in_game: { target: 5, label: "5 challenges in one game" },
  /** Four consecutive weeks. Rolling — a gap resets the run, it does not bank. */
  four_weeks: { target: 4, label: "4 weeks in a row" },
} as const;

export type MilestoneKind = keyof typeof MILESTONES;

export type MilestoneProgress = {
  kind: MilestoneKind;
  game?: string;
  have: number;
  target: number;
  earned: boolean;
  /** T13 — what they are missing, in the words a card shows. */
  missing: string;
};

/** How many challenges this gamer has entered, per game. */
export async function challengesPerGame(
  db: DB,
  userId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      game: schema.challenges.game,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.challengeParticipants)
    .innerJoin(
      schema.challenges,
      eq(schema.challengeParticipants.challengeId, schema.challenges.id),
    )
    .where(eq(schema.challengeParticipants.userId, userId))
    .groupBy(schema.challenges.game);
  return Object.fromEntries(rows.map((r) => [r.game, r.n]));
}

/**
 * The longest run of consecutive weeks this gamer has entered something in,
 * ending at the most recent week they entered.
 *
 * Rolling, and a gap **resets** rather than pausing. That is the harder
 * reading and it is the right one: "4 consecutive weeks" that tolerates a gap
 * is not consecutive, and a gamer who worked out that it did would rightly
 * stop believing the other numbers.
 */
export async function consecutiveWeeks(db: DB, userId: string): Promise<number> {
  const rows = await db
    .select({ startAt: schema.challenges.startAt })
    .from(schema.challengeParticipants)
    .innerJoin(
      schema.challenges,
      eq(schema.challengeParticipants.challengeId, schema.challenges.id),
    )
    .where(eq(schema.challengeParticipants.userId, userId));

  if (rows.length === 0) return 0;

  const weeks = [...new Set(rows.map((r) => weekStartFor(r.startAt).getTime()))].sort(
    (a, b) => a - b,
  );
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  let best = 1;
  let run = 1;
  for (let i = 1; i < weeks.length; i++) {
    run = weeks[i] - weeks[i - 1] === WEEK ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export async function progressFor(db: DB, userId: string): Promise<MilestoneProgress[]> {
  const out: MilestoneProgress[] = [];

  const perGame = await challengesPerGame(db, userId);
  for (const [game, have] of Object.entries(perGame)) {
    const target = MILESTONES.five_in_game.target;
    const short = Math.max(0, target - have);
    out.push({
      kind: "five_in_game",
      game,
      have,
      target,
      earned: have >= target,
      missing:
        short === 0
          ? `Earned — ${have} challenges in ${game}.`
          : `${have} of ${target} challenges in ${game}. ${short} to go.`,
    });
  }

  const weeks = await consecutiveWeeks(db, userId);
  const target = MILESTONES.four_weeks.target;
  const short = Math.max(0, target - weeks);
  out.push({
    kind: "four_weeks",
    have: weeks,
    target,
    earned: weeks >= target,
    missing:
      short === 0
        ? `Earned — ${weeks} weeks in a row.`
        : `${weeks} of ${target} weeks in a row. Enter ${short} more consecutive ${
            short === 1 ? "week" : "weeks"
          }.`,
  });

  return out;
}

/**
 * Award any milestone a gamer has just earned. Idempotent.
 *
 * The definition is created on first use rather than seeded, so a game nobody
 * has played five challenges in does not have a trophy sitting in the showcase
 * with no holders.
 */
export async function awardEarnedMilestones(
  db: DB,
  userId: string,
  at = new Date(),
): Promise<string[]> {
  const { createTrophy, awardTrophy } = await import("./trophies.ts");
  const earned = (await progressFor(db, userId)).filter((p) => p.earned);
  const awarded: string[] = [];

  for (const milestone of earned) {
    const [existing] = await db
      .select()
      .from(schema.trophies)
      .where(
        and(
          eq(schema.trophies.type, "milestone"),
          eq(schema.trophies.milestoneKind, milestone.kind),
          milestone.game
            ? eq(schema.trophies.milestoneGame, milestone.game)
            : sql`${schema.trophies.milestoneGame} is null`,
        ),
      );

    const trophyId =
      existing?.id ??
      (await createTrophy(db, {
        type: "milestone",
        name: milestone.game
          ? `${MILESTONES[milestone.kind].label} — ${milestone.game}`
          : MILESTONES[milestone.kind].label,
        valueCents: 0,
        milestoneKind: milestone.kind,
        milestoneGame: milestone.game ?? null,
      }));

    const result = await awardTrophy(db, { trophyId, userId, at });
    if (result.awarded) awarded.push(trophyId);
  }

  return awarded;
}
