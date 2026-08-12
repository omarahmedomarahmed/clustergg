import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import { ADAPTERS } from "@/lib/providers/adapters";
import { getProvider, isProviderLive } from "@/lib/providers/registry";
import { meetsRule } from "@/lib/challenge-rules";
import { awardQuestAction } from "@/lib/quests";
import { uid } from "@/lib/utils";

const SYNC_INTERVAL_MIN = 30;
const ERROR_BACKOFF_MIN = 120;

type Account = typeof schema.linkedGameAccounts.$inferSelect;

export async function syncAccount(db: DB, account: Account): Promise<{ ok: boolean; error?: string }> {
  const provider = getProvider(account.provider);
  const adapter = ADAPTERS[account.provider];
  const nextOk = new Date(Date.now() + SYNC_INTERVAL_MIN * 60_000);
  const nextErr = new Date(Date.now() + ERROR_BACKOFF_MIN * 60_000);

  if (!provider || !adapter) {
    await db.update(schema.linkedGameAccounts)
      .set({ syncStatus: "error", syncError: "Unknown provider", nextSyncAt: nextErr })
      .where(eq(schema.linkedGameAccounts.id, account.id));
    return { ok: false, error: "Unknown provider" };
  }
  if (!isProviderLive(provider)) {
    await db.update(schema.linkedGameAccounts)
      .set({ syncStatus: "needs_key", syncError: `Requires ${provider.envVars.join(", ")}`, nextSyncAt: nextErr })
      .where(eq(schema.linkedGameAccounts.id, account.id));
    return { ok: false, error: "Provider not configured" };
  }

  const result = await adapter.fetchStats({
    providerAccountId: account.providerAccountId,
    inGameName: account.inGameName,
    region: account.region,
    providerData: account.providerData,
  });

  if (!result.ok) {
    // IMPORTANT: on any failure — including an expired token — we only update the
    // account's status. Previously synced stat_current / stat_snapshots rows and
    // challenge points are left untouched, so the gamer keeps their progress and
    // leaderboard standing until they reconnect.
    const rateLimited = /429/.test(result.error);
    const status = result.authExpired ? "needs_reconnect" : rateLimited ? "rate_limited" : "error";
    await db.update(schema.linkedGameAccounts)
      .set({
        syncStatus: status,
        syncError: result.error.slice(0, 300),
        lastSyncedAt: new Date(),
        // Reconnect-needed accounts back off hard — no point retrying a dead token.
        nextSyncAt: result.authExpired ? new Date(Date.now() + 24 * 60 * 60_000) : nextErr,
      })
      .where(eq(schema.linkedGameAccounts.id, account.id));
    return { ok: false, error: result.error };
  }

  if (result.providerDataPatch) {
    await db.update(schema.linkedGameAccounts)
      .set({ providerData: { ...(account.providerData ?? {}), ...result.providerDataPatch } })
      .where(eq(schema.linkedGameAccounts.id, account.id));
  }

  const game = provider.game;
  // What moved this sync. B76 — see the emitters below the loop.
  const levelled = new Set<string>();
  let changed = false;
  for (const [metricKey, metric] of Object.entries(result.metrics)) {
    const [existing] = await db.select().from(schema.statCurrent).where(and(
      eq(schema.statCurrent.linkedAccountId, account.id),
      eq(schema.statCurrent.game, game),
      eq(schema.statCurrent.metricKey, metricKey),
    )).limit(1);

    if (!existing) {
      await db.insert(schema.statCurrent).values({
        id: uid(), linkedAccountId: account.id, game, metricKey,
        metricValue: metric.value, rankLabel: metric.rankLabel ?? null, updatedAt: new Date(),
      });
      await db.insert(schema.statSnapshots).values({
        id: uid(), linkedAccountId: account.id, game, metricKey, metricValue: metric.value,
      });
      changed = true;
    } else if (existing.metricValue !== metric.value || existing.rankLabel !== (metric.rankLabel ?? null)) {
      await db.update(schema.statCurrent)
        .set({ metricValue: metric.value, rankLabel: metric.rankLabel ?? null, updatedAt: new Date() })
        .where(eq(schema.statCurrent.id, existing.id));
      await db.insert(schema.statSnapshots).values({
        id: uid(), linkedAccountId: account.id, game, metricKey, metricValue: metric.value,
      });
      // B76. `stat_levelup` was PRICED and named in three mission templates
      // with nothing on the platform firing it — a task a gamer could not
      // complete however hard they played.
      //
      // A stat that went UP is the emitter. Not any change: a rank that fell is
      // not a level-up, and paying for movement in either direction would pay
      // for a bad week. Capped per gamer per day by B17 like everything else,
      // and keyed on the metric so six metrics moving is not six payouts of the
      // same thing on the same sync.
      if (metric.value > existing.metricValue) {
        levelled.add(metricKey);
      }
    }
  }

  // One award per sync, whatever moved. `refId` carries the day so the cap is
  // legible in the ledger rather than only in the code.
  if (levelled.size > 0) {
    await awardQuestAction(db, account.userId, "stat_levelup", {
      refType: "stat", refId: `${account.id}:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  // B76. `play_session` — priced, in every mission, fired by nothing.
  //
  // A SESSION is a sync that found new activity. That is the honest definition
  // available to us: we cannot see somebody playing, we can see that the numbers
  // a game reports about them changed since we last looked. Anything stronger
  // would be a claim we cannot support, which is the same rule `docs/DELIVERY.md`
  // applies to a view.
  if (levelled.size > 0 || changed) {
    await awardQuestAction(db, account.userId, "play_session", {
      refType: "session", refId: `${account.id}:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  // NOTE: `verified` is deliberately NOT touched here.
  //
  // A successful sync proves the account exists and that we can read it. It
  // says nothing about who owns it — and this line setting `verified: true` on
  // every sync is what made the flag meaningless in the first place: any
  // ownership state we recorded would be overwritten within thirty minutes by
  // a cron. Ownership is proven once, in lib/account-ownership.ts, and stays.
  await db.update(schema.linkedGameAccounts)
    .set({ syncStatus: "ok", syncError: null, lastSyncedAt: new Date(), nextSyncAt: nextOk })
    .where(eq(schema.linkedGameAccounts.id, account.id));

  await scoreChallengesForAccount(db, account.id);
  return { ok: true };
}

// Recompute challenge points for every active participation tied to this account.
// Points are derived from the delta between current stats and the baseline
// snapshotted at join time, so scoring is idempotent.
export async function scoreChallengesForAccount(db: DB, linkedAccountId: string) {
  const participations = await db.select({
    participant: schema.challengeParticipants,
    challenge: schema.challenges,
  })
    .from(schema.challengeParticipants)
    .innerJoin(schema.challenges, eq(schema.challengeParticipants.challengeId, schema.challenges.id))
    .where(and(
      eq(schema.challengeParticipants.linkedAccountId, linkedAccountId),
      eq(schema.challengeParticipants.status, "active"),
      eq(schema.challenges.status, "active"),
    ));
  if (participations.length === 0) return;

  const stats = await db.select().from(schema.statCurrent)
    .where(eq(schema.statCurrent.linkedAccountId, linkedAccountId));
  const current: Record<string, number> = {};
  for (const s of stats) current[s.metricKey] = s.metricValue;

  for (const { participant, challenge } of participations) {
    const now = new Date();
    if (challenge.endAt < now) continue;

    // ===== B91: NOTHING COUNTS BEFORE THE GUN =====
    //
    // A challenge is joinable from the moment it is ANNOUNCED, which is days
    // before it starts — that is the whole point of announcing ahead. But the
    // baseline was taken at JOIN time and never moved, so every match played
    // between joining and the start counted towards the score. Two things were
    // wrong with that at once: a gamer who joined on announcement day was
    // scored for a week they were not competing in, and one who joined on the
    // start line was scored fairly, so entering early bought a head start
    // nobody else could match.
    //
    // Before the start: score nothing at all. There is no partial credit to
    // give and writing a number would put a leaderboard on screen for a
    // challenge that has not begun.
    if (challenge.startAt > now) continue;

    // At or after the start, with a baseline older than the start: RESNAPSHOT.
    // The delta everybody is measured on now runs from the same moment for
    // everybody, whenever they entered.
    //
    // `baselineAt` null on a challenge that is already running means a row
    // written before this existed. Those are left alone deliberately —
    // rebaselining mid-run would wipe points people have already been shown,
    // and a scoreboard that resets itself is worse than one that started
    // slightly early.
    const takenAt = participant.baselineAt;
    if (takenAt !== null && takenAt < challenge.startAt) {
      await db.update(schema.challengeParticipants)
        .set({ baseline: current, baselineAt: now, currentPoints: 0 })
        .where(eq(schema.challengeParticipants.id, participant.id));
      participant.baseline = current;
      participant.baselineAt = now;
    }

    const baseline = participant.baseline ?? {};
    const delta: Record<string, number> = {};
    // A metric the baseline has never seen starts AT its current value: a
    // lifetime win count that first appears mid-challenge is not five hundred
    // wins earned this week.
    //
    // That has to be WRITTEN DOWN, though, not re-derived every sync. Joining
    // before an account's first sync left the baseline empty, and an empty
    // baseline meant every later sync also treated the current value as the
    // starting point — so the delta was zero forever and that entrant could
    // never score, silently, for the whole run. Recording the first value seen
    // keeps the intent and makes the next sync measurable.
    const discovered: Record<string, number> = {};
    for (const [k, v] of Object.entries(current)) {
      if (!(k in baseline)) discovered[k] = v;
      delta[k] = Math.max(0, v - (baseline[k] ?? v));
    }
    if (Object.keys(discovered).length) {
      const merged = { ...baseline, ...discovered };
      await db.update(schema.challengeParticipants).set({ baseline: merged })
        .where(eq(schema.challengeParticipants.id, participant.id));
      participant.baseline = merged;
    }
    // Entry rules are measured against what the account HOLDS, not against what
    // this run produced. They used to be compared to the delta, which made a
    // rank rule unsatisfiable by construction: "Gold or above in Solo/Duo" is
    // stored as `solo_tier >= 1200`, and read as a delta that demanded a gamer
    // climb 1,200 tier-points inside one week or score nothing. Points still
    // come from the delta — that part was never in question.
    const conditionsMet = (challenge.rules?.conditions ?? [])
      .every((c) => meetsRule(c, current[c.metric] ?? 0));
    let points = 0;
    if (conditionsMet) {
      for (const [metric, pts] of Object.entries(challenge.pointsEngine ?? {})) {
        points += Math.floor(delta[metric] ?? 0) * pts;
      }
    }
    // B76. `challenge_progress` — priced, in every mission template, fired by
    // nothing at all. This is the only place on the platform that knows a
    // gamer's score in a live challenge went up, so this is where it belongs.
    //
    // Only UP. A score that fell is not progress, and a re-sync that produced
    // the same number is not either.
    if (points > participant.currentPoints) {
      await awardQuestAction(db, participant.userId, "challenge_progress", {
        refType: "challenge", refId: `${challenge.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    if (points !== participant.currentPoints) {
      await db.update(schema.challengeParticipants)
        .set({
          currentPoints: points,
          status: challenge.format === "threshold_race" && challenge.thresholdTarget && points >= challenge.thresholdTarget
            ? "completed" : participant.status,
        })
        .where(eq(schema.challengeParticipants.id, participant.id));
      await db.insert(schema.challengeEvents).values({
        id: uid(), challengeId: challenge.id, participantId: participant.id,
        eventType: "stat_delta", pointsAwarded: points - participant.currentPoints,
        rawPayload: { delta, total: points },
      });
    }
  }
}

// Complete ended challenges: mark completed, award quest CP, notify winners.
export async function finalizeChallenges(db: DB) {
  const ended = await db.select().from(schema.challenges).where(and(
    eq(schema.challenges.status, "active"),
    lt(schema.challenges.endAt, new Date()),
  ));
  for (const challenge of ended) {
    const standings = await db.select().from(schema.challengeParticipants)
      .where(eq(schema.challengeParticipants.challengeId, challenge.id))
      .orderBy(sql`${schema.challengeParticipants.currentPoints} DESC`);
    const podium = challenge.format === "top1" ? 1 : 3;
    for (let i = 0; i < standings.length; i++) {
      const p = standings[i];
      await db.update(schema.challengeParticipants)
        .set({ finalPlacement: i + 1, status: p.status === "disqualified" ? "disqualified" : "completed" })
        .where(eq(schema.challengeParticipants.id, p.id));
      if (p.status !== "disqualified") await awardQuestAction(db, p.userId, "finish_challenge", { refType: "challenge", refId: challenge.id });
      if (i === 0 && p.currentPoints > 0) { await awardQuestAction(db, p.userId, "win_challenge", { refType: "challenge", refId: challenge.id }); await awardQuestAction(db, p.userId, "top3_challenge", { refType: "challenge", refId: challenge.id }); }
      else if (i < podium && p.currentPoints > 0) { await awardQuestAction(db, p.userId, "top3_challenge", { refType: "challenge", refId: challenge.id }); }
      if (i < podium && p.currentPoints > 0) {
        await db.insert(schema.notifications).values({
          id: uid(), userId: p.userId, type: "challenge",
          title: `You placed #${i + 1} in "${challenge.title}"!`,
          body: challenge.prizeDescription ? `Prize: ${challenge.prizeDescription}` : "Congratulations, champion.",
          href: `/spaces`,
        });
      }
    }
    await db.update(schema.challenges).set({ status: "completed" })
      .where(eq(schema.challenges.id, challenge.id));
  }
  // Activate scheduled challenges whose window has opened.
  await db.update(schema.challenges).set({ status: "active" }).where(and(
    eq(schema.challenges.status, "draft"),
    lt(schema.challenges.startAt, new Date()),
  ));
}

/**
 * How many accounts one cron run may take, and how many at once. B105.
 *
 * ===== THE DEFECT THIS REPLACES =====
 *
 * This was a SERIAL loop over 25 accounts, each one an external HTTP call to a
 * game provider taking anywhere from 200ms to several seconds. On an hourly
 * cron that is a hard ceiling of 25 accounts an hour — so at about thirty
 * linked accounts the queue stops draining, and every account after that falls
 * further behind every hour, forever. Stats going stale is not a visible crash;
 * it is a leaderboard that quietly stops moving.
 *
 * Two numbers fix it, and they are separate on purpose:
 *
 *   TAKE  how many the run claims. Bounded because a run has a wall-clock
 *         budget and an unbounded one would be killed mid-flight, leaving
 *         `nextSyncAt` unset on whatever it had not reached.
 *   POOL  how many run AT ONCE. Bounded because the thing on the other end is
 *         somebody else's rate limit — Riot's, Steam's — and the fastest way to
 *         lose an API key is to spike it.
 *
 * 120 × 6 is roughly twenty serial rounds: comfortably inside a cron's budget,
 * and enough headroom that the queue drains rather than grows at any size this
 * product plausibly reaches before someone revisits it.
 */
export const SYNC_TAKE = 120;
export const SYNC_POOL = 6;

/**
 * Run `work` over `items`, at most `size` at a time.
 *
 * A pool rather than `Promise.all`, which would fire all 120 at once, and rather
 * than a serial loop, which is what was wrong. Each worker takes the next index
 * until there are none — no chunking, so one slow account cannot idle five
 * workers waiting for its batch to finish.
 */
async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await work(items[i]);
    }
  });
  await Promise.all(workers);
}

// Batch sync for cron: pick accounts whose nextSyncAt has passed.
export type ProviderSyncReport = {
  provider: string;
  synced: number;
  failed: number;
  /** Every account for this provider failed, and there was at least one. */
  down: boolean;
  /** The last reason one of them gave, so the report names the cause. */
  lastError?: string;
};

/**
 * PER PROVIDER, AND NEVER A FAILURE-COUNT THRESHOLD. F1.
 *
 * The hourly sync answered `{ok: true, synced: 7, failed: 53}` and Vercel saw a
 * green cron. Fifty-three failures is the difference between a leaderboard that
 * is the product and a leaderboard that is a lie, and nothing anywhere said so.
 *
 * The obvious fix — fail above N failures — is the wrong one, because the
 * number gets tuned upwards the first time it pages somebody at a weekend and
 * it never comes back down. It also asks a question nobody cares about. What
 * matters is not HOW MANY failed but WHETHER A WHOLE PROVIDER IS DOWN: "every
 * Riot account failed, the key expired" is a thing to act on tonight, and "3%
 * scattered across six providers" is a normal hour with some dead handles in it.
 *
 * So the run reports per provider, and it is unhealthy when any single provider
 * failed 100% of what it attempted. That signal cannot be tuned away without
 * deleting it, which is the point.
 */
export function providersDown(byProvider: ProviderSyncReport[]): ProviderSyncReport[] {
  return byProvider.filter((p) => p.down);
}

export async function syncDueAccounts(db: DB, limit = SYNC_TAKE): Promise<{
  synced: number; failed: number; byProvider: ProviderSyncReport[]; down: string[];
}> {
  const due = await db.select().from(schema.linkedGameAccounts)
    .where(or(
      isNull(schema.linkedGameAccounts.nextSyncAt),
      lt(schema.linkedGameAccounts.nextSyncAt, new Date()),
    ))
    // Oldest first, nulls first. A never-synced account is the one whose owner
    // is most likely staring at an empty profile right now.
    .orderBy(asc(schema.linkedGameAccounts.nextSyncAt))
    .limit(limit);

  let synced = 0, failed = 0;
  const per = new Map<string, { synced: number; failed: number; lastError?: string }>();
  const note = (provider: string, ok: boolean, error?: string) => {
    const row = per.get(provider) ?? { synced: 0, failed: 0 };
    if (ok) row.synced++;
    else { row.failed++; if (error) row.lastError = error.slice(0, 160); }
    per.set(provider, row);
  };

  await pool(due, SYNC_POOL, async (account) => {
    // `syncAccount` already swallows its own failures and records them on the
    // row. The catch here is for the case it cannot: a throw would abandon
    // every remaining account in this worker.
    try {
      const r = await syncAccount(db, account);
      if (r.ok) { synced++; note(account.provider, true); }
      else { failed++; note(account.provider, false, (r as { error?: string }).error); }
    } catch (e) { failed++; note(account.provider, false, String(e)); }
  });

  await finalizeChallenges(db);

  const byProvider: ProviderSyncReport[] = [...per.entries()]
    .map(([provider, r]) => ({
      provider, synced: r.synced, failed: r.failed,
      // Every attempt failed, and there was something to attempt. One account
      // for a provider that happens to be a dead handle counts here too, and
      // that is correct: with a sample of one we cannot tell the difference,
      // and the honest report is "everything we tried for this provider failed".
      down: r.failed > 0 && r.synced === 0,
      ...(r.lastError ? { lastError: r.lastError } : {}),
    }))
    .sort((a, b) => b.failed - a.failed);

  return { synced, failed, byProvider, down: providersDown(byProvider).map((p) => p.provider) };
}

// On-demand sync with a cooldown, used when a profile page is viewed.
export async function syncUserAccountsIfStale(db: DB, userId: string, cooldownMin = 15) {
  const cutoff = new Date(Date.now() - cooldownMin * 60_000);
  const accounts = await db.select().from(schema.linkedGameAccounts).where(and(
    eq(schema.linkedGameAccounts.userId, userId),
    or(
      isNull(schema.linkedGameAccounts.lastSyncedAt),
      lt(schema.linkedGameAccounts.lastSyncedAt, cutoff),
    ),
  ));
  // Skip accounts that need a manual reconnect — their token is dead, and their
  // stats are already preserved. Retrying just wastes API calls.
  const syncable = accounts.filter((a) => a.syncStatus !== "needs_reconnect");
  await Promise.allSettled(syncable.map((a) => syncAccount(db, a)));
}
