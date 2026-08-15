// The entry guard chain, in order.
//
// docs/03-CHALLENGES.md §5 lists eight guards and the refusal each one gives.
// The order is not decorative — R8 makes one dependency explicit:
//
//     **Ownership is checked before rank. An unproven account never reaches
//     the rank test.**
//
// Which matters because the rank test reads numbers off an account. Running it
// first would tell somebody the rank of an account they have not shown they
// own, and would let them discover, one Riot ID at a time, who is in range for
// a gated challenge.
//
// Each guard returns before the next runs, and every refusal names itself, so
// the bot card and the web page can both say the same true thing about why.

import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { unlockState } from "../identity/unlock.ts";
import { isProven } from "../identity/accounts.ts";
import { canProveOwnership, getProvider } from "../providers/registry.ts";
import { forceSync, latestObservations } from "../core/sync.ts";
import { baselineAtFor, observationsAsAt } from "./scoring.ts";
import { joiningLateNotice } from "./week.ts";

export type RefusalCode =
  | "not_found"
  | "not_active"
  | "onboarding"
  | "locked"
  | "bad_key"
  | "no_account"
  | "unproven"
  | "rank_below"
  | "rank_above"
  | "same_account";

export type EntryResult =
  | {
      ok: true;
      participantId: string;
      /** B4 — "Scoring starts now. 2 days left." Not a refusal. */
      notice: string | null;
      /** Whether the baseline was stamped now, or waits for the gun. */
      baselineStamped: boolean;
    }
  | { ok: false; code: RefusalCode; reason: string };

/** The rank a challenge's gate reads, from the provider's own ladder. */
function rankMetricFor(providerId: string, queue: string): string | null {
  const provider = getProvider(providerId);
  if (!provider) return null;
  const laddered = provider.capabilities.filter((c) => c.ranks);
  if (laddered.length === 0) return null;
  // A League challenge on flex gates on the flex ladder. Anything else uses
  // its single ladder.
  const preferred = queue === "flex" ? "flex_tier" : "solo_tier";
  return laddered.find((c) => c.key === preferred)?.key ?? laddered[0].key;
}

/**
 * Join a challenge.
 *
 * The whole chain, and then the two things that make baselining true: a forced
 * sync (B1) and a stamp at `max(challengeStart, joinedAt)` (P2).
 */
export async function enterChallenge(
  db: DB,
  input: {
    challengeId: string;
    userId: string;
    linkedAccountId?: string;
    guildId?: string | null;
    accessKey?: string | null;
  },
  now = new Date(),
): Promise<EntryResult> {
  // ── 1. The challenge exists.
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, input.challengeId));
  if (!challenge) {
    return { ok: false, code: "not_found", reason: "That challenge does not exist." };
  }

  // ── 2. It is announced or live, and has not closed. B5: they may join until
  //      the final second.
  const joinable =
    (challenge.state === "announced" || challenge.state === "live") &&
    challenge.endAt.getTime() > now.getTime();
  if (!joinable) {
    return {
      ok: false,
      code: "not_active",
      reason:
        challenge.endAt.getTime() <= now.getTime()
          ? "That challenge has closed."
          : "That challenge is not open yet.",
    };
  }

  // ── 3. Onboarding complete. The refusal names which of the three steps is
  //      missing — "complete onboarding" is a shrug, not a message.
  const unlock = await unlockState(db, input.userId);
  if (!unlock.unlocked) {
    return {
      ok: false,
      code: "onboarding",
      reason: `Finish onboarding first — still needed: ${unlock.missing.join(", ")}.`,
    };
  }

  // ── 4. The access key, for a community challenge. M25/C5: you must join the
  //      server to get it. The challenge IS the server's advertising.
  if (challenge.visibility === "community" && challenge.accessKey) {
    if (!input.accessKey) {
      return {
        ok: false,
        code: "locked",
        reason: "This is a community challenge. Join the server to get the key.",
      };
    }
    if (input.accessKey !== challenge.accessKey) {
      return { ok: false, code: "bad_key", reason: "That key is not right for this challenge." };
    }
  }

  // ── 5. A linked account on the right provider.
  const accounts = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(
      and(
        eq(schema.linkedGameAccounts.userId, input.userId),
        eq(schema.linkedGameAccounts.provider, challenge.provider),
      ),
    );
  const account = input.linkedAccountId
    ? accounts.find((a) => a.id === input.linkedAccountId)
    : accounts[0];
  if (!account) {
    return {
      ok: false,
      code: "no_account",
      reason: `Link a ${challenge.game} account first.`,
    };
  }

  // ── 6. Ownership, where the API supports proof. O1/O2/O3: where it cannot,
  //      entry is allowed with no badge, no warning and no second class — it
  //      is not the gamer's fault the publisher has no endpoint.
  if (canProveOwnership(challenge.provider) && !isProven(account.verifiedMethod)) {
    return {
      ok: false,
      code: "unproven",
      reason:
        `Prove you own that ${challenge.game} account first. ` +
        `It only takes a moment and it is why nobody can enter as you.`,
    };
  }

  // ── 8 (checked before the rank read, because it needs no stats). One entry
  //      per gamer per challenge, and the refusal says which account they used.
  const [existing] = await db
    .select()
    .from(schema.challengeParticipants)
    .where(
      and(
        eq(schema.challengeParticipants.challengeId, input.challengeId),
        eq(schema.challengeParticipants.userId, input.userId),
      ),
    );
  if (existing) {
    const [used] = await db
      .select({ name: schema.linkedGameAccounts.inGameName })
      .from(schema.linkedGameAccounts)
      .where(eq(schema.linkedGameAccounts.id, existing.linkedAccountId));
    return {
      ok: false,
      code: "same_account",
      reason: `You are already in this challenge with ${used?.name ?? "another account"}.`,
    };
  }

  // ===== THE FORCED SYNC. B1 =====
  //
  // Before the rank test and before the baseline, because both read the same
  // numbers and both are wrong on stale data: a stale reading gates on last
  // week's rank, and it becomes free progress the moment it is stamped as a
  // baseline.
  //
  // Stamped at `now` — the same instant the baseline is dated — and not left
  // to the clock inside the sync. Those differ by a few milliseconds, and the
  // baseline reads its values with `observedAt <= baselineAt`, so a reading
  // taken 2ms after the join instant is a reading the baseline cannot see. The
  // gamer would then baseline on the reading BEFORE their forced sync, which
  // is the stale reading this forced sync exists to avoid.
  await forceSync(db, account.id, {
    queue: challenge.queue as "solo" | "flex" | "both",
    at: now,
  });
  const current = await latestObservations(db, account.id);

  // ── 7. The rank gate. R1: a range. R2: at join only, never re-checked — they
  //      will rank up during the week and that is the point. R7: the refusal
  //      shows their rank and the range, so it is not a mystery.
  const rankMetric = rankMetricFor(challenge.provider, challenge.queue);
  const rank = rankMetric ? (current[rankMetric] ?? 0) : 0;
  if (challenge.rankMin !== null && rank < challenge.rankMin) {
    return {
      ok: false,
      code: "rank_below",
      reason: `Your rank is below this challenge's range (${rank} against a minimum of ${challenge.rankMin}).`,
    };
  }
  if (challenge.rankMax !== null && rank > challenge.rankMax) {
    return {
      ok: false,
      code: "rank_above",
      reason: `Your rank is above this challenge's range (${rank} against a maximum of ${challenge.rankMax}).`,
    };
  }

  // ── Entered. Now the baseline.
  const participantId = uid();
  const baselineAt = baselineAtFor(challenge.startAt, now);
  // An early joiner's baseline waits for the gun: there is nothing to measure
  // from yet, and stamping today's numbers would make the days before Monday
  // count. The start-of-week job stamps them (B2).
  const stampNow = baselineAt.getTime() <= now.getTime();

  // The values are read **as at `baselineAt`**, not "whatever the account
  // reads right now". For a day-2 joiner those are the same instant, which is
  // exactly why storing `current` looked correct — and it is why breaking the
  // baseline rule was caught only by the pure-function test and not by this
  // path: the date would have been wrong while the numbers stayed right, so
  // the score came out the same and the stored `baselineAt` was a quiet lie.
  const baselineValues = stampNow
    ? await observationsAsAt(db, account.id, baselineAt)
    : null;

  await db.insert(schema.challengeParticipants).values({
    id: participantId,
    challengeId: input.challengeId,
    userId: input.userId,
    linkedAccountId: account.id,
    guildId: input.guildId ?? null,
    joinedAt: now,
    baselineAt: stampNow ? baselineAt : null,
    baseline: baselineValues,
    rankAtJoin: rankMetric ? rank : null,
  });

  return {
    ok: true,
    participantId,
    notice: challenge.state === "live" ? joiningLateNotice(now) : null,
    baselineStamped: stampNow,
  };
}
