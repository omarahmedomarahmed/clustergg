// Announcements are queued, and a cron drains them (B33).
//
// **The bug this closes was live and got worse with exactly the growth we are
// building for.** `announce()` posted to every guild sequentially, awaiting each
// call, from server actions that declare no `maxDuration`
// (`app/actions/discord.ts:106`, `app/actions/admin.ts:610`,
// `app/actions/challenge-requests.ts:115`, `lib/challenge-series.ts:174`,
// `lib/welcome-challenge.ts:103`). At ~200ms per Discord call that is 20 seconds
// at 100 servers and over three minutes at 1,000 — inside a request killed long
// before.
//
// The awaits were never the problem. Sequential is correct: a burst of parallel
// posts is the fastest way to get rate-limited across every server at once, and
// **parallelising would trade a slow failure for a temporary ban**, which is
// worse. There were simply too many of them in one request.
//
// The failure was also silent and PARTIAL. The delivery ledger checkpoints every
// ten servers, so a killed run left a plausible-looking number behind. Anyone
// reading it would conclude "reach was lower than expected", not "the process
// was killed" — a wrong number that looks right is worse than no number.
//
// So: the action enqueues and returns immediately, reporting **queued**, not
// **reached**. A cron with a real `maxDuration` drains a bounded batch.

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.ts";
import { dmUser, postMessage } from "./rest.ts";
import { uid } from "../core/utils.ts";

/**
 * The DM transport slot. A record rather than a setter, for the reason
 * `lib/delivery/send.ts` sets out at its own: an exported setter nothing in
 * `app/` calls is what L12 is about, and excusing one is the softening the rule
 * exists to prevent.
 *
 * Its default is the real call, so production cannot end up running on a stub.
 * The band assigns to it because L10's whole subject is what happens when
 * Discord **refuses** a DM — 50007, an owner with DMs from server members
 * turned off — and a rule about a failure that cannot be made to fail is a rule
 * nobody has checked.
 */
export const DM_TRANSPORT: { send: typeof dmUser } = { send: dmUser };

/** How many rows one drain run will attempt. Bounded by the cron's maxDuration. */
export const DRAIN_BATCH = 120;

/**
 * How many times one server is retried before it is given up on.
 *
 * A guild that has deleted the channel or revoked the bot fails identically
 * every time; retrying it forever would mean a permanently non-empty queue that
 * nobody trusts. Four attempts with backoff spans hours, which covers an outage
 * and does not cover a deletion.
 */
export const MAX_ATTEMPTS = 4;

/** Backoff per attempt, in minutes. Index is the attempt just completed. */
const BACKOFF_MINUTES = [1, 5, 20, 60];

export type Enqueued = { batchId: string; queued: number };

export type QueueLedger = { challengeId: string; kind: "launch" | "ending" | "result" };

/**
 * Write one row per target and return. Nothing is posted here.
 *
 * The payload is per-target and finished — the sponsor row under an
 * announcement is minted per recipient, so rebuilding it at drain time would
 * attribute a click to the wrong server.
 */
export async function enqueuePosts(
  targets: {
    channelId?: string | null;
    /** Set instead of `channelId` for a DM. L11 — never inline, always here. */
    dmUserId?: string | null;
    guildId: string | null;
    payload: Record<string, unknown>;
    /** What this message is, for the delivery record a DM writes at drain. */
    kind?: string | null;
  }[],
  ledger?: QueueLedger,
): Promise<Enqueued> {
  const batchId = uid();
  if (!targets.length) return { batchId, queued: 0 };
  try {
    const db = await getDb();
    const rows = targets.map((t) => ({
      id: uid(), batchId,
      channelId: t.channelId ?? null,
      dmUserId: t.dmUserId ?? null,
      guildId: t.guildId,
      payload: t.payload,
      ledgerChallengeId: ledger?.challengeId ?? null,
      // A DM carries what it is here so the drain can write the delivery
      // record without guessing. Channel posts keep using this for the
      // announcement ledger, which is what it was built for.
      ledgerKind: t.kind ?? ledger?.kind ?? null,
    }));
    // Chunked: one insert of a thousand rows is a statement some drivers refuse,
    // and this path must not fail for a server that has grown.
    for (let i = 0; i < rows.length; i += 200) {
      await db.insert(schema.discordPostQueue).values(rows.slice(i, i + 200));
    }
    return { batchId, queued: rows.length };
  } catch { return { batchId, queued: 0 }; }
}

export type DrainResult = {
  attempted: number; posted: number; rescheduled: number; failed: number;
  /** True when more rows are waiting — the caller can run again sooner. */
  more: boolean;
};

/**
 * Post a bounded batch. Called by cron, and by the admin "drain now" button.
 *
 * Still sequential, and still deliberately so. What changed is that the loop is
 * now inside a request that declares how long it may take, and one that can stop
 * and be resumed rather than being killed mid-way with no record of where it got
 * to.
 */
export async function drainPostQueue(limit = DRAIN_BATCH): Promise<DrainResult> {
  const out: DrainResult = { attempted: 0, posted: 0, rescheduled: 0, failed: 0, more: false };
  try {
    const db = await getDb();
    const now = new Date();
    const due = await db.select().from(schema.discordPostQueue)
      .where(and(
        eq(schema.discordPostQueue.status, "pending"),
        lte(schema.discordPostQueue.nextAttemptAt, now),
      ))
      .orderBy(asc(schema.discordPostQueue.nextAttemptAt))
      .limit(limit);

    // Deliveries are recorded per challenge, in one write at the end, rather
    // than one per row. The ledger's own unique index makes repeats free.
    const landedBy = new Map<string, { kind: string; guilds: string[] }>();

    for (const row of due) {
      out.attempted++;
      // ===== L11 — THE DM GOES THROUGH HERE, NOT THROUGH A REQUEST =====
      //
      // Same batching, same backoff, same give-up budget as an announcement.
      // The only difference is the call, and `dmUser` opens the channel first
      // — which is the call that fails when an owner has blocked DMs from
      // server members, and the reason `dmUser` reports a status rather than a
      // boolean.
      const res = row.dmUserId
        ? await DM_TRANSPORT.send(row.dmUserId, row.payload as never)
        : await postMessage(row.channelId ?? "", row.payload as never);

      if (row.dmUserId) {
        await recordDmOutcome(db, row, res.ok ? null : `${res.status}: ${res.error}`);
      }
      if (res.ok) {
        await db.update(schema.discordPostQueue)
          .set({ status: "done", postedAt: new Date(), lastError: null })
          .where(eq(schema.discordPostQueue.id, row.id));
        out.posted++;
        if (row.ledgerChallengeId && row.guildId) {
          const key = `${row.ledgerChallengeId}:${row.ledgerKind ?? "launch"}`;
          const cur = landedBy.get(key) ?? { kind: row.ledgerKind ?? "launch", guilds: [] };
          cur.guilds.push(row.guildId);
          landedBy.set(key, cur);
        }
        continue;
      }

      const attempts = row.attempts + 1;
      // A 429 that survived the REST layer's own retry is a real rate limit, not
      // a broken channel. It reschedules and does NOT count toward the
      // give-up budget — giving up on a server because Discord was busy would
      // drop a message nobody ever knew was missing.
      const rateLimited = res.status === 429;
      const giveUp = !rateLimited && attempts >= MAX_ATTEMPTS;
      if (giveUp) {
        await db.update(schema.discordPostQueue)
          .set({ status: "failed", attempts, lastError: `${res.status}: ${res.error}` })
          .where(eq(schema.discordPostQueue.id, row.id));
        out.failed++;
      } else {
        const mins = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
        await db.update(schema.discordPostQueue)
          .set({
            attempts: rateLimited ? row.attempts : attempts,
            lastError: `${res.status}: ${res.error}`,
            nextAttemptAt: new Date(Date.now() + mins * 60_000),
          })
          .where(eq(schema.discordPostQueue.id, row.id));
        out.rescheduled++;
      }
    }

    // WIRED ON ARRIVAL: the old platform's delivery ledger was a separate
    // module with its own tables. Reach on this platform is counted from
    // `challenge_announcements`, which `announce()` writes — so what a drain
    // records is which guilds an announcement actually LANDED in, as opposed
    // to which ones it was aimed at. A brand's reach figure must be counted,
    // never modelled, and a card that failed to post reached nobody.
    for (const [key, v] of landedBy) {
      const challengeId = key.slice(0, key.lastIndexOf(":"));
      try {
        await recordLandings(db, challengeId, v.guilds);
      } catch { /* the ledger swallows its own errors */ }
    }

    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.discordPostQueue)
      .where(and(
        eq(schema.discordPostQueue.status, "pending"),
        lte(schema.discordPostQueue.nextAttemptAt, new Date()),
      ));
    out.more = Number(n ?? 0) > 0;
  } catch { /* a drain that throws must not take the cron route down */ }
  return out;
}

export type QueueStatus = {
  pending: number; failed: number; done: number;
  /** The servers we have given up on, with why — this is the actionable list. */
  failures: {
    guildId: string | null;
    channelId: string | null;
    dmUserId: string | null;
    error: string | null;
    attempts: number;
  }[];
};

/** What the admin console shows: what is waiting, and what we gave up on. */
export async function queueStatus(limit = 50): Promise<QueueStatus> {
  const empty: QueueStatus = { pending: 0, failed: 0, done: 0, failures: [] };
  try {
    const db = await getDb();
    const counts = await db.select({
      status: schema.discordPostQueue.status,
      n: sql<number>`count(*)`,
    }).from(schema.discordPostQueue).groupBy(schema.discordPostQueue.status);
    const by = new Map(counts.map((c) => [c.status, Number(c.n ?? 0)]));
    const failures = await db.select({
      guildId: schema.discordPostQueue.guildId,
      channelId: schema.discordPostQueue.channelId,
      dmUserId: schema.discordPostQueue.dmUserId,
      error: schema.discordPostQueue.lastError,
      attempts: schema.discordPostQueue.attempts,
    }).from(schema.discordPostQueue)
      .where(eq(schema.discordPostQueue.status, "failed"))
      .orderBy(asc(schema.discordPostQueue.createdAt))
      .limit(limit);
    return {
      pending: by.get("pending") ?? 0,
      failed: by.get("failed") ?? 0,
      done: by.get("done") ?? 0,
      failures,
    };
  } catch { return empty; }
}

/** Put a failed row back in the queue, from the admin console. */
export async function retryFailed(): Promise<number> {
  try {
    const db = await getDb();
    // Counted before the update: `.returning()` is not available on every
    // driver this runs against, and a retry button that reports the wrong
    // number is a button nobody believes twice.
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.discordPostQueue)
      .where(eq(schema.discordPostQueue.status, "failed"));
    await db.update(schema.discordPostQueue)
      .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null })
      .where(eq(schema.discordPostQueue.status, "failed"));
    return Number(n ?? 0);
  } catch { return 0; }
}

/**
 * Record that an announcement actually reached these servers.
 *
 * Called only from a successful post. `announce()` writes the intent; this
 * writes the fact, and the two differ whenever a guild has deleted the channel
 * or revoked the bot. Reach is counted, never modelled (docs/00-TRUTH.md §8),
 * so a brand's number comes from here.
 */
async function recordLandings(
  db: Awaited<ReturnType<typeof getDb>>,
  challengeId: string,
  guildIds: (string | null)[],
): Promise<void> {
  const ids = guildIds.filter((g): g is string => Boolean(g));
  if (!ids.length) return;
  for (const guildId of ids) {
    const [guild] = await db
      .select({ memberCount: schema.guilds.memberCount })
      .from(schema.guilds)
      .where(eq(schema.guilds.guildId, guildId));
    await db
      .insert(schema.challengeAnnouncements)
      .values({
        id: uid(),
        challengeId,
        guildId,
        memberCountAt: guild?.memberCount ?? 0,
      })
      .onConflictDoNothing();
  }
}

/**
 * L10 — a DM's outcome is a state a human can see, with when it was tried.
 *
 * Two writes, deliberately, because they answer two different questions. The
 * `deliveries` row is the **history**: every attempt, with its reason and its
 * timestamp, which is what an operator asked *"did we ever tell them?"* needs.
 * `guilds.ownerDmState` is the **current** answer, which is what the registry
 * shows at a glance and what the reassignment refusal reads — a query that had
 * to scan a history table to decide whether somebody may be replaced would be
 * a rule nobody could see the working of.
 *
 * Fenced whole. An owner who blocks DMs is a normal state of the world, and
 * recording it must never be able to take the drain down.
 */
async function recordDmOutcome(
  db: Awaited<ReturnType<typeof getDb>>,
  row: { dmUserId: string | null; guildId: string | null; ledgerKind: string | null },
  error: string | null,
): Promise<void> {
  try {
    const { record } = await import("../delivery/send.ts");
    await record({
      channel: "dm",
      kind: row.ledgerKind ?? "dm",
      recipient: row.dmUserId ?? "(unknown)",
      guildId: row.guildId,
      status: error ? "failed" : "sent",
      error,
    });
    if (row.guildId) {
      // ===== ONE WRITER FOR THE FLAG, AND IT IS NOT THIS FILE =====
      //
      // The obvious line here is an `update` on `guilds.owner_dm_state`, and it
      // was one until `94-export-reach` pointed out that `recordOwnerDm` — the
      // function 12 §6 was written around, which also writes the audit entry
      // for a failure — had no caller. Two writers for one column is K12's
      // shape, and the one that drifts is always the one that also does
      // something else.
      const { recordOwnerDm } = await import("../admin/registry.ts");
      await recordOwnerDm(db, { guildId: row.guildId, state: error ? "failed" : "sent" });
    }
  } catch (e) {
    console.error("[post-queue] could not record a DM outcome", e);
  }
}
