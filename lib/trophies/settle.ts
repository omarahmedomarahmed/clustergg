// Settling a closed challenge: podium trophies, the $0 participation trophy,
// milestones, and the sweep.
//
// This runs after `closeChallenges` has written placements. It is separate
// because it moves money — the prize vault's liability side goes up by exactly
// the podium values — and the close does not.

import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { awardTrophy, createTrophy, sweepEligibleAt } from "./trophies.ts";
import { awardEarnedMilestones } from "./milestones.ts";
import { formatMoney, TROPHY_HOLD_YEARS } from "../money/amounts.ts";

/**
 * Award everything a closed challenge owes.
 *
 * Idempotent throughout: `awardTrophy` is a no-op on a holding that exists, so
 * re-running a settle — which somebody will, while working out why the first
 * run looked wrong — cannot double an award.
 */
export async function settleChallenge(
  db: DB,
  challengeId: string,
  opts: { actorId?: string | null; at?: Date } = {},
): Promise<{ podium: number; participation: number; milestones: number }> {
  const at = opts.at ?? new Date();
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge) throw new Error(`No such challenge: ${challengeId}`);

  const participants = await db
    .select()
    .from(schema.challengeParticipants)
    .where(eq(schema.challengeParticipants.challengeId, challengeId));

  const podiumTrophies = await db
    .select()
    .from(schema.trophies)
    .where(
      and(eq(schema.trophies.challengeId, challengeId), eq(schema.trophies.type, "podium")),
    );
  const byPlace = new Map(podiumTrophies.map((t) => [t.place ?? 0, t]));

  let podium = 0;
  let participation = 0;

  // The $0 participation trophy is created once per challenge and held by
  // everybody who did not place. T3 — it shows once on /trophies with a holder
  // count, never one row per gamer, and that is a property of having one
  // definition rather than of how the page renders.
  let participationTrophyId: string | null = null;
  const participationTrophy = await db
    .select()
    .from(schema.trophies)
    .where(
      and(
        eq(schema.trophies.challengeId, challengeId),
        eq(schema.trophies.type, "participation"),
      ),
    );
  participationTrophyId = participationTrophy[0]?.id ?? null;

  for (const p of participants) {
    const trophy = p.placement !== null ? byPlace.get(p.placement) : undefined;
    if (trophy) {
      const result = await awardTrophy(db, {
        trophyId: trophy.id,
        userId: p.userId,
        actorId: opts.actorId,
        at,
      });
      if (result.awarded) podium++;
      continue;
    }

    // Everyone who did not place gets the branded collectable. It is the
    // brand's product as much as the podium is — a gamer who turned up walks
    // away holding their name.
    if (!participationTrophyId) {
      participationTrophyId = await createTrophy(db, {
        type: "participation",
        name: `${challenge.title} — entrant`,
        valueCents: 0,
        brandId: challenge.sponsorBrandId,
        challengeId,
      });
    }
    const result = await awardTrophy(db, {
      trophyId: participationTrophyId,
      userId: p.userId,
      actorId: opts.actorId,
      at,
    });
    if (result.awarded) participation++;
  }

  let milestones = 0;
  for (const p of participants) {
    milestones += (await awardEarnedMilestones(db, p.userId, at)).length;
  }

  return { podium, participation, milestones };
}

/**
 * Sweep money the vault holds that no live account can ever claim.
 *
 * Two reasons, both from docs/02-MONEY.md §5:
 *
 *   * **Orphaned** (V14–V16) — the holder deleted their account. The money was
 *     real and was paid by a brand, so it stays in the vault; sweeping it to
 *     Cluster is what makes the balance equal live redeemable liability again.
 *   * **Expired** (V9–V12) — five years have passed. A 13-year-old who wins
 *     must still have theirs at 18, which is where five comes from.
 *
 * V12 — **reversible.** `sweptAt` is a nullable timestamp rather than a
 * deletion precisely so a holder who comes back can be reinstated and
 * re-funded. A swept trophy is still theirs; the money has simply been parked.
 */
export async function sweep(
  db: DB,
  opts: { actorId: string; reason: "orphaned" | "expired"; at?: Date },
): Promise<{ swept: number; amountCents: number }> {
  if (!opts.actorId) {
    throw new Error("A sweep is an admin action and is logged with who did it.");
  }
  const at = opts.at ?? new Date();
  const { withTx } = await import("../db/tx.ts");
  const { post } = await import("../money/ledger.ts");

  return withTx(db, async (tx) => {
    const cutoff = new Date(at);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - TROPHY_HOLD_YEARS);

    const candidates = await tx
      .select({ holding: schema.userTrophies, trophy: schema.trophies, user: schema.users })
      .from(schema.userTrophies)
      .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
      .leftJoin(schema.users, eq(schema.userTrophies.userId, schema.users.id))
      .where(
        and(
          isNull(schema.userTrophies.redeemedAt),
          isNull(schema.userTrophies.sweptAt),
          sql`${schema.trophies.valueCents} > 0`,
          opts.reason === "orphaned"
            ? sql`(${schema.users.id} is null or ${schema.users.status} <> 'active')`
            : lte(schema.userTrophies.awardedAt, cutoff),
        ),
      );

    let amountCents = 0;
    for (const c of candidates) {
      await tx
        .update(schema.userTrophies)
        .set({ sweptAt: at, sweptReason: opts.reason })
        .where(eq(schema.userTrophies.id, c.holding.id));

      amountCents += c.trophy.valueCents;

      await tx.insert(schema.auditLog).values({
        id: uid(),
        actorId: opts.actorId,
        action: `trophy.sweep.${opts.reason}`,
        refType: "user_trophy",
        refId: c.holding.id,
        // V11 — logged with date, holder, value and reason. All four, because
        // the log is the audit trail an unclaimed-property review would ask
        // for, and three of the four is not one.
        detail: {
          holder: c.holding.userId,
          valueCents: c.trophy.valueCents,
          awardedAt: c.holding.awardedAt.toISOString(),
          reason: opts.reason,
          reversible: true,
        },
      });
    }

    if (amountCents > 0) {
      await post(
        db,
        [
          {
            vault: "prize",
            amount: -amountCents,
            kind: "sweep",
            refType: "sweep",
            refId: at.toISOString(),
            reason: `${formatMoney(amountCents)} swept to Cluster (${opts.reason})`,
            actorId: opts.actorId,
          },
          {
            vault: "cluster",
            amount: amountCents,
            kind: "sweep",
            refType: "sweep",
            refId: at.toISOString(),
            reason: `${formatMoney(amountCents)} swept from the prize vault (${opts.reason})`,
            actorId: opts.actorId,
          },
        ],
        { tx },
      );
    }

    return { swept: candidates.length, amountCents };
  });
}

/** V12 — put a swept trophy back, and re-fund it. */
export async function reverseSweep(
  db: DB,
  userTrophyId: string,
  actorId: string,
): Promise<void> {
  if (!actorId) throw new Error("Reversing a sweep is an admin action.");
  const { withTx } = await import("../db/tx.ts");
  const { post } = await import("../money/ledger.ts");

  await withTx(db, async (tx) => {
    const [row] = await tx
      .select({ holding: schema.userTrophies, trophy: schema.trophies })
      .from(schema.userTrophies)
      .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
      .where(eq(schema.userTrophies.id, userTrophyId));
    if (!row) throw new Error(`No such holding: ${userTrophyId}`);
    if (!row.holding.sweptAt) throw new Error("That trophy was never swept.");

    await tx
      .update(schema.userTrophies)
      .set({ sweptAt: null, sweptReason: null })
      .where(eq(schema.userTrophies.id, userTrophyId));

    await post(
      db,
      [
        {
          vault: "cluster",
          amount: -row.trophy.valueCents,
          kind: "sweep",
          refType: "user_trophy",
          refId: userTrophyId,
          reason: `Sweep reversed — holder returned`,
          actorId,
        },
        {
          vault: "prize",
          amount: row.trophy.valueCents,
          kind: "sweep",
          refType: "user_trophy",
          refId: userTrophyId,
          reason: `Sweep reversed — ${formatMoney(row.trophy.valueCents)} re-funded`,
          actorId,
        },
      ],
      { tx },
    );
  });
}

/** Holdings that will become sweepable, for the admin console. */
export async function sweepDueAt(db: DB, userTrophyId: string): Promise<Date | null> {
  const [row] = await db
    .select()
    .from(schema.userTrophies)
    .where(eq(schema.userTrophies.id, userTrophyId));
  return row ? sweepEligibleAt(row.awardedAt) : null;
}
