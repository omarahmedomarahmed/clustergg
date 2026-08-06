// Who an announcement is FOR (B1.2).
//
// The bug this exists to make impossible: `announceAccountLinked` once posted
// to every opted-in server on the network when one person linked one account.
// At three servers that reads as a lively product. At three hundred it is a
// stranger's name in everybody's channel, and it is the single fastest way to
// get the bot removed.
//
// That specific defect is fixed — the function scopes to `guildsOf(userId)` —
// but it was fixed by remembering to. This file makes the rule explicit, so
// the next announcement somebody adds has to declare who it is for, and so a
// test can check the answer rather than trusting a comment.
//
// The policy, in full:
//
//   NETWORK          every opted-in server. A PUBLIC challenge launching; the
//                    Sunday winners. Things a stranger's server benefits from
//                    knowing.
//   OWNING_SERVERS   the servers that carry it. A private challenge and its
//                    entry key — the one place a key is ever delivered.
//   THEIR_SERVERS    only servers this gamer is actually in. Linked an account,
//                    joined a challenge, reached a quest tier. Personal news.
//   DIRECT           a DM to one person. Your payout was sent; your portal key
//                    changed. Nobody else's business by construction.
//   HQ_ONLY          our own server. Operational noise.
//
// **Anything personal that is not THEIR_SERVERS or DIRECT is a bug.** That
// sentence is the whole file.

export type Audience =
  | "NETWORK"
  | "OWNING_SERVERS"
  | "THEIR_SERVERS"
  | "DIRECT"
  | "HQ_ONLY";

export const AUDIENCES: Record<Audience, { goesTo: string; why: string }> = {
  NETWORK: {
    goesTo: "every opted-in server",
    why: "A stranger's server benefits from knowing. Public challenges and the Sunday result.",
  },
  OWNING_SERVERS: {
    goesTo: "the servers that carry it",
    why: "A private challenge belongs to its server, and so does its entry key.",
  },
  THEIR_SERVERS: {
    goesTo: "only servers this gamer is in",
    why: "Personal news is interesting to people who know them and is spam to everybody else.",
  },
  DIRECT: {
    goesTo: "one person, by DM",
    why: "Money and credentials. Nobody else's business by construction.",
  },
  HQ_ONLY: {
    goesTo: "our own server",
    why: "Operational noise that a customer's channel should never carry.",
  },
};

/**
 * The declared audience of every announcement we send.
 *
 * Keyed on the exported function name, so `tests/db/spam-audit.mts` can walk
 * `lib/discord/announce.ts`, find every export, and fail if one is missing from
 * this table — a new announcement cannot be added without answering the
 * question.
 *
 * Personal ones are marked so the test can apply the harder rule to them
 * specifically rather than to everything.
 */
export const ANNOUNCEMENT_AUDIENCE: Record<string, { audience: Audience; personal: boolean }> = {
  // Personal — one gamer did one thing.
  announceAccountLinked: { audience: "THEIR_SERVERS", personal: true },
  announceChallengeJoined: { audience: "THEIR_SERVERS", personal: true },
  announceQuestTier: { audience: "THEIR_SERVERS", personal: true },

  // About a competition, not about a person.
  announceChallengeLaunched: { audience: "NETWORK", personal: false },
  announceChallengeReminder: { audience: "NETWORK", personal: false },
  announceChallengeEnded: { audience: "NETWORK", personal: false },
  remindLiveChallenges: { audience: "NETWORK", personal: false },

  // Staff, deliberately unscoped — the whole point of it.
  broadcastToGuilds: { audience: "NETWORK", personal: false },
};

/** Is this one of the buckets a personal event is allowed to use? */
export const PERSONAL_AUDIENCES: Audience[] = ["THEIR_SERVERS", "DIRECT"];

export function audienceOf(fn: string): Audience | null {
  return ANNOUNCEMENT_AUDIENCE[fn]?.audience ?? null;
}

// ===== Rate limits, because policy alone is not enough (B1.3) =====
//
// Correctly scoped is not the same as bearable. A server with 200 members
// linking accounts on launch day gets 200 correctly-scoped messages, and the
// owner removes the bot on the same reasoning as if they had been wrong.

/** At most one post of a kind per server per window. */
export const COOLDOWN_MINUTES: Record<string, number> = {
  account_linked: 60,
  challenge_joined: 60,
  quest_tier: 60,
};

/** Below this many suppressed, batching is not worth a message of its own. */
export const BATCH_FLOOR = 2;

export const cooldownFor = (kind: string) => COOLDOWN_MINUTES[kind] ?? 0;

/** The window a timestamp falls in, for the dedupe key. */
export function windowKey(kind: string, at: Date = new Date()): string {
  const mins = cooldownFor(kind);
  if (mins <= 0) return "";
  const bucket = Math.floor(at.getTime() / (mins * 60_000));
  return `${kind}:${bucket}`;
}

export type CooldownVerdict = {
  /** Servers this may actually post to now. */
  allowed: string[];
  /** Servers where it was swallowed, with how many they have swallowed. */
  suppressed: { guildId: string; total: number }[];
};

/**
 * Which of these servers may receive this kind right now.
 *
 * A unique index on `(guildId, windowKey)` does the deciding: the FIRST event
 * of a kind in a window inserts and is allowed; every one after conflicts, and
 * is counted against that row instead of being sent. That makes the cooldown a
 * property of the database rather than of two requests agreeing about time,
 * which matters because two people linking accounts in the same second is
 * exactly the case this is for.
 *
 * A kind with no configured cooldown passes straight through — challenge
 * launches are not spam and must not be throttled into silence.
 */
export async function applyCooldown(
  kind: string,
  guildIds: string[],
  who: string | null,
): Promise<CooldownVerdict> {
  if (cooldownFor(kind) <= 0 || !guildIds.length) {
    return { allowed: guildIds, suppressed: [] };
  }
  try {
    const { getDb, schema } = await import("@/lib/db");
    const { and, eq, sql } = await import("drizzle-orm");
    const { uid } = await import("@/lib/utils");
    const db = await getDb();
    const key = windowKey(kind);

    const allowed: string[] = [];
    const suppressed: { guildId: string; total: number }[] = [];

    for (const guildId of guildIds) {
      const [existing] = await db.select({
        id: schema.discordPostLog.id, suppressed: schema.discordPostLog.suppressed,
        names: schema.discordPostLog.names,
      }).from(schema.discordPostLog)
        .where(and(eq(schema.discordPostLog.guildId, guildId), eq(schema.discordPostLog.windowKey, key)))
        .limit(1);

      if (!existing) {
        await db.insert(schema.discordPostLog).values({
          id: uid(), guildId, kind, windowKey: key, suppressed: 0,
          names: who ? [who] : [],
        } as never).onConflictDoNothing();
        // Re-read rather than trust the insert: two requests in the same second
        // both find nothing and both insert, and the index lets exactly one
        // win. The loser must be suppressed, not allowed.
        const [now] = await db.select({ id: schema.discordPostLog.id, names: schema.discordPostLog.names })
          .from(schema.discordPostLog)
          .where(and(eq(schema.discordPostLog.guildId, guildId), eq(schema.discordPostLog.windowKey, key)))
          .limit(1);
        const iWon = !!now && (!who || (now.names ?? []).includes(who));
        if (iWon) { allowed.push(guildId); continue; }
      }

      const row = existing ?? (await db.select({
        id: schema.discordPostLog.id, suppressed: schema.discordPostLog.suppressed,
        names: schema.discordPostLog.names,
      }).from(schema.discordPostLog)
        .where(and(eq(schema.discordPostLog.guildId, guildId), eq(schema.discordPostLog.windowKey, key)))
        .limit(1))[0];
      if (!row) { allowed.push(guildId); continue; }

      const names = [...(row.names ?? [])];
      // Capped: this is a batch message, not a log. Twelve names is already
      // more than anybody reads.
      if (who && !names.includes(who) && names.length < 12) names.push(who);
      await db.update(schema.discordPostLog)
        .set({ suppressed: sql`${schema.discordPostLog.suppressed} + 1`, names })
        .where(eq(schema.discordPostLog.id, row.id));
      suppressed.push({ guildId, total: Number(row.suppressed ?? 0) + 1 });
    }

    return { allowed, suppressed };
  } catch {
    // A cooldown we cannot read must not silence an announcement. Failing the
    // other way turns one broken query into a bot that has gone quiet, which is
    // the harder failure to notice.
    return { allowed: guildIds, suppressed: [] };
  }
}

/**
 * The catch-up message for a window that swallowed events.
 *
 * Drained by the same cron that drains the post queue, so a server sees
 * "4 members linked a game account" once rather than four separate posts —
 * which is the outcome B1.3 actually asks for. Below `BATCH_FLOOR` there is
 * nothing worth saying.
 */
export function batchLine(kind: string, count: number, names: string[]): string | null {
  if (count < BATCH_FLOOR) return null;
  const noun = kind === "account_linked" ? "linked a game account"
    : kind === "challenge_joined" ? "joined a challenge"
    : kind === "quest_tier" ? "reached a new quest tier"
    : "were active";
  const listed = names.slice(0, 6).join(", ");
  const more = names.length > 6 ? `, and ${names.length - 6} more` : "";
  return `**${count}** more ${count === 1 ? "member" : "members"} ${noun}${listed ? `: ${listed}${more}` : ""}.`;
}
