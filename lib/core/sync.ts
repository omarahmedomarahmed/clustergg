// The sync engine.
//
// ===== WHAT CAME ACROSS, AND WHAT DELIBERATELY DID NOT =====
//
// docs/11-PORTED-CODE.md names what `ported/core/sync.ts` was kept for:
// "batching, intervals, error backoff, and the stale-identifier self-heal that
// recovered production when Riot's key rotated", plus the proven-account guard
// that must survive. All of that is here, and the comments explaining *why*
// came with it, because they are the part that was expensive to learn.
//
// What did not come across is the second half of that file: `scoreChallenges‑
// ForAccount` and `finalizeChallenges`. Three reasons, and none of them is
// tidiness:
//
//   1. They call `awardQuestAction` five times. Quests, CP and the whole
//      gamification layer were deleted by ruling (docs/00-TRUTH.md §11).
//   2. They encode the *previous* baselining decision — resnapshot to `now`
//      lazily on the next sync — which is not `max(challengeStart, joinedAt)`
//      stamped by a start-of-week job. Porting it would have been exactly the
//      failure this branch exists to end: reading old code and assuming it
//      encoded a current decision.
//   3. They read `stat_current`, a stored-latest-value table. There is no such
//      table now. A current value is the latest `observations` row.
//
// Scoring is Stage 4's, written against the new truth. This module's job ends
// at "the numbers are in the series and they are honest".

import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { ADAPTERS, isStaleIdentifier } from "../providers/adapters.ts";
import { getProvider, isProviderLive } from "../providers/registry.ts";
import { isProven } from "../identity/accounts.ts";
import { uid } from "./utils.ts";

const SYNC_INTERVAL_MIN = 30;
const ERROR_BACKOFF_MIN = 120;
const DEAD_BACKOFF_MIN = 24 * 60;

type Account = typeof schema.linkedGameAccounts.$inferSelect;

export type SyncOutcome = {
  ok: boolean;
  error?: string;
  /** Metrics whose series was re-baselined because the value went backwards. */
  seasonResets?: string[];
};

/**
 * Sync one account.
 *
 * `account` is reassigned in exactly one place — the stale-id repair — so that
 * everything after it reads the id that actually worked rather than the one
 * that failed.
 */
export async function syncAccount(
  db: DB,
  account: Account,
  opts: {
    queue?: "solo" | "flex" | "both";
    rich?: boolean;
    /**
     * When this reading was taken.
     *
     * Defaults to now, and is only ever passed by a simulation. The four-week
     * run in docs/09-TEST-PLAN.md compresses a month into a few seconds, so
     * every observation would otherwise land on the same wall-clock instant
     * and `observationsAsAt` — which is how a closed week keeps reading the
     * same on Sunday as it did on Friday — would have nothing to order by.
     */
    at?: Date;
  } = {},
): Promise<SyncOutcome> {
  const provider = getProvider(account.provider);
  const adapter = ADAPTERS[account.provider];
  const nextOk = new Date(Date.now() + SYNC_INTERVAL_MIN * 60_000);
  const nextErr = new Date(Date.now() + ERROR_BACKOFF_MIN * 60_000);
  const nextDead = new Date(Date.now() + DEAD_BACKOFF_MIN * 60_000);

  if (!provider || !adapter) {
    await mark(db, account.id, {
      syncStatus: "error",
      syncError: "Unknown provider",
      nextSyncAt: nextErr,
    });
    return { ok: false, error: "Unknown provider" };
  }
  if (!isProviderLive(provider)) {
    // Two reasons a provider is not live, and they read differently to whoever
    // sees the row: a missing key is an operator task, and `notLive` is a
    // product fact nobody can configure their way out of. VALORANT is the
    // second kind.
    const why = provider.notLive ?? `Requires ${provider.envVars.join(", ")}`;
    await mark(db, account.id, {
      syncStatus: "needs_key",
      syncError: why,
      nextSyncAt: nextErr,
    });
    return { ok: false, error: why };
  }

  const ref = {
    providerAccountId: account.providerAccountId,
    inGameName: account.inGameName ?? "",
    region: account.region,
    providerData: account.providerData,
    queue: opts.queue,
    rich: opts.rich,
  };
  let result = await adapter.fetchStats(ref);

  // ===== A STALE ACCOUNT ID HEALS ITSELF, ONCE =====
  //
  // Riot encrypts the ids it issues. Rotating the API key — development to
  // personal, and personal to production when that lands — makes every id
  // minted under the old key undecryptable, and Riot says so:
  // `400 Bad Request - Exception decrypting <id>`. That took every League
  // account on the platform down the day the key changed, and they stayed
  // down: nothing retries its way out of it, because the request is wrong,
  // not unlucky.
  //
  // The Riot ID is already stored in `inGameName`, so a new PUUID is one call
  // away. Doing it here means the next key rotation is a blip rather than an
  // outage somebody has to notice first.
  //
  // ===== AND THE ONE REASON THIS IS NOT UNCONDITIONAL =====
  //
  // Re-resolving means asking "who holds GameName#TAG *now*". Riot IDs can be
  // changed and the old one taken by somebody else, so on a renamed account
  // this would silently repoint our row — and every trophy, standing and
  // payout attached to it — at a different human.
  //
  // That risk is only acceptable where the row never claimed to be a proven
  // person. A row carrying real ownership proof is left alone and marked for
  // reconnection instead: better a gamer re-proves an account than that we
  // quietly hand one to a stranger. `isProven` is the same predicate the
  // verification tick uses, so the two can never disagree about what "proven"
  // means.
  if (!result.ok && adapter.reidentify && isStaleIdentifier(result.error)) {
    if (isProven(account.verifiedMethod)) {
      await mark(db, account.id, {
        syncStatus: "needs_reconnect",
        syncError:
          "This account's id is stale after a provider key change. Re-verify " +
          "it to reconnect — we won't re-point a proven account on our own.",
        lastSyncAt: new Date(),
        nextSyncAt: nextDead,
      });
      return { ok: false, error: "stale id on a proven account" };
    }
    const fresh = await adapter.reidentify(ref).catch(() => null);
    // Only write when it actually changed. An unchanged id means the diagnosis
    // was wrong, and rewriting the same value would log a repair that did not
    // happen.
    if (fresh && fresh !== account.providerAccountId) {
      await db
        .update(schema.linkedGameAccounts)
        .set({ providerAccountId: fresh })
        .where(eq(schema.linkedGameAccounts.id, account.id));
      account = { ...account, providerAccountId: fresh };
      // Retried ONCE, from the new id. A second failure is a real failure and
      // falls through to the normal error handling below.
      result = await adapter.fetchStats({ ...ref, providerAccountId: fresh });
    }
  }

  if (!result.ok) {
    // On any failure — including an expired token — only the account's status
    // moves. Observations already recorded are left untouched, so the gamer
    // keeps their progress and their standing until they reconnect.
    const rateLimited = /429/.test(result.error);
    const status = result.authExpired
      ? "needs_reconnect"
      : rateLimited
        ? "rate_limited"
        : "error";
    await mark(db, account.id, {
      syncStatus: status,
      syncError: result.error.slice(0, 300),
      lastSyncAt: new Date(),
      // A dead token backs off hard. There is no point retrying it hourly.
      nextSyncAt: result.authExpired ? nextDead : nextErr,
    });
    return { ok: false, error: result.error };
  }

  if (result.providerDataPatch) {
    await db
      .update(schema.linkedGameAccounts)
      .set({ providerData: { ...(account.providerData ?? {}), ...result.providerDataPatch } })
      .where(eq(schema.linkedGameAccounts.id, account.id));
  }

  const seasonResets = await record(db, account, result.metrics, opts.at ?? new Date());

  // `verified` is deliberately NOT touched here.
  //
  // A successful sync proves the account exists and that we can read it. It
  // says nothing about who owns it — and a line here setting `verified: true`
  // on every sync is what made the flag meaningless on the old platform: any
  // ownership state recorded anywhere would be overwritten within thirty
  // minutes by a cron. Ownership is proven once and stays.
  await mark(db, account.id, {
    syncStatus: "ok",
    syncError: null,
    lastSyncAt: new Date(),
    nextSyncAt: nextOk,
  });

  return { ok: true, ...(seasonResets.length ? { seasonResets } : {}) };
}

async function mark(
  db: DB,
  id: string,
  set: Partial<typeof schema.linkedGameAccounts.$inferInsert>,
): Promise<void> {
  await db.update(schema.linkedGameAccounts).set(set).where(eq(schema.linkedGameAccounts.id, id));
}

/**
 * Append what this sync saw, and notice when a metric went backwards.
 *
 * ===== SEASON-ROLLOVER DETECTION. ADDED ON ARRIVAL =====
 *
 * Riot resets `wins` to 0 at a split. Every other cumulative counter on the
 * platform can do the same thing: an account is reset, a game wipes a ladder,
 * a provider changes what it counts.
 *
 * The naive handling — `Math.max(0, current - baseline)` — looks correct and
 * is a catastrophe. After a reset, `current` is below every baseline stamped
 * before it, so the clamp reads zero and *keeps* reading zero: every League
 * player silently loses their entire week, every split, and the leaderboard
 * simply stops moving. Nothing throws. Nobody is paged. The first signal is a
 * gamer asking why they have no points.
 *
 * So a decrease is treated as what it is — a new era for that series — and
 * recorded as an event. Stage 4's scoring reads `seasonResets` and re-stamps
 * the affected baselines rather than clamping. The row exists so that when a
 * gamer asks why their points changed on a Tuesday, there is an answer.
 *
 * Only cumulative counters can roll over. A *rank* going down is a player
 * having a bad week, not a reset, and re-baselining it would erase a real
 * demotion — so ladder-valued metrics are excluded by the registry knowing
 * which of its metrics carry ranks.
 */
async function record(
  db: DB,
  account: Account,
  metrics: Record<string, { value: number; rankLabel?: string }>,
  at: Date,
): Promise<string[]> {
  const provider = getProvider(account.provider);
  const laddered = new Set(
    (provider?.capabilities ?? []).filter((c) => c.ranks).map((c) => c.key),
  );
  const resets: string[] = [];

  for (const [metricKey, metric] of Object.entries(metrics)) {
    const [previous] = await db
      .select()
      .from(schema.observations)
      .where(
        and(
          eq(schema.observations.linkedAccountId, account.id),
          eq(schema.observations.metricKey, metricKey),
        ),
      )
      .orderBy(desc(schema.observations.observedAt))
      .limit(1);

    const value = Math.round(metric.value);

    if (previous && value < previous.value && !laddered.has(metricKey)) {
      await db.insert(schema.seasonResets).values({
        id: uid(),
        linkedAccountId: account.id,
        metricKey,
        previousValue: previous.value,
        newValue: value,
        detectedAt: at,
      });
      resets.push(metricKey);
    }

    // Appended unconditionally, including when the value has not moved. A
    // series with gaps cannot answer "what was this on Tuesday", and the
    // storage cost of one integer an hour is not a reason to be unable to.
    await db.insert(schema.observations).values({
      id: uid(),
      linkedAccountId: account.id,
      provider: account.provider,
      metricKey,
      value,
      rankLabel: metric.rankLabel ?? null,
      observedAt: at,
    });
  }

  return resets;
}

/** The latest reading of every metric for an account. Derived, never stored. */
export async function latestObservations(
  db: DB,
  linkedAccountId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(schema.observations)
    .where(eq(schema.observations.linkedAccountId, linkedAccountId))
    .orderBy(asc(schema.observations.observedAt));

  // Ascending, so the last write of each key wins. One pass, and it does not
  // care how many metrics or how long the series is.
  const out: Record<string, number> = {};
  for (const r of rows) out[r.metricKey] = r.value;
  return out;
}

/**
 * How many accounts one cron run may take, and how many at once.
 *
 * ===== THE DEFECT THIS REPLACES =====
 *
 * This was a SERIAL loop over 25 accounts, each an external HTTP call taking
 * anywhere from 200ms to several seconds. On an hourly cron that is a hard
 * ceiling of 25 accounts an hour — so at about thirty linked accounts the
 * queue stops draining and every account after that falls further behind every
 * hour, forever. Stats going stale is not a visible crash; it is a leaderboard
 * that quietly stops moving.
 *
 * Two numbers fix it, and they are separate on purpose:
 *
 *   TAKE  how many the run claims. Bounded because a run has a wall-clock
 *         budget and an unbounded one would be killed mid-flight, leaving
 *         `nextSyncAt` unset on whatever it had not reached.
 *   POOL  how many run AT ONCE. Bounded because the thing on the other end is
 *         somebody else's rate limit — Riot's, Steam's — and the fastest way
 *         to lose an API key is to spike it.
 */
export const SYNC_TAKE = 120;
export const SYNC_POOL = 6;

/**
 * Run `work` over `items`, at most `size` at a time.
 *
 * A pool rather than `Promise.all`, which would fire all 120 at once, and
 * rather than a serial loop, which is what was wrong. Each worker takes the
 * next index until there are none — no chunking, so one slow account cannot
 * idle five workers waiting for its batch to finish.
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
 * PER PROVIDER, AND NEVER A FAILURE-COUNT THRESHOLD.
 *
 * The hourly sync used to answer `{ok: true, synced: 7, failed: 53}` and the
 * platform saw a green cron. Fifty-three failures is the difference between a
 * leaderboard that is the product and a leaderboard that is a lie, and nothing
 * anywhere said so.
 *
 * The obvious fix — fail above N failures — is the wrong one, because the
 * number gets tuned upwards the first time it pages somebody at a weekend and
 * it never comes back down. It also asks a question nobody cares about. What
 * matters is not HOW MANY failed but WHETHER A WHOLE PROVIDER IS DOWN: "every
 * Riot account failed, the key expired" is a thing to act on tonight, and "3%
 * scattered across six providers" is a normal hour with some dead handles in
 * it.
 *
 * So the run reports per provider, and it is unhealthy when any single
 * provider failed 100% of what it attempted. That signal cannot be tuned away
 * without deleting it, which is the point.
 */
export function providersDown(byProvider: ProviderSyncReport[]): ProviderSyncReport[] {
  return byProvider.filter((p) => p.down);
}

export async function syncDueAccounts(
  db: DB,
  limit = SYNC_TAKE,
): Promise<{
  synced: number;
  failed: number;
  byProvider: ProviderSyncReport[];
  down: string[];
}> {
  const due = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(
      or(
        isNull(schema.linkedGameAccounts.nextSyncAt),
        lt(schema.linkedGameAccounts.nextSyncAt, new Date()),
      ),
    )
    // Oldest first, nulls first. A never-synced account is the one whose owner
    // is most likely staring at an empty profile right now.
    .orderBy(asc(schema.linkedGameAccounts.nextSyncAt))
    .limit(limit);

  let synced = 0;
  let failed = 0;
  const per = new Map<string, { synced: number; failed: number; lastError?: string }>();
  const note = (provider: string, ok: boolean, error?: string) => {
    const row = per.get(provider) ?? { synced: 0, failed: 0 };
    if (ok) row.synced++;
    else {
      row.failed++;
      if (error) row.lastError = error.slice(0, 160);
    }
    per.set(provider, row);
  };

  await pool(due, SYNC_POOL, async (account) => {
    // `syncAccount` already swallows its own failures and records them on the
    // row. The catch here is for the case it cannot: a throw would abandon
    // every remaining account in this worker.
    try {
      const r = await syncAccount(db, account);
      if (r.ok) {
        synced++;
        note(account.provider, true);
      } else {
        failed++;
        note(account.provider, false, r.error);
      }
    } catch (e) {
      failed++;
      note(account.provider, false, String(e));
    }
  });

  const byProvider: ProviderSyncReport[] = [...per.entries()]
    .map(([provider, r]) => ({
      provider,
      synced: r.synced,
      failed: r.failed,
      // Every attempt failed, and there was something to attempt. One account
      // for a provider that happens to be a dead handle counts here too, and
      // that is correct: with a sample of one we cannot tell the difference,
      // and the honest report is "everything we tried for this provider
      // failed".
      down: r.failed > 0 && r.synced === 0,
      ...(r.lastError ? { lastError: r.lastError } : {}),
    }))
    .sort((a, b) => b.failed - a.failed);

  return { synced, failed, byProvider, down: providersDown(byProvider).map((p) => p.provider) };
}

/**
 * A forced sync, for the one place that must not read stale data: joining.
 *
 * C11 — "force a sync on join and stamp the baseline from that result. A stale
 * reading becomes free progress." Stage 4 calls this before stamping.
 */
export async function forceSync(
  db: DB,
  linkedAccountId: string,
  opts: { queue?: "solo" | "flex" | "both"; at?: Date } = {},
): Promise<SyncOutcome> {
  const [account] = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.id, linkedAccountId));
  if (!account) return { ok: false, error: "No such linked account" };
  return syncAccount(db, account, opts);
}

/** On-demand sync with a cooldown, for a profile page view. */
export async function syncUserAccountsIfStale(
  db: DB,
  userId: string,
  cooldownMin = 15,
): Promise<void> {
  const cutoff = new Date(Date.now() - cooldownMin * 60_000);
  const accounts = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(
      and(
        eq(schema.linkedGameAccounts.userId, userId),
        or(
          isNull(schema.linkedGameAccounts.lastSyncAt),
          lt(schema.linkedGameAccounts.lastSyncAt, cutoff),
        ),
      ),
    );
  // Skip accounts that need a manual reconnect — their token is dead and their
  // observations are already preserved. Retrying just spends API calls.
  const syncable = accounts.filter((a) => a.syncStatus !== "needs_reconnect");
  await Promise.allSettled(syncable.map((a) => syncAccount(db, a)));
}
