// The series builder, and the one piece of arithmetic that only runs one way.
//
// ===== `bill = prize ÷ 0.5`, AND NEVER THE REVERSE =====
//
// 05 §2 and 03 §7 both say it, in the same words: *"admin enters the **prize**;
// the system computes the **bill** as `prize ÷ 0.5`. Never the reverse, or the
// split drifts."*
//
// Why it drifts. `splitOf` rounds — the prize and server halves to the nearest
// cent, with Cluster taking the remainder, so every cent is accounted for. Run
// that forwards from a bill and you get a prize. Run it backwards from a prize
// and you get *a* bill, and `splitOf(thatBill).prize` is not always the prize
// you started from. Which of the two is authoritative decides who absorbs the
// cent, and 02 §5's invariant says it must be the prize: **vault 2's balance
// equals the sum of every unredeemed money-trophy**, so a prize allocation a
// cent short of the trophies is the platform's core promise broken.
//
// So the prize is the input, the bill is derived, and `billForPrize` rounds
// **up** — the buyer pays the extra cent rather than the prize vault absorbing
// it. A brand overpaying by a cent is nothing; a prize vault a cent light is
// the one thing this platform cannot be.
//
// ===== A SERIES IS BILLED TOGETHER AND ANNOUNCED ONE AT A TIME =====
//
// L10/C9. Each instance is a challenge in its own right with its own state,
// and the whole series shifts if the brand pays late (03 §7) — never a partial
// start, because half a series is a competition nobody agreed to buy.

import { DEFAULT_SPLIT_BPS, BPS, type SplitBps } from "../money/amounts.ts";
import { weekStartPlus, periodEnd } from "./week.ts";
import type { DB } from "../db/index.ts";

export type Cadence = "weekly" | "daily";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What a challenge must be billed for a given prize pool.
 *
 * Rounds **up**, deliberately. See the header: the prize is authoritative
 * because the prize vault is a liability ledger, so the spare cent belongs on
 * the invoice rather than in the money backing somebody's trophy.
 */
export function billForPrize(prizeCents: number, bps: SplitBps = DEFAULT_SPLIT_BPS): number {
  if (prizeCents < 0) throw new SeriesRefused("A prize pool cannot be negative.");
  if (bps.prize <= 0) throw new SeriesRefused("The prize share cannot be zero.");
  return Math.ceil((prizeCents * BPS) / bps.prize);
}

export class SeriesRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeriesRefused";
  }
}

export type SeriesPlan = {
  cadence: Cadence;
  instances: number;
  /** The prize pool of **one** instance. */
  prizePerInstanceCents: number;
  /** Every instance's prize, added up. This is what the trophies must equal. */
  seriesPrizeCents: number;
  /** `seriesPrize ÷ 0.5`, rounded up. What the buyer is invoiced. */
  billCents: number;
  /** When each instance runs. Always a period boundary — C5/L6, no date picker. */
  starts: { startAt: Date; endAt: Date }[];
};

/**
 * Plan a series from the prize, the cadence and the count.
 *
 * Nothing is written. The builder shows this to admin **before** anything
 * exists, because 03 §7 step 3 is *"System: series prize = …, bill = …"* and a
 * number somebody sees after they have committed is a number they cannot
 * refuse.
 */
export function planSeries(input: {
  cadence: Cadence;
  instances: number;
  prizePerInstanceCents: number;
  /** The first instance's start. Must already be a period boundary. */
  startAt: Date;
  bps?: SplitBps;
}): SeriesPlan {
  if (!Number.isInteger(input.instances) || input.instances < 1) {
    throw new SeriesRefused("A series runs at least one instance.");
  }
  if (input.prizePerInstanceCents <= 0) {
    throw new SeriesRefused(
      "Every instance needs a prize pool. A challenge with nothing at stake is " +
        "not a competition, and its trophies would have nothing behind them.",
    );
  }

  const starts: { startAt: Date; endAt: Date }[] = [];
  for (let i = 0; i < input.instances; i++) {
    // C5/L6 — the start is always a period boundary, enforced here rather than
    // in the form. A date picker is the thing this platform does not have, for
    // anyone, including us.
    const startAt =
      input.cadence === "weekly"
        ? weekStartPlus(input.startAt, i)
        : new Date(input.startAt.getTime() + i * DAY_MS);
    starts.push({ startAt, endAt: periodEnd(startAt, input.cadence) });
  }

  const seriesPrizeCents = input.prizePerInstanceCents * input.instances;
  return {
    cadence: input.cadence,
    instances: input.instances,
    prizePerInstanceCents: input.prizePerInstanceCents,
    seriesPrizeCents,
    billCents: billForPrize(seriesPrizeCents, input.bps),
    starts,
  };
}

/**
 * What the trophies for one instance must add up to.
 *
 * T2/T3 — *"the sum of a challenge's podium trophy values must equal its prize
 * pool. Flag if over **and** under."* Exposed so the template editor can show
 * the shortfall while somebody is typing, from the same number the assignment
 * guard will use. Two implementations of "what is left" is how a builder tells
 * you it balances and the guard then refuses it.
 */
export function templateTotalCents(templates: { valueCents: number }[]): number {
  return templates.reduce((sum, t) => sum + t.valueCents, 0);
}

export type TemplateCheck = {
  totalCents: number;
  prizeCents: number;
  ok: boolean;
  /** Positive when the templates are worth more than the pool. */
  differenceCents: number;
  reason: string | null;
};

export function checkTemplates(
  templates: { valueCents: number }[],
  prizePerInstanceCents: number,
): TemplateCheck {
  const totalCents = templateTotalCents(templates);
  const differenceCents = totalCents - prizePerInstanceCents;
  return {
    totalCents,
    prizeCents: prizePerInstanceCents,
    ok: differenceCents === 0,
    differenceCents,
    reason:
      differenceCents === 0
        ? null
        : differenceCents > 0
          ? `The trophies are worth more than the prize pool. Over-allocation is the one vault state that must be impossible, so this is refused rather than flagged.`
          : `The trophies are worth less than the prize pool. Money a brand paid would sit against a challenge with nobody to give it to.`,
  };
}

/**
 * Create a series: the instances, one invoice for all of them, and the
 * trophies from the templates.
 *
 * Order matters and it is 03 §7's. The challenges exist **first** (T5/T4 — the
 * challenge is created first, trophies are assigned to it after payment
 * clears), one invoice covers the lot (C9/B9 — a series is billed together),
 * and the templates instantiate once per instance.
 */
export async function createSeries(
  db: DB,
  input: {
    title: string;
    game: string;
    provider: string;
    plan: SeriesPlan;
    sponsorBrandId?: string | null;
    guildId?: string | null;
    metrics?: Record<string, number>;
    places: number;
    actorId: string;
  },
): Promise<{ seriesId: string; challengeIds: string[]; invoiceId: string }> {
  const { uid } = await import("../core/utils.ts");
  const { createChallenge, attachInvoice } = await import("./lifecycle.ts");
  const { createInvoice } = await import("../money/invoices.ts");

  if (!input.actorId) {
    // 03 §7's builder is admin-only, and a series with no actor is a series
    // nobody can be asked about.
    throw new SeriesRefused("A series is built by a person, and the log records which.");
  }

  const seriesId = uid();
  const challengeIds: string[] = [];

  for (const [index, when] of input.plan.starts.entries()) {
    challengeIds.push(
      await createChallenge(db, {
        title:
          input.plan.instances === 1
            ? input.title
            : `${input.title} — ${input.plan.cadence === "daily" ? "day" : "week"} ${index + 1}`,
        game: input.game,
        provider: input.provider,
        startAt: when.startAt,
        cadence: input.plan.cadence,
        sponsorBrandId: input.sponsorBrandId ?? null,
        guildId: input.guildId ?? null,
        prizePoolCents: input.plan.prizePerInstanceCents,
        places: input.places,
        metrics: input.metrics,
        seriesId,
        seriesIndex: index,
      }),
    );
  }

  // B9/C9 — **one** invoice. Billing each instance separately would let a
  // brand pay for week one and not week four, and 03 §7 is explicit that a
  // series shifts whole or not at all.
  const invoiceId = await createInvoice(db, {
    payerType: input.sponsorBrandId ? "brand" : "guild",
    payerId: input.sponsorBrandId ?? input.guildId ?? null,
    lines: [
      {
        description:
          `${input.title} — ${input.plan.instances} ${input.plan.cadence === "daily" ? "day" : "week"}` +
          `${input.plan.instances === 1 ? "" : "s"}`,
        amountCents: input.plan.billCents,
      },
    ],
  });
  for (const challengeId of challengeIds) await attachInvoice(db, challengeId, invoiceId);

  return { seriesId, challengeIds, invoiceId };
}

/** Every instance of a series, in order. */
export async function seriesInstances(db: DB, seriesId: string) {
  const { schema } = await import("../db/index.ts");
  const { eq, asc } = await import("drizzle-orm");
  return db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.seriesId, seriesId))
    .orderBy(asc(schema.challenges.seriesIndex));
}
