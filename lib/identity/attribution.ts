// Who a gamer earns for.
//
// ===== ONE MODULE, READ BY EVERY KPI, THE POOL AND THE REGISTRY =====
//
// docs/01-CYCLE.md's table of "computed once, read by" names this module by
// name: *"Who a gamer earns for — the attribution module — read by every KPI,
// the pool, the registry. ½ parent + ½ join, 1.0 when they are the same."*
//
// docs/12-IDENTITY.md §3 is the ruling; docs/02-MONEY.md §4 is the money that
// depends on it, and **neither document is correct without the other.**
//
// ===== TWO SERVERS CAN EARN FROM ONE GAMER. NEVER MORE. =====
//
//   Parent server — where they first pressed **any** bot button. Permanent.
//   Join server   — where they pressed **Join** on that particular challenge.
//
// The parent rewards *acquisition* — getting somebody onto Cluster at all. The
// join server rewards *conversion* — getting them into this challenge. Capping
// at two is what makes concentrating gamers in fewer servers better for an
// abuser than spreading them, so the incentive already points where we want it
// and needs no policing (12 §3, "why this shape").
//
// K5 — shares can never sum past the true entrant count. That is a property of
// the four outcomes below, not a check applied afterwards: every branch returns
// shares summing to exactly 1.0 or to exactly 0.

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";

/**
 * One entry's attribution, as it was **frozen onto that entry**.
 *
 * Deliberately not `{ userId }` plus a database read. A1b: an admin correcting
 * a gamer's parent in week 6 must not move week 3's money, and the only way to
 * guarantee that is for the scoring path to be structurally unable to reach
 * the live value. It takes the two frozen ids and nothing else.
 */
export type EntryAttribution = {
  /** `challenge_participants.parentGuildIdAtBaseline` — never `users.parentGuildId`. */
  parentGuildId: string | null;
  /** `challenge_participants.joinGuildId`. Null for a web join. */
  joinGuildId: string | null;
};

/** A guild id and the fraction of one entrant it earns. */
export type EntrantCredit = { guildId: string; share: number };

/**
 * The four outcomes. **This function is the whole rule.**
 *
 * | Case | Credit | Rule |
 * |---|---|---|
 * | Parent ≠ join | ½ parent + ½ join | A4 |
 * | Parent = join | **1.0 to that one server, not two halves** | A5 |
 * | Web join, no server context | **1.0 to the parent** | A6 |
 * | No parent at all | **nothing — no server earns** | A7 |
 *
 * A5 is the one that looks like an optimisation and is not. Returning two
 * halves for the same guild and summing them later gives the same total for
 * *this* gamer and a different answer everywhere a count of distinct crediting
 * servers is taken — and it makes the "at most two servers" cap read as three
 * rows for one gamer in any debugging output anybody ever looks at.
 *
 * A7 is the one that looks wrong and is not. A gamer with no parent who joined
 * from a server's card is an anomaly — pressing any bot button *is* what
 * stamps a parent — so the state is only reachable if the stamp was cleared or
 * never happened. The ruling is that nobody earns, and crediting the join
 * server 1.0 instead would make clearing a parent a way to move money.
 */
export function entrantCredit(entry: EntryAttribution): EntrantCredit[] {
  const { parentGuildId: parent, joinGuildId: join } = entry;

  // A7 — no parent, no earnings. Checked first and independently of `join`,
  // because "they joined from somewhere" is exactly the reason somebody would
  // reach for a fallback here, and the fallback is the rule this forbids.
  if (!parent) return [];

  // A6 — a web join has no server context. The parent takes the whole entrant,
  // not half of one with the other half going nowhere: nobody else did
  // anything for this entry.
  if (!join) return [{ guildId: parent, share: 1 }];

  // A5 — one server did both jobs, so it earns one entrant.
  if (parent === join) return [{ guildId: parent, share: 1 }];

  // A4 — the ordinary case.
  return [
    { guildId: parent, share: 0.5 },
    { guildId: join, share: 0.5 },
  ];
}

/**
 * A gamer can **never** change their own parent (A8). Cluster admin can, and
 * it is logged.
 *
 * ===== WHY THE ACTOR IS A REQUIRED ARGUMENT AND NOT A CONTEXT LOOKUP =====
 *
 * The parent decides money. A function that resolves "who is asking" from
 * ambient state is a function whose authority depends on where it was called
 * from, and there is exactly one call site today and there will be more. Both
 * ids are arguments so that the check reads at the call site.
 */
export class ParentChangeRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParentChangeRefused";
  }
}

export async function setParentGuild(
  db: DB,
  input: {
    userId: string;
    guildId: string | null;
    /** The admin doing it. Never the gamer, and never null. */
    actorId: string;
    reason?: string;
  },
  now = new Date(),
): Promise<void> {
  // A8, both halves. A gamer setting their own is the case this exists to
  // refuse, and an unattributed change is one nobody can answer a question
  // about later.
  if (!input.actorId) {
    throw new ParentChangeRefused(
      "A parent server is changed by Cluster admin, and the change is logged " +
        "against the person who made it.",
    );
  }
  if (input.actorId === input.userId) {
    throw new ParentChangeRefused(
      "A gamer can never change their own parent server. Contact support if " +
        "it is wrong.",
    );
  }

  const [before] = await db
    .select({ parentGuildId: schema.users.parentGuildId })
    .from(schema.users)
    .where(eq(schema.users.id, input.userId));

  await db
    .update(schema.users)
    .set({
      parentGuildId: input.guildId,
      // Stamped with the parent or not at all, the same rule the first click
      // uses. A `parentStampedAt` without a parent is a date describing
      // nothing.
      parentStampedAt: input.guildId ? now : null,
    })
    .where(eq(schema.users.id, input.userId));

  // ===== WHAT THIS UPDATE DELIBERATELY DOES NOT TOUCH =====
  //
  // A1b — **a closed week never moves.** Every entry already carries the
  // parent frozen beside its baseline, and nothing here reaches for
  // `challenge_participants`. That is the whole mechanism: not a rule about
  // which weeks may be rewritten, but a scoring path that cannot see the live
  // value at all (P6).
  await db.insert(schema.auditLog).values({
    id: uid(),
    actorId: input.actorId,
    action: "user.parent_guild.set",
    refType: "user",
    refId: input.userId,
    detail: {
      from: before?.parentGuildId ?? null,
      to: input.guildId,
      reason: input.reason ?? null,
    },
    at: now,
  });
}

/**
 * Which guild's credit is frozen onto an entry, and when.
 *
 * A1a — **the parent is frozen onto the entry the same moment the baseline
 * is**: at the gun for an early joiner, at Join for a mid-week joiner.
 * `max(challengeStart, joinedAt)`, one rule for both.
 *
 * This helper exists so the two call sites — `enterChallenge` and
 * `stampBaselinesAtGun` — cannot drift into stamping the parent at a different
 * instant from the baseline. They are the same event and they read the same
 * function.
 */
export async function parentGuildToFreeze(
  db: DB,
  userId: string,
): Promise<string | null> {
  const [user] = await db
    .select({ parentGuildId: schema.users.parentGuildId })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user?.parentGuildId ?? null;
}
