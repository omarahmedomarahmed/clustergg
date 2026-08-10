import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PRICING_DEFAULTS, type PricingConfig } from "@/lib/pricing";
import { deliveryTotalsFor, deliveriesFor, type DeliveryTotals } from "@/lib/challenge-delivery";
import { challengeStandings } from "@/lib/challenges";
import { type Slot, type Campaign } from "@/lib/sponsored-campaigns";

// What a brand's money bought.
//
// This module was written to survive a brand asking "prove it", and it did not.
// Its own header used to claim three tiers — counted, derived, modelled — with
// "media value and therefore ROAS" in the third, described as something a brand
// "can see and argue with". Then the UI rendered ROAS as a 2.4× hero figure and
// put the headcount it was computed from under a heading reading **Counted
// delivery**. A brand does not argue with a number presented that way; they
// believe it. That was finding #1 of `docs/DUE_DILIGENCE_REPORT.md`.
//
// **There is no MODELLED tier any more.** It is deleted, not relabelled,
// because the honest version of it does not exist until a view is logged (B81).
//
//   * COUNTED — servers the announcement landed in, entrants, clicks,
//     standings. Rows written when the thing happened; they never change.
//   * AUDIENCE — the member headcount of those servers. **Not delivery.** How
//     big the rooms were, named that way everywhere it is shown, because
//     calling it "People reached" is the same false claim one level down from
//     the one that was deleted.
//   * DERIVED — cost per thousand members, cost per entrant. Counted or
//     audience numbers divided by the price, each labelled by what it divides
//     by.
//
// A media buyer who cannot tell which is which has no reason to believe any of
// it, so the types keep them apart and the UI labels them.

export type ChallengeReport = {
  challengeId: string;
  title: string;
  game: string;
  coverUrl: string | null;
  status: string;
  startAt: Date;
  endAt: Date;
  /** What the brand paid for this one. */
  spend: number;
  /** The prize money that reached gamers out of that. */
  prizePool: number;
  /**
   * Where the announcement LANDED, and how many people are in those servers.
   *
   * `servers` is counted. **`members` is NOT delivery** — it is the headcount of
   * the servers we posted in, which is potential audience and nothing more. It
   * used to be labelled "People reached" underneath a heading that said "Counted
   * delivery", and `mediaValue` then multiplied it by a CPM to manufacture a
   * return-on-spend figure for a paying customer. That was the first finding in
   * `docs/DUE_DILIGENCE_REPORT.md` and it was correct.
   *
   * Kept, because a brand genuinely wants to know how big the rooms were. Named
   * for what it is, everywhere it is shown.
   */
  reach: DeliveryTotals;
  /** COUNTED: people who actually entered. */
  entrants: number;
  /** COUNTED: clicks on this brand's creatives while it ran. */
  clicks: number;
  /** COUNTED: the podium. */
  standings: { place: number; name: string; slug: string | null; points: number }[];
  /**
   * DERIVED: spend per thousand MEMBERS of the servers reached.
   *
   * Not a CPM in the media sense — the denominator is a headcount, not an
   * impression count. A real cost-per-view is only possible once B81 logs a
   * view, and this field is labelled for what it divides by until then.
   */
  ecpm: number;
  /** DERIVED, and genuinely counted on both sides: spend ÷ people who entered. */
  costPerEntrant: number;
};

export type CampaignReport = {
  campaign: Campaign;
  /** The four weeks, whether they have run yet or not. */
  weeks: {
    index: number;
    startAt: string;
    endAt: string;
    coverUrl: string | null;
    status: Slot["status"];
    challengeId: string | null;
    /** Present once the week has a live or finished challenge. */
    report: ChallengeReport | null;
  }[];
  totals: {
    spend: number;
    prizePool: number;
    servers: number;
    members: number;
    entrants: number;
    clicks: number;
    ecpm: number;
    costPerEntrant: number;
  };
  /** Set once all four have finished — the end-of-month report is ready. */
  complete: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// `mediaValue` and `roasOf` were here, and they are deleted rather than fixed.
//
// They priced a SERVER HEADCOUNT at a benchmark CPM and divided by spend, and
// the result was rendered to a paying brand as "Return on spend: 2.4×" beside a
// heading that said "Counted delivery". Nobody had counted anything. It is the
// most serious finding in `docs/DUE_DILIGENCE_REPORT.md`.
//
// There is no honest version of the calculation while a view is not logged, so
// there is no function here. `PRICING_DEFAULTS.benchmarkCpe` survives in
// `lib/pricing.ts` because B79 prices a CPA product on verified entrants — a
// number both sides of which are actually counted — and that was never what was
// being misrepresented.

/**
 * Every sponsored challenge a brand has run, reported.
 *
 * One query per fact rather than one per challenge: a brand with a year of
 * campaigns has fifty-odd challenges, and a portal that issues fifty queries to
 * draw one page is a portal that times out in the month it starts working.
 */
export async function brandChallengeReports(
  brandId: string,
  cfg: PricingConfig = PRICING_DEFAULTS,
): Promise<Map<string, ChallengeReport>> {
  const out = new Map<string, ChallengeReport>();
  try {
    const db = await getDb();
    const challenges = await db.select({
      id: schema.challenges.id,
      title: schema.challenges.title,
      game: schema.challenges.game,
      coverUrl: schema.challenges.coverUrl,
      status: schema.challenges.status,
      startAt: schema.challenges.startAt,
      endAt: schema.challenges.endAt,
      price: schema.challenges.sponsorPrice,
    }).from(schema.challenges)
      .where(eq(schema.challenges.sponsorBrandId, brandId))
      .orderBy(desc(schema.challenges.startAt))
      .limit(200);
    if (!challenges.length) return out;

    const ids = challenges.map((c) => c.id);
    const [reach, entrants, clicksByChallenge] = await Promise.all([
      deliveryTotalsFor(ids),
      db.select({
        challengeId: schema.challengeParticipants.challengeId,
        n: sql<number>`count(distinct ${schema.challengeParticipants.userId})`,
      }).from(schema.challengeParticipants)
        .where(inArray(schema.challengeParticipants.challengeId, ids))
        .groupBy(schema.challengeParticipants.challengeId),
      clicksDuring(brandId, challenges.map((c) => ({ id: c.id, startAt: c.startAt, endAt: c.endAt }))),
    ]);

    const entrantsBy = new Map(entrants.map((e) => [e.challengeId, Number(e.n ?? 0)]));

    // Standings only for challenges that have run — an upcoming week has no
    // podium, and asking for one is a query per week that returns nothing.
    const ran = challenges.filter((c) => c.status !== "draft");
    const podiums = new Map<string, ChallengeReport["standings"]>();
    await Promise.all(ran.map(async (c) => {
      const rows = await challengeStandings(c.id, 3);
      podiums.set(c.id, rows.map((r) => ({
        place: r.place, name: r.displayName, slug: r.slug, points: r.points,
      })));
    }));

    for (const c of challenges) {
      const r = reach.get(c.id) ?? { servers: 0, members: 0, linked: 0 };
      const n = entrantsBy.get(c.id) ?? 0;
      const clicks = clicksByChallenge.get(c.id) ?? 0;
      const spend = c.price || cfg.challengePrice;
      out.set(c.id, {
        challengeId: c.id,
        title: c.title,
        game: c.game,
        coverUrl: c.coverUrl,
        status: c.status,
        startAt: c.startAt,
        endAt: c.endAt,
        spend,
        prizePool: cfg.prizePool,
        reach: r,
        entrants: n,
        clicks,
        standings: podiums.get(c.id) ?? [],
        ecpm: r.members > 0 ? round2((spend / r.members) * 1000) : 0,
        costPerEntrant: n > 0 ? round2(spend / n) : 0,
      });
    }
  } catch { /* an empty map renders as "nothing yet", which is honest */ }
  return out;
}

/**
 * Clicks on a brand's creatives while each of its challenges was running.
 *
 * Attribution is by time window, and that is a deliberate limit rather than a
 * shortcut: a click on the sponsor button under a bot card doesn't know which
 * challenge prompted it, so claiming per-challenge precision we don't have
 * would be worse than saying "clicks while this ran". The window is stated in
 * the UI for exactly that reason.
 */
async function clicksDuring(
  brandId: string,
  windows: { id: string; startAt: Date; endAt: Date }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!windows.length) return out;
  try {
    const db = await getDb();
    const creatives = await db.select({ id: schema.adCampaignCreatives.id })
      .from(schema.adCampaignCreatives)
      .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
      .where(eq(schema.adCampaigns.brandId, brandId));
    const ids = creatives.map((c) => c.id);
    if (!ids.length) return out;

    // One pass over the clicks, bucketed in memory. A query per window would be
    // one round trip per week of every campaign the brand has ever bought.
    const earliest = new Date(Math.min(...windows.map((w) => w.startAt.getTime())));
    const latest = new Date(Math.max(...windows.map((w) => w.endAt.getTime())));
    const clicks = await db.select({ createdAt: schema.adClicks.createdAt })
      .from(schema.adClicks)
      .where(and(
        inArray(schema.adClicks.campaignCreativeId, ids),
        gte(schema.adClicks.createdAt, earliest),
        lte(schema.adClicks.createdAt, latest),
      ));
    for (const w of windows) {
      const n = clicks.filter((c) =>
        c.createdAt >= w.startAt && c.createdAt <= w.endAt).length;
      out.set(w.id, n);
    }
  } catch { /* no clicks is a real answer */ }
  return out;
}

/** One campaign, week by week, with the month's totals. */
export async function campaignReport(
  campaign: Campaign,
  reports: Map<string, ChallengeReport>,
  cfg: PricingConfig = PRICING_DEFAULTS,
): Promise<CampaignReport> {
  const slots = (campaign.slotState ?? []) as Slot[];
  const weeks = slots
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((s) => ({
      index: s.index,
      startAt: s.startAt,
      endAt: s.endAt,
      coverUrl: s.coverUrl ?? campaign.coverUrl ?? null,
      status: s.status,
      challengeId: s.challengeId ?? null,
      report: (s.challengeId && reports.get(s.challengeId)) || null,
    }));

  const ran = weeks.map((w) => w.report).filter((r): r is ChallengeReport => !!r);
  const servers = ran.reduce((a, r) => a + r.reach.servers, 0);
  const members = ran.reduce((a, r) => a + r.reach.members, 0);
  const entrants = ran.reduce((a, r) => a + r.entrants, 0);
  const clicks = ran.reduce((a, r) => a + r.clicks, 0);
  // Spend is what they were BILLED — the whole month, whether or not every week
  // has run. Dividing delivery by only the weeks that ran would flatter every
  // campaign in progress.
  const spend = campaign.total;

  return {
    campaign,
    weeks,
    totals: {
      spend,
      prizePool: round2(cfg.prizePool * campaign.slots),
      servers,
      members,
      entrants,
      clicks,
      ecpm: members > 0 ? round2((spend / members) * 1000) : 0,
      costPerEntrant: entrants > 0 ? round2(spend / entrants) : 0,
    },
    complete: weeks.length > 0 && weeks.every((w) => w.status === "done"),
  };
}

// ===== How much of the network a brand carries =====
//
// B118. This was a TIER — Reach, Challenge, Ultimate — named after the three
// plans on the old rate card. There is one package now, so a badge reading
// "Reach tier" over a brand's own dashboard named a product they could not
// have bought and implied a ladder they could not climb.
//
// What it actually measures is worth keeping: how many of the games we
// commercialise this brand currently sponsors, derived from the campaigns
// running rather than from anything signed, so the line at the top of the
// portal can never disagree with the list underneath it.

export type BrandStanding = {
  /** Games they currently sponsor. */
  games: number;
  /** Of the games we commercialise. */
  ofGames: number;
  /** A plain description of that, never a plan name. */
  label: string;
  /** What they are spending a month on sponsored challenges. */
  monthly: number;
  /** The next step up, or null when they carry every game. */
  next: { label: string; games: number } | null;
};

export function brandStanding(
  activeGames: string[],
  cfg: PricingConfig = PRICING_DEFAULTS,
): BrandStanding {
  const games = new Set(activeGames).size;
  const ofGames = cfg.games;
  const label = games <= 0
    ? "No game running"
    : games >= ofGames ? "Every game on the network" : `${games} of ${ofGames} games`;
  const next: BrandStanding["next"] = games >= ofGames
    ? null
    : { label: games + 1 >= ofGames ? "every game on the network" : `${games + 1} of ${ofGames} games`, games: games + 1 };
  return {
    games,
    ofGames,
    label,
    monthly: round2(games * cfg.challengePrice * cfg.challengesPerGame),
    next,
  };
}

/** The servers one challenge reached, for the drill-down table. */
export async function challengeServers(challengeId: string) {
  return deliveriesFor(challengeId);
}

// ===== Testimonials =====

export type Testimonial = {
  campaignId: string | null;
  name: string;
  quote: string;
  slug: string | null;
  avatarUrl: string | null;
};

/**
 * What players said, as staff recorded it.
 *
 * Only published quotes, and only ones a human typed in — there is no path here
 * that generates a testimonial from platform data, because a quote nobody said
 * is worse than no quote at all. The gamer's profile is joined in when we know
 * them, so the brand can click through to the person who said it.
 */
export async function brandTestimonials(brandId: string): Promise<Testimonial[]> {
  try {
    const db = await getDb();
    const rows = await db.select({
      campaignId: schema.brandTestimonials.campaignId,
      name: schema.brandTestimonials.name,
      quote: schema.brandTestimonials.quote,
      slug: schema.users.slug,
      avatarUrl: schema.users.avatarUrl,
      displayName: schema.users.displayName,
    }).from(schema.brandTestimonials)
      .leftJoin(schema.users, eq(schema.brandTestimonials.userId, schema.users.id))
      .where(and(
        eq(schema.brandTestimonials.brandId, brandId),
        eq(schema.brandTestimonials.status, "published"),
      ))
      .orderBy(desc(schema.brandTestimonials.createdAt))
      .limit(50);
    return rows.map((r) => ({
      campaignId: r.campaignId,
      name: r.name || r.displayName || "A player",
      quote: r.quote,
      slug: r.slug,
      avatarUrl: r.avatarUrl,
    }));
  } catch { return []; }
}
