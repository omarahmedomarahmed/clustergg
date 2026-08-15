// Trophies: definitions, the prize-pool guard, templates, and awarding.
//
// ===== THE ONE RULE THAT MAKES THIS SAFE =====
//
// A money-trophy is not a record that says somebody won something. It is a
// **claim on the prize vault**, and the vault's balance is defined as the sum
// of every unredeemed one. So awarding is not an insert — it is a movement
// against a ledger, checked inside a transaction, and that is what makes a
// duplicate award impossible rather than merely unlikely (V1).
//
// T1/V5 — a value can never be edited. A $100 trophy is a $100 trophy forever.
// Editing one would silently change a liability that is already backed by real
// money, and the gamer holding it was told a number.
//
// T8/V6 — name, image and brand ARE editable, and an edit propagates to every
// holder everywhere, because holders point at the definition rather than
// copying it.

import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { formatMoney, TROPHY_HOLD_YEARS } from "../money/amounts.ts";
import { assertHeadroom } from "../money/prize-vault.ts";

export const TROPHY_TYPES = ["podium", "participation", "milestone"] as const;
export type TrophyType = (typeof TROPHY_TYPES)[number];

export class TrophyRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrophyRefused";
  }
}

export async function createTrophy(
  db: DB,
  input: {
    type: TrophyType;
    name: string;
    valueCents?: number;
    imageUrl?: string | null;
    brandId?: string | null;
    challengeId?: string | null;
    place?: number | null;
    milestoneKind?: string | null;
    milestoneGame?: string | null;
  },
): Promise<string> {
  const valueCents = input.valueCents ?? 0;
  if (!Number.isInteger(valueCents) || valueCents < 0) {
    throw new TrophyRefused("A trophy's value is a whole, non-negative number of cents.");
  }
  // V8/T-table: participation and milestone trophies are collectables. A
  // non-zero value on one would put money into the vault against a trophy the
  // redeem action refuses, and the invariant could never be green again.
  if (input.type !== "podium" && valueCents !== 0) {
    throw new TrophyRefused(
      `A ${input.type} trophy is a collectable and is always $0. ` +
        `Only a podium trophy carries prize money.`,
    );
  }
  const id = uid();
  await db.insert(schema.trophies).values({
    id,
    type: input.type,
    name: input.name,
    valueCents,
    imageUrl: input.imageUrl ?? null,
    brandId: input.brandId ?? null,
    challengeId: input.challengeId ?? null,
    place: input.place ?? null,
    milestoneKind: input.milestoneKind ?? null,
    milestoneGame: input.milestoneGame ?? null,
  });
  return id;
}

/**
 * Edit a trophy. Name, image and brand only.
 *
 * The signature is the enforcement: there is no `valueCents` parameter, so a
 * caller cannot pass one by accident and no runtime check has to catch it.
 */
export async function editTrophy(
  db: DB,
  trophyId: string,
  edits: { name?: string; imageUrl?: string | null; brandId?: string | null },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (edits.name !== undefined) set.name = edits.name;
  if (edits.imageUrl !== undefined) set.imageUrl = edits.imageUrl;
  if (edits.brandId !== undefined) set.brandId = edits.brandId;
  if (Object.keys(set).length === 0) return;
  await db.update(schema.trophies).set(set).where(eq(schema.trophies.id, trophyId));
}

export type PoolGuard = {
  ok: boolean;
  totalCents: number;
  prizePoolCents: number;
  differenceCents: number;
  /** `over` | `under` | `exact`. Both directions flag — T2. */
  direction: "over" | "under" | "exact";
  message: string;
};

/**
 * The prize-pool guard. **Flags over AND under.**
 *
 * Over is the obvious one: promising more than the brand paid for. Under is
 * the one people forget, and it is worse in a quiet way — it means we are
 * holding money a brand paid to give away, the vault never goes green, and
 * nobody notices because nothing is broken from the outside.
 */
export async function checkPrizePool(db: DB, challengeId: string): Promise<PoolGuard> {
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge) throw new TrophyRefused(`No such challenge: ${challengeId}`);

  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.trophies.valueCents}), 0)::int` })
    .from(schema.trophies)
    .where(
      and(eq(schema.trophies.challengeId, challengeId), eq(schema.trophies.type, "podium")),
    );
  const totalCents = row?.total ?? 0;
  const differenceCents = totalCents - challenge.prizePoolCents;
  const direction = differenceCents === 0 ? "exact" : differenceCents > 0 ? "over" : "under";

  return {
    ok: differenceCents === 0,
    totalCents,
    prizePoolCents: challenge.prizePoolCents,
    differenceCents,
    direction,
    message:
      direction === "exact"
        ? `Trophy values total ${formatMoney(totalCents)}, exactly the prize pool.`
        : `Trophy values total ${formatMoney(totalCents)} against a prize pool of ` +
          `${formatMoney(challenge.prizePoolCents)} — ${direction} by ` +
          `${formatMoney(Math.abs(differenceCents))}.`,
  };
}

/**
 * Award a trophy to a gamer.
 *
 * For a money-trophy this is a movement against the prize vault, taken inside
 * one transaction after the headroom check, so two concurrent awards cannot
 * both read the same room and both take it. A $0 collectable writes no ledger
 * row at all — V8, it touches the vault not at all.
 */
export async function awardTrophy(
  db: DB,
  input: { trophyId: string; userId: string; actorId?: string | null; at?: Date },
): Promise<{ awarded: boolean }> {
  const { withTx } = await import("../db/tx.ts");
  const { post } = await import("../money/ledger.ts");

  return withTx(db, async (tx) => {
    const [trophy] = await tx
      .select()
      .from(schema.trophies)
      .where(eq(schema.trophies.id, input.trophyId));
    if (!trophy) throw new TrophyRefused(`No such trophy: ${input.trophyId}`);

    // T4 — unique on (trophy, holder). A duplicate award is refused by the
    // index; this read makes the refusal a quiet no-op rather than a crash,
    // because re-running a close must be safe.
    const [existing] = await tx
      .select()
      .from(schema.userTrophies)
      .where(
        and(
          eq(schema.userTrophies.trophyId, input.trophyId),
          eq(schema.userTrophies.userId, input.userId),
        ),
      );
    if (existing) return { awarded: false };

    if (trophy.valueCents > 0) {
      // The vault must already hold the money. It does, if the invoice was
      // paid — this check is what turns "should" into "cannot be otherwise".
      await assertHeadroom(tx, trophy.valueCents);
    }

    await tx.insert(schema.userTrophies).values({
      id: uid(),
      trophyId: input.trophyId,
      userId: input.userId,
      awardedAt: input.at ?? new Date(),
    });

    if (trophy.valueCents > 0) {
      // The vault balance does not change — the money was already in it. What
      // changes is that it is now *accounted for*: the liability side of the
      // invariant just went up by exactly this much, and the ledger row is the
      // record of which gamer it belongs to.
      await post(
        db,
        [
          {
            vault: "prize",
            amount: 0,
            kind: "trophy_award",
            refType: "trophy",
            refId: input.trophyId,
            reason:
              `${formatMoney(trophy.valueCents)} trophy "${trophy.name}" awarded ` +
              `to ${input.userId}`,
            actorId: input.actorId ?? null,
          },
        ],
        { tx },
      );
    }

    return { awarded: true };
  });
}

/**
 * Trophy templates: define once per place, instantiate per challenge.
 *
 * docs/03-CHALLENGES.md §6: without this, a 7-day daily series needs 21
 * hand-made trophies, and hand-making 21 of anything is how one of them ends
 * up with the wrong value and the pool guard fails on a Sunday night.
 */
export type TrophyTemplate = {
  place: number;
  name: string;
  valueCents: number;
  imageUrl?: string | null;
  brandId?: string | null;
};

export async function instantiateTemplates(
  db: DB,
  challengeIds: string[],
  templates: TrophyTemplate[],
): Promise<string[]> {
  const created: string[] = [];
  for (const challengeId of challengeIds) {
    for (const t of templates) {
      created.push(
        await createTrophy(db, {
          type: "podium",
          name: t.name,
          valueCents: t.valueCents,
          imageUrl: t.imageUrl ?? null,
          brandId: t.brandId ?? null,
          challengeId,
          place: t.place,
        }),
      );
    }
  }
  return created;
}

/** T3 — the participation trophy shows once with a holder count, not one row per gamer. */
export async function holderCountOf(db: DB, trophyId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.userTrophies)
    .where(and(eq(schema.userTrophies.trophyId, trophyId), isNull(schema.userTrophies.sweptAt)));
  return row?.n ?? 0;
}

/** When a trophy awarded at `at` may be swept. V9 — five years. */
export function sweepEligibleAt(awardedAt: Date): Date {
  const d = new Date(awardedAt);
  d.setUTCFullYear(d.getUTCFullYear() + TROPHY_HOLD_YEARS);
  return d;
}
