// The brand portal: signup, the three-step builder, and reporting.
//
// B1 — fully self-serve from signup. They create their own portal and we email
// the key.
// B4 — they see start date, announce date and price **before** paying.
// B5 — self-serve is weekly only. No daily, no custom prize pool, no date
//      picker. What they choose is a *week*.
// B6 — unlimited challenges per week, any number of games. There is no
//      capacity cap, and the old platform's per-game ceiling was deleted by
//      ruling — it is not a number to re-derive, it does not exist.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid, slugify } from "../core/utils.ts";
import { earliestSellableWeek, weekStartPlus, isPeriodBoundary } from "../challenges/week.ts";
import { createChallenge, attachInvoice, markScheduled } from "../challenges/lifecycle.ts";
import { createInvoice, markPaid, invoiceView } from "../money/invoices.ts";
import { CHALLENGE_PRICE_CENTS, splitOf, MIN_AUDIENCE_GROUP, formatMoney } from "../money/amounts.ts";
import { getProvider, isProviderLive, linkableGames } from "../providers/registry.ts";

export class BuilderRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuilderRefused";
  }
}

/**
 * Sign a brand up, and issue the **one-time invite** (B1).
 *
 * The key no longer lives on the brand — it lives on a `brand_users` row and
 * is exchanged, once, for an email and a password. That is the whole of the
 * change: the company is a company, and the credential belongs to a person.
 */
export async function signUpBrand(
  db: DB,
  input: { name: string; contactEmail: string },
): Promise<{ brandId: string; key: string; brandUserId: string }> {
  const brandId = uid();
  await db.insert(schema.brands).values({
    id: brandId,
    name: input.name,
    slug: slugify(input.name) || `brand-${brandId.toLowerCase().slice(0, 6)}`,
    contactEmail: input.contactEmail,
  });
  const { issueBrandInvite } = await import("./brand-auth.ts");
  const invite = await issueBrandInvite(db, { brandId, email: input.contactEmail });

  // ===== AND HERE IT IS ACTUALLY SENT =====
  //
  // B1's one-time key was minted, hashed at rest, and returned to a caller
  // that was the demo seeder. **There was no way for a brand to ever sign in**
  // — the whole commercial funnel ended at a key nobody received. It is the
  // same defect as the verification code, one audience along.
  //
  // The key is still returned as well: it exists in readable form exactly once,
  // here, and the demo has to be able to show it because there is no inbox to
  // walk the screenshot record with. `sendBrandInvite` records the attempt and
  // never throws, so a signup does not fail because Resend is having a day.
  const { sendBrandInvite } = await import("../delivery/emails.ts");
  await sendBrandInvite({
    to: input.contactEmail,
    brandName: input.name,
    key: invite.key,
  });

  return { brandId, key: invite.key, brandUserId: invite.brandUserId };
}

/** Builder step 1 — the game cards. Only games we can actually score. */
export function sellableGames() {
  // `live: true` is what keeps VALORANT and anything without a configured key
  // out of the picker. A brand who buys a game we cannot score finds out at
  // sync time, which is the worst possible moment.
  return linkableGames({ live: true });
}

export type BuilderQuote = {
  weeks: { weekStart: Date; announceFrom: Date }[];
  challenges: { game: string; provider: string; weekStart: Date }[];
  totalCents: number;
  prizeCents: number;
  /** Every member of every server it would reach. Counted, never modelled. */
  estimatedReach: number;
  perChallengeCents: number;
};

/**
 * Builder step 3 — what it costs and when it runs, **before** paying.
 *
 * Reach here is an estimate and is labelled as one by the caller: it is the
 * current member count of every installed server, and what a brand is
 * *delivered* is counted at announcement (`challenge_announcements`). Two
 * different numbers with two different names, because conflating them is how
 * a modelled figure ends up in a report.
 */
export async function quote(
  db: DB,
  input: { games: string[]; challengesPerGame: number; startingWeek: Date; weeks: number },
  now = new Date(),
): Promise<BuilderQuote> {
  if (input.games.length === 0) {
    throw new BuilderRefused("Pick at least one game.");
  }
  if (input.challengesPerGame < 1 || input.weeks < 1) {
    throw new BuilderRefused("A purchase is at least one challenge, in at least one week.");
  }
  if (!isPeriodBoundary(input.startingWeek, "weekly")) {
    throw new BuilderRefused(
      "A challenge starts at the start of a week. There is no date picker — " +
        "what you choose is which week.",
    );
  }
  const earliest = earliestSellableWeek(now);
  if (input.startingWeek.getTime() < earliest.getTime()) {
    throw new BuilderRefused(
      `That week has already started. The earliest you can buy is the week of ` +
        `${earliest.toISOString().slice(0, 10)}.`,
    );
  }

  for (const game of input.games) {
    const provider = getProvider(game);
    if (!provider) throw new BuilderRefused(`We do not run challenges on ${game}.`);
    if (!isProviderLive(provider)) {
      throw new BuilderRefused(
        provider.notLive ??
          `${provider.name} is not available to buy yet — its provider is not configured.`,
      );
    }
  }

  const weeks = Array.from({ length: input.weeks }, (_, i) => {
    const weekStart = weekStartPlus(input.startingWeek, i);
    return {
      weekStart,
      // B4 — they see the announce date too. It is a decision admin makes, but
      // a brand needs to know roughly when their name goes out.
      announceFrom: new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000),
    };
  });

  const challenges = weeks.flatMap((w) =>
    input.games.flatMap((game) =>
      Array.from({ length: input.challengesPerGame }, () => ({
        game: getProvider(game)?.game ?? game,
        provider: game,
        weekStart: w.weekStart,
      })),
    ),
  );

  const totalCents = challenges.length * CHALLENGE_PRICE_CENTS;
  const [reach] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.guilds.memberCount}), 0)::int` })
    .from(schema.guilds);

  return {
    weeks,
    challenges,
    totalCents,
    prizeCents: splitOf(totalCents).prize,
    estimatedReach: (reach?.total ?? 0) * challenges.length,
    perChallengeCents: CHALLENGE_PRICE_CENTS,
  };
}

/**
 * Checkout: create the drafts and one bill.
 *
 * B9 — a series is billed together; a single challenge is billed alone. That
 * is why this makes one invoice with a line per challenge: L10 then announces
 * each one individually after the single payment clears.
 */
export async function confirmAndPay(
  db: DB,
  input: {
    brandId: string;
    games: string[];
    challengesPerGame: number;
    startingWeek: Date;
    weeks: number;
  },
  now = new Date(),
): Promise<{ invoiceId: string; challengeIds: string[]; totalCents: number }> {
  const q = await quote(db, input, now);
  const seriesId = q.challenges.length > 1 ? uid() : null;

  const challengeIds: string[] = [];
  const lines: { description: string; amountCents: number; refType: string; refId: string }[] = [];

  for (const [index, c] of q.challenges.entries()) {
    const challengeId = await createChallenge(db, {
      title: `${c.game} — week of ${c.weekStart.toISOString().slice(0, 10)}`,
      game: c.game,
      provider: c.provider,
      startAt: c.weekStart,
      sponsorBrandId: input.brandId,
      prizePoolCents: splitOf(CHALLENGE_PRICE_CENTS).prize,
      seriesId,
      seriesIndex: seriesId ? index : null,
    });
    challengeIds.push(challengeId);
    lines.push({
      description: `${c.game}, week of ${c.weekStart.toISOString().slice(0, 10)}`,
      amountCents: CHALLENGE_PRICE_CENTS,
      refType: "challenge",
      refId: challengeId,
    });
  }

  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    payerId: input.brandId,
    lines,
  });
  for (const challengeId of challengeIds) {
    await attachInvoice(db, challengeId, invoiceId);
  }

  return { invoiceId, challengeIds, totalCents: q.totalCents };
}

/** The webhook's job: paid → scheduled, for every challenge on the bill. */
export async function onInvoicePaid(db: DB, invoiceId: string): Promise<string[]> {
  await markPaid(db, invoiceId);
  const lines = await db
    .select()
    .from(schema.invoiceLines)
    .where(
      and(eq(schema.invoiceLines.invoiceId, invoiceId), eq(schema.invoiceLines.refType, "challenge")),
    );
  const ids = lines.map((l) => l.refId as string).filter(Boolean);
  for (const id of ids) await markScheduled(db, id);
  return ids;
}

export type BrandReport = {
  challengeId: string;
  title: string;
  game: string;
  weekStart: Date;
  /** Gamers who joined THAT challenge. Deliberately double counted across weeks. */
  entrants: number;
  /** Every member of every server it was announced to. Counted, not modelled. */
  reach: number;
  trophies: { name: string; valueCents: number; holders: number }[];
};

/**
 * B10 — the report, per challenge, filterable by game and week.
 *
 * ===== NEVER A "UNIQUE AUDIENCE" FIGURE =====
 *
 * §8 is explicit: the same ten members on two challenges is 2 × 10 reach, and
 * the same gamer entering week 1 and week 2 is two entrants. **Never sum reach
 * or entrants across challenges into a unique-audience number.** So this
 * returns a row per challenge and no total — a caller that wants one has to
 * write the addition themselves, in the open, where somebody can object.
 */
export async function brandReport(
  db: DB,
  brandId: string,
  filter: { game?: string; weekStart?: Date } = {},
): Promise<BrandReport[]> {
  const conditions = [eq(schema.challenges.sponsorBrandId, brandId)];
  if (filter.game) conditions.push(eq(schema.challenges.game, filter.game));
  if (filter.weekStart) conditions.push(eq(schema.challenges.startAt, filter.weekStart));

  const challenges = await db
    .select()
    .from(schema.challenges)
    .where(and(...conditions))
    .orderBy(desc(schema.challenges.startAt));
  if (challenges.length === 0) return [];

  const ids = challenges.map((c) => c.id);

  const entrantRows = await db
    .select({
      challengeId: schema.challengeParticipants.challengeId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.challengeParticipants)
    .where(inArray(schema.challengeParticipants.challengeId, ids))
    .groupBy(schema.challengeParticipants.challengeId);

  const reachRows = await db
    .select({
      challengeId: schema.challengeAnnouncements.challengeId,
      total: sql<number>`coalesce(sum(${schema.challengeAnnouncements.memberCountAt}), 0)::int`,
    })
    .from(schema.challengeAnnouncements)
    .where(inArray(schema.challengeAnnouncements.challengeId, ids))
    .groupBy(schema.challengeAnnouncements.challengeId);

  const trophyRows = await db
    .select({
      challengeId: schema.trophies.challengeId,
      name: schema.trophies.name,
      valueCents: schema.trophies.valueCents,
      holders: sql<number>`count(${schema.userTrophies.id})::int`,
    })
    .from(schema.trophies)
    .leftJoin(schema.userTrophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .where(inArray(schema.trophies.challengeId, ids))
    .groupBy(schema.trophies.id);

  const entrantsBy = new Map(entrantRows.map((r) => [r.challengeId, r.n]));
  const reachBy = new Map(reachRows.map((r) => [r.challengeId, r.total]));

  return challenges.map((c) => ({
    challengeId: c.id,
    title: c.title,
    game: c.game,
    weekStart: c.startAt,
    entrants: entrantsBy.get(c.id) ?? 0,
    reach: reachBy.get(c.id) ?? 0,
    trophies: trophyRows
      .filter((t) => t.challengeId === c.id)
      .map((t) => ({ name: t.name, valueCents: t.valueCents, holders: t.holders })),
  }));
}

/**
 * B-rule: a brand may never see a group smaller than the audience floor.
 *
 * A count of three is three people somebody can name. This is the one place a
 * brand-facing count is allowed to be suppressed, and it returns the reason
 * rather than a zero — a zero would read as "nobody", which is a different and
 * wrong claim.
 */
export function suppressSmallGroup(count: number): { show: boolean; text: string } {
  return count >= MIN_AUDIENCE_GROUP
    ? { show: true, text: count.toLocaleString("en-US") }
    : { show: false, text: `fewer than ${MIN_AUDIENCE_GROUP}` };
}

/** B8 — on an admin-built draft the brand may change the start week only. */
export async function changeStartWeek(
  db: DB,
  challengeId: string,
  brandId: string,
  weekStart: Date,
  now = new Date(),
): Promise<void> {
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge || challenge.sponsorBrandId !== brandId) {
    throw new BuilderRefused("That challenge is not yours.");
  }
  if (challenge.state !== "draft" && challenge.state !== "pending_payment") {
    throw new BuilderRefused(
      `A ${challenge.state} challenge cannot be moved. Talk to us and we will sort it.`,
    );
  }
  if (!isPeriodBoundary(weekStart, "weekly")) {
    throw new BuilderRefused("A challenge starts at the start of a week.");
  }
  if (weekStart.getTime() < earliestSellableWeek(now).getTime()) {
    throw new BuilderRefused("That week has already started.");
  }
  const { periodEnd } = await import("../challenges/week.ts");
  await db
    .update(schema.challenges)
    .set({ startAt: weekStart, endAt: periodEnd(weekStart, "weekly") })
    .where(eq(schema.challenges.id, challengeId));
}

export async function brandBilling(db: DB, brandId: string) {
  const invoices = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.payerType, "brand"), eq(schema.invoices.payerId, brandId)))
    .orderBy(desc(schema.invoices.createdAt));
  return Promise.all(invoices.map((i) => invoiceView(db, i.id)));
}

export { formatMoney };
