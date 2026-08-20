// The six states, and the transitions between them.
//
//   draft → pending_payment → scheduled → announced → live → ended
//
// L1 — **nothing announces itself. Ever.** Announcement is always an admin
// click, and it is the only transition on this platform that a job may not
// make. That is not a preference: an announcement fans out to every server a
// brand paid to reach, and an accidental one cannot be recalled.
//
// L3 — **there can never be an announced challenge that is unpaid.** The
// guard is here rather than in the admin screen, because a screen is one of
// several ways to call a function.

import { and, eq, inArray, lt, lte, gt } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { isInvoicePaid } from "../money/invoices.ts";
import { isPeriodBoundary, periodEnd } from "./week.ts";
import { formatMoney } from "../money/amounts.ts";

export const STATES = [
  "draft",
  "pending_payment",
  "scheduled",
  "announced",
  "live",
  "ended",
] as const;
export type ChallengeState = (typeof STATES)[number];

/** What admin sees, per docs/03-CHALLENGES.md §1. Derived, never stored. */
export const STATE_LABEL: Record<ChallengeState, string> = {
  draft: "Draft — not yet eligible to announce. No bill.",
  pending_payment: "Bill issued — awaiting payment",
  scheduled: "Eligible to announce — needs setup",
  announced: "Announced",
  live: "Live",
  ended: "Closed",
};

export class TransitionRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionRefused";
  }
}

export async function createChallenge(
  db: DB,
  input: {
    title: string;
    game: string;
    provider: string;
    startAt: Date;
    cadence?: "weekly" | "daily";
    visibility?: "sponsored" | "community";
    sponsorBrandId?: string | null;
    guildId?: string | null;
    prizePoolCents?: number;
    places?: number;
    queue?: string;
    metrics?: Record<string, number> | null;
    rankMin?: number | null;
    rankMax?: number | null;
    accessKey?: string | null;
    seriesId?: string | null;
    seriesIndex?: number | null;
  },
): Promise<string> {
  const cadence = input.cadence ?? "weekly";
  // C2/L6, enforced in the model. An admin script, a seed fixture and a
  // brand's form all hit this same refusal — which is the entire reason it is
  // not merely "the UI has no date picker".
  if (!isPeriodBoundary(input.startAt, cadence)) {
    throw new TransitionRefused(
      `A ${cadence} challenge starts on a ${cadence === "weekly" ? "week" : "day"} ` +
        `boundary. ${input.startAt.toISOString()} is not one — there is no date ` +
        `picker anywhere on this platform, for anyone.`,
    );
  }

  const id = uid();
  await db.insert(schema.challenges).values({
    id,
    title: input.title,
    game: input.game,
    provider: input.provider,
    state: "draft",
    visibility: input.visibility ?? "sponsored",
    sponsorBrandId: input.sponsorBrandId ?? null,
    guildId: input.guildId ?? null,
    seriesId: input.seriesId ?? null,
    seriesIndex: input.seriesIndex ?? null,
    cadence,
    startAt: input.startAt,
    endAt: periodEnd(input.startAt, cadence),
    prizePoolCents: input.prizePoolCents ?? 0,
    places: input.places ?? 1,
    metrics: input.metrics ?? null,
    queue: input.queue ?? "solo",
    rankMin: input.rankMin ?? null,
    rankMax: input.rankMax ?? null,
    accessKey: input.accessKey ?? null,
  });
  return id;
}

/** L9/C3: attaching a bill is what moves a challenge out of `draft`. */
export async function attachInvoice(
  db: DB,
  challengeId: string,
  invoiceId: string,
): Promise<void> {
  await db
    .update(schema.challenges)
    .set({ invoiceId, state: "pending_payment" })
    .where(eq(schema.challenges.id, challengeId));
}

/**
 * The payment webhook's transition, and the only automatic one before the gun.
 *
 * A4 in docs/04-SURFACES.md: the webhook is the only thing that moves a
 * challenge to `scheduled`. It makes it *eligible* to announce (L2) and
 * nothing more.
 */
export async function markScheduled(db: DB, challengeId: string): Promise<void> {
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge) throw new TransitionRefused(`No such challenge: ${challengeId}`);
  if (!(await isInvoicePaid(db, challenge.invoiceId))) {
    throw new TransitionRefused(
      "A challenge is scheduled when its bill is paid, and that bill is not paid.",
    );
  }
  await db
    .update(schema.challenges)
    .set({ state: "scheduled" })
    .where(eq(schema.challenges.id, challengeId));
}

export type SetupProblem =
  | "no_invoice"
  | "unpaid"
  | "no_metrics"
  | "no_trophies"
  | "prize_pool_mismatch";

export type Readiness = {
  ready: boolean;
  problems: SetupProblem[];
  /** What the dashboard shows. A1: it must say exactly what is blocking this. */
  blocking: string[];
  trophyTotalCents: number;
  prizePoolCents: number;
};

/**
 * Everything standing between a challenge and its announcement.
 *
 * Returns all of them rather than the first. An admin fixing one thing at a
 * time, discovering the next each round, is the experience the challenges
 * dashboard exists to prevent — it is the most important page on the platform
 * precisely because it says what is blocking each challenge.
 */
export async function readinessOf(db: DB, challengeId: string): Promise<Readiness> {
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge) throw new TransitionRefused(`No such challenge: ${challengeId}`);

  const problems: SetupProblem[] = [];
  const blocking: string[] = [];

  if (!challenge.invoiceId) {
    problems.push("no_invoice");
    blocking.push("No bill exists. Every challenge has one — to a brand, a server, or the house.");
  } else if (!(await isInvoicePaid(db, challenge.invoiceId))) {
    problems.push("unpaid");
    blocking.push("The bill is not paid. Payment makes a challenge eligible to announce.");
  }

  if (!challenge.metrics || Object.keys(challenge.metrics).length === 0) {
    problems.push("no_metrics");
    blocking.push("Metrics are not set. Nothing would score.");
  }

  const trophies = await db
    .select()
    .from(schema.trophies)
    .where(and(eq(schema.trophies.challengeId, challengeId), eq(schema.trophies.type, "podium")));
  const trophyTotalCents = trophies.reduce((sum, t) => sum + t.valueCents, 0);

  if (challenge.prizePoolCents > 0 && trophies.length === 0) {
    problems.push("no_trophies");
    blocking.push("No podium trophies are assigned, and there is a prize pool to give away.");
  } else if (trophyTotalCents !== challenge.prizePoolCents) {
    // L5/T2 — flagged over AND under. Under is the one people forget, and it
    // is the one that quietly keeps a brand's money.
    problems.push("prize_pool_mismatch");
    blocking.push(
      `Trophy values total ${formatMoney(trophyTotalCents)} against a prize pool of ` +
        `${formatMoney(challenge.prizePoolCents)} — ` +
        `${trophyTotalCents > challenge.prizePoolCents ? "over" : "under"} by ` +
        `${formatMoney(Math.abs(trophyTotalCents - challenge.prizePoolCents))}.`,
    );
  }

  return {
    ready: problems.length === 0,
    problems,
    blocking,
    trophyTotalCents,
    prizePoolCents: challenge.prizePoolCents,
  };
}

/**
 * Announce. **An admin action, and only ever an admin action.**
 *
 * `actorId` is required, like `releasePayout` — the rule that nothing
 * announces itself is expressed as a signature a job cannot satisfy rather
 * than a comment asking it not to.
 */
export async function announce(
  db: DB,
  challengeId: string,
  actorId: string,
  guildIds: string[],
): Promise<{ announcedTo: number }> {
  if (!actorId) {
    throw new TransitionRefused(
      "Nothing announces itself. An announcement is always an admin click.",
    );
  }
  const { withTx } = await import("../db/tx.ts");
  return withTx(db, async (tx) => {
    const [challenge] = await tx
      .select()
      .from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId));
    if (!challenge) throw new TransitionRefused(`No such challenge: ${challengeId}`);
    if (challenge.state !== "scheduled" && challenge.state !== "announced") {
      throw new TransitionRefused(
        `A ${challenge.state} challenge cannot be announced. It must be paid and scheduled first.`,
      );
    }

    const readiness = await readinessOf(tx, challengeId);
    if (!readiness.ready) {
      throw new TransitionRefused(
        `That challenge is not ready to announce:\n- ${readiness.blocking.join("\n- ")}`,
      );
    }

    const guilds = guildIds.length
      ? await tx.select().from(schema.guilds)
      : [];
    const wanted = new Set(guildIds);

    for (const guild of guilds.filter((g) => wanted.has(g.guildId))) {
      await tx
        .insert(schema.challengeAnnouncements)
        .values({
          id: uid(),
          challengeId,
          guildId: guild.guildId,
          memberCountAt: guild.memberCount,
        })
        .onConflictDoNothing();
    }

    await tx
      .update(schema.challenges)
      .set({ state: "announced", announcedAt: challenge.announcedAt ?? new Date() })
      .where(eq(schema.challenges.id, challengeId));

    await tx.insert(schema.auditLog).values({
      id: uid(),
      actorId,
      action: "challenge.announce",
      refType: "challenge",
      refId: challengeId,
      detail: { guildIds },
    });

    return { announcedTo: guildIds.length };
  });
}

/**
 * The gun: move every announced challenge whose start has passed to `live`.
 *
 * This one IS automatic, and that is consistent rather than an exception —
 * it makes no decision. The decision was the announcement; the clock does the
 * rest, and the clock cannot be persuaded.
 */
export async function fireTheGun(db: DB, now = new Date()): Promise<string[]> {
  const due = await db
    .select()
    .from(schema.challenges)
    .where(and(eq(schema.challenges.state, "announced"), lte(schema.challenges.startAt, now)));
  for (const c of due) {
    await db.update(schema.challenges).set({ state: "live" }).where(eq(schema.challenges.id, c.id));
  }
  return due.map((c) => c.id);
}

/**
 * Every challenge whose window has closed and which has not been settled.
 *
 * `announced` as well as `live`, deliberately. A challenge whose whole window
 * passed without the gun job running is still over, and leaving it un-closed
 * because a cron missed a beat would strand its entrants without placements or
 * trophies. The close does not care how it got here.
 */
export async function challengesToClose(db: DB, now = new Date()) {
  return db
    .select()
    .from(schema.challenges)
    .where(
      and(
        inArray(schema.challenges.state, ["live", "announced"]),
        lt(schema.challenges.endAt, now),
      ),
    );
}

