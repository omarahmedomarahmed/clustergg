import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";

// A repeating challenge, and what "repeating" actually means here.
//
// The naive version is one row whose end date keeps moving forward. We shipped
// that once and it was wrong in a way that took months to see: challenges never
// ended, so nobody ever won, no trophies were handed out, and a brand could not
// be shown what any given week delivered because there was only ever one week.
//
// So a repeating challenge is a SERIES of separate rows — one per run. Each run
// is the unit of the business: one price, one prize pool, one set of entrants,
// one podium, one audience. Week 2 exists as its own record forever, which is
// what makes "here is what your four weeks delivered" a report rather than a
// guess.
//
// When a run ends (see `closeChallenge`), the next one opens automatically:
//
//   * the finished run keeps its standings, winners and trophies, untouched
//   * a new row is created for run N+1, with a new window and a new title
//   * everyone who was in run N is carried into run N+1 already joined
//   * their baseline is re-snapshotted from CURRENT stats, so points restart
//     at zero and only the new week's play counts
//
// That last point is the whole reason entrants are copied rather than shared: a
// gamer stays in the competition without re-joining, but their score is a new
// score. Their run-1 result is still on their profile and still in run 1's
// standings.

export type Cadence = "daily" | "weekly" | "monthly" | "custom";

/** How long one run lasts. `null` means "whatever dates staff typed". */
export const CADENCE_DAYS: Record<string, number | null> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  custom: null,
};

export function isRepeating(cadence: string | null | undefined): boolean {
  return !!cadence && CADENCE_DAYS[cadence] != null;
}

/** What one run is called: Week 2, Day 5, Month 3. */
export function runNoun(cadence: string | null | undefined): string {
  return cadence === "daily" ? "Day" : cadence === "monthly" ? "Month" : "Week";
}

/**
 * The title of run N.
 *
 * Built from `baseTitle` rather than from the previous run's title, or the
 * suffix compounds into "Ramen Rush — Week 2 — Week 3" by run three. Run 1
 * keeps the plain title: a challenge that never repeats should not be labelled
 * "Week 1" as though something were missing.
 */
export function runTitle(baseTitle: string, cadence: string | null | undefined, index: number): string {
  const base = stripRunSuffix(baseTitle);
  if (index <= 1 || !isRepeating(cadence)) return base;
  return `${base} — ${runNoun(cadence)} ${index}`;
}

/** Remove a "— Week 3" tail, so an edited title can't accumulate them. */
export function stripRunSuffix(title: string): string {
  return title.replace(/\s*[—–-]\s*(Week|Day|Month|Run)\s+\d+\s*$/i, "").trim() || title.trim();
}

/** The window for run N, counting from the series' first start. */
export function runWindow(
  seriesStart: Date,
  cadence: string | null | undefined,
  index: number,
  fallbackDays = 7,
): { startAt: Date; endAt: Date } {
  const days = CADENCE_DAYS[cadence ?? "custom"] ?? fallbackDays;
  const startAt = new Date(seriesStart.getTime() + (index - 1) * days * 86400000);
  const endAt = new Date(startAt.getTime() + days * 86400000);
  return { startAt, endAt };
}

/** Is there another run after this one? `runsPlanned` of 0 means "keep going". */
export function hasNextRun(c: { runIndex: number; runsPlanned: number; cadence: string }): boolean {
  if (!isRepeating(c.cadence)) return false;
  if (c.runsPlanned <= 0) return true;
  return c.runIndex < c.runsPlanned;
}

export type NextRun = { ok: true; challengeId: string; index: number } | { ok: false; reason: string };

/**
 * Open the next run of a series.
 *
 * Called by `closeChallenge` the moment a run finishes, so the competition never
 * has a gap. Deliberately idempotent by (series, index): a retrying cron and an
 * admin pressing "end now" both land on the run that already exists rather than
 * creating a duplicate week.
 */
export async function openNextRun(finishedChallengeId: string): Promise<NextRun> {
  try {
    const db = await getDb();
    const [prev] = await db.select().from(schema.challenges)
      .where(eq(schema.challenges.id, finishedChallengeId)).limit(1);
    if (!prev) return { ok: false, reason: "not_found" };
    if (!hasNextRun(prev)) return { ok: false, reason: "series_complete" };

    const seriesId = prev.seriesId ?? prev.id;
    const index = prev.runIndex + 1;

    // Already opened? Another caller got here first, which is fine and is the
    // point of checking rather than inserting blindly.
    const [existing] = await db.select({ id: schema.challenges.id })
      .from(schema.challenges)
      .where(and(eq(schema.challenges.seriesId, seriesId), eq(schema.challenges.runIndex, index)))
      .limit(1);
    if (existing) return { ok: true, challengeId: existing.id, index };

    // The new window starts when the last one ended, not "now". A cron that
    // runs six hours late must not shorten the week it is opening.
    const days = CADENCE_DAYS[prev.cadence] ?? 7;
    const startAt = prev.endAt;
    const endAt = new Date(startAt.getTime() + days * 86400000);
    const base = prev.baseTitle ?? stripRunSuffix(prev.title);

    const id = uid();
    await db.insert(schema.challenges).values({
      id,
      seriesId,
      runIndex: index,
      runsPlanned: prev.runsPlanned,
      baseTitle: base,
      title: runTitle(base, prev.cadence, index),
      // Everything that describes the competition is carried verbatim: same
      // game, same scoring, same trophies, same servers, same sponsor. A run is
      // the same challenge happening again, not a new one.
      spaceId: prev.spaceId,
      game: prev.game,
      provider: prev.provider,
      description: prev.description,
      format: prev.format,
      rules: prev.rules,
      pointsEngine: prev.pointsEngine,
      thresholdTarget: prev.thresholdTarget,
      gateQuestId: prev.gateQuestId,
      gateMinBadges: prev.gateMinBadges,
      visibility: prev.visibility,
      guildId: prev.guildId,
      guildIds: prev.guildIds,
      accessKey: prev.accessKey,
      announceHype: prev.announceHype,
      cadence: prev.cadence,
      heroType: prev.heroType,
      heroUrl: prev.heroUrl,
      coverUrl: prev.coverUrl,
      coverAdjust: prev.coverAdjust,
      trophyId: prev.trophyId,
      prizes: prev.prizes,
      prizeDescription: prev.prizeDescription,
      sponsorBrandId: prev.sponsorBrandId,
      sponsorCampaignId: prev.sponsorCampaignId,
      sponsorPrice: prev.sponsorPrice,
      createdBy: prev.createdBy,
      startAt,
      endAt,
      status: "active",
    });

    await carryEntrants(prev.id, id);

    // Announce it like any other launch, which also writes the delivery ledger
    // for this run — week 2's reach is week 2's, counted separately.
    try {
      const { announceChallengeLaunched } = await import("@/lib/discord/announce");
      await announceChallengeLaunched(id);
    } catch { /* the run exists whether or not Discord heard about it */ }

    return { ok: true, challengeId: id, index };
  } catch { return { ok: false, reason: "error" }; }
}

/**
 * Carry last run's entrants into the new one, with their scores reset.
 *
 * The reset is the re-snapshot: a participant's `baseline` is what their stats
 * were when they joined, and points are measured from it. Copying the OLD
 * baseline would carry the whole previous week's play into the new week and
 * hand week 1's winner an insurmountable head start. Reading current stats
 * instead makes week 2 start at zero for everybody, which is what a weekly
 * competition means.
 *
 * Disqualified entrants are not carried. A disqualification that silently
 * expired after seven days would make the sanction meaningless.
 */
export async function carryEntrants(fromChallengeId: string, toChallengeId: string): Promise<number> {
  try {
    const db = await getDb();
    const prior = await db.select({
      userId: schema.challengeParticipants.userId,
      linkedAccountId: schema.challengeParticipants.linkedAccountId,
      joinedFrom: schema.challengeParticipants.joinedFrom,
      status: schema.challengeParticipants.status,
    }).from(schema.challengeParticipants)
      .where(eq(schema.challengeParticipants.challengeId, fromChallengeId));

    const carried = prior.filter((p) => p.status !== "disqualified");
    if (!carried.length) return 0;

    const accountIds = [...new Set(carried.map((p) => p.linkedAccountId))];
    const stats = await db.select().from(schema.statCurrent)
      .where(inArray(schema.statCurrent.linkedAccountId, accountIds));
    const byAccount = new Map<string, Record<string, number>>();
    for (const s of stats) {
      const bag = byAccount.get(s.linkedAccountId) ?? {};
      bag[s.metricKey] = s.metricValue;
      byAccount.set(s.linkedAccountId, bag);
    }

    await db.insert(schema.challengeParticipants).values(
      carried.map((p) => ({
        id: uid(),
        challengeId: toChallengeId,
        userId: p.userId,
        linkedAccountId: p.linkedAccountId,
        baseline: byAccount.get(p.linkedAccountId) ?? {},
        joinedFrom: p.joinedFrom,
      })),
    ).onConflictDoNothing();
    return carried.length;
  } catch { return 0; }
}

// ===== Reading a series =====

export type SeriesRun = {
  id: string;
  runIndex: number;
  title: string;
  status: string;
  startAt: Date;
  endAt: Date;
  entrants: number;
};

/** Every run of a series, oldest first — the four weeks a brand bought. */
export async function seriesRuns(seriesId: string): Promise<SeriesRun[]> {
  try {
    const db = await getDb();
    const rows = await db.select({
      id: schema.challenges.id,
      runIndex: schema.challenges.runIndex,
      title: schema.challenges.title,
      status: schema.challenges.status,
      startAt: schema.challenges.startAt,
      endAt: schema.challenges.endAt,
    }).from(schema.challenges)
      .where(eq(schema.challenges.seriesId, seriesId))
      .orderBy(asc(schema.challenges.runIndex));
    if (!rows.length) return [];

    const counts = await entrantCounts(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, entrants: counts.get(r.id) ?? 0 }));
  } catch { return []; }
}

/** How many entered each of these challenges. */
export async function entrantCounts(challengeIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(challengeIds.filter(Boolean))];
  if (!ids.length) return out;
  try {
    const db = await getDb();
    const { sql } = await import("drizzle-orm");
    const rows = await db.select({
      challengeId: schema.challengeParticipants.challengeId,
      n: sql<number>`count(*)`,
    }).from(schema.challengeParticipants)
      .where(inArray(schema.challengeParticipants.challengeId, ids))
      .groupBy(schema.challengeParticipants.challengeId);
    for (const r of rows) out.set(r.challengeId, Number(r.n ?? 0));
  } catch { /* zero everywhere */ }
  return out;
}

/**
 * The whole series, as one plan.
 *
 * What the 4-week builder shows and what a brand's campaign report sums over.
 * Runs that have not happened yet are projected from the cadence rather than
 * stored, because an unstarted week has nothing to store and inventing a row
 * for it would put a challenge in the database that nobody has bought.
 */
export type SeriesPlan = {
  seriesId: string;
  cadence: string;
  runsPlanned: number;
  baseTitle: string;
  runs: SeriesRun[];
  /** Runs still to come, with the windows they will occupy. */
  upcoming: { index: number; title: string; startAt: Date; endAt: Date }[];
};

export async function seriesPlan(seriesId: string): Promise<SeriesPlan | null> {
  try {
    const db = await getDb();
    const [first] = await db.select().from(schema.challenges)
      .where(eq(schema.challenges.seriesId, seriesId))
      .orderBy(asc(schema.challenges.runIndex)).limit(1);
    if (!first) return null;

    const runs = await seriesRuns(seriesId);
    const base = first.baseTitle ?? stripRunSuffix(first.title);
    const last = runs[runs.length - 1];
    const upcoming: SeriesPlan["upcoming"] = [];
    if (isRepeating(first.cadence) && first.runsPlanned > 0) {
      for (let i = (last?.runIndex ?? 0) + 1; i <= first.runsPlanned; i++) {
        const { startAt, endAt } = runWindow(first.startAt, first.cadence, i);
        upcoming.push({ index: i, title: runTitle(base, first.cadence, i), startAt, endAt });
      }
    }
    return {
      seriesId,
      cadence: first.cadence,
      runsPlanned: first.runsPlanned,
      baseTitle: base,
      runs,
      upcoming,
    };
  } catch { return null; }
}
