import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PRICING_DEFAULTS, type PricingConfig, type TierKey } from "@/lib/pricing";
import { deliveryTotalsFor, deliveriesFor, type DeliveryTotals } from "@/lib/challenge-delivery";
import { challengeStandings } from "@/lib/challenges";
import { type Slot, type Campaign } from "@/lib/sponsored-campaigns";

// What a brand's money bought, measured.
//
// This is the reporting half of the media buy, and it is written to survive the
// only conversation that matters: a brand asking "prove it". So every figure
// here is either counted from a ledger or derived from counted figures with the
// benchmark stated alongside it. Nothing is estimated silently.
//
// The distinction runs through the whole module:
//
//   * COUNTED   — servers reached, members reached, entrants, clicks, standings.
//                 These come from rows that were written when the thing
//                 happened, and they never change afterwards.
//   * DERIVED   — eCPM, cost per entrant. Counted numbers divided by the price.
//   * MODELLED  — media value and therefore ROAS. Counted delivery priced at a
//                 benchmark CPM/CPC that the brand can see and argue with.
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
  /** COUNTED: where it landed and how many people were there. */
  reach: DeliveryTotals;
  /** COUNTED: people who actually entered. */
  entrants: number;
  /** COUNTED: clicks on this brand's creatives while it ran. */
  clicks: number;
  /** COUNTED: the podium. */
  standings: { place: number; name: string; slug: string | null; points: number }[];
  /** DERIVED: what a thousand people cost. */
  ecpm: number;
  /** DERIVED: what one entrant cost. */
  costPerEntrant: number;
  /** MODELLED: delivery priced at the benchmark. */
  mediaValue: number;
  /** MODELLED: mediaValue ÷ spend. */
  roas: number;
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
    mediaValue: number;
    roas: number;
  };
  /** The benchmarks every modelled number above was priced at. */
  benchmark: { cpm: number; cpc: number; cpe: number };
  /** Set once all four have finished — the end-of-month report is ready. */
  complete: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Media value delivered, at stated benchmarks.
 *
 * Three components, priced separately because they are worth different amounts:
 * everyone who saw it at the benchmark CPM, everyone who clicked at the CPC,
 * and everyone who ENTERED at the cost-per-engagement rate. An entrant linked
 * an account and played a week under the brand's name; valuing them at an
 * impression's rate would understate a challenge as badly as the next omission
 * would overstate it.
 *
 * It deliberately does NOT count the prize money as value returned, even though
 * 70% of the buy reaches gamers: that money is the product, not a discount, and
 * counting it would push every ROAS on the platform above 1 by construction —
 * the fastest way to make the number worthless.
 */
export function mediaValue(
  reachMembers: number,
  clicks: number,
  cfg: PricingConfig = PRICING_DEFAULTS,
  entrants = 0,
): number {
  return round2(
    (reachMembers / 1000) * cfg.benchmarkCpm
    + clicks * cfg.benchmarkCpc
    + entrants * cfg.benchmarkCpe,
  );
}

export function roasOf(value: number, spend: number): number {
  return spend > 0 ? round2(value / spend) : 0;
}

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
      const value = mediaValue(r.members, clicks, cfg, n);
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
        mediaValue: value,
        roas: roasOf(value, spend),
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
  const value = mediaValue(members, clicks, cfg, entrants);

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
      mediaValue: value,
      roas: roasOf(value, spend),
    },
    benchmark: { cpm: cfg.benchmarkCpm, cpc: cfg.benchmarkCpc, cpe: cfg.benchmarkCpe },
    complete: weeks.length > 0 && weeks.every((w) => w.status === "done"),
  };
}

// ===== The tier a brand is on =====

export type BrandTier = {
  key: TierKey;
  label: string;
  /** Games they currently sponsor. */
  games: number;
  /** Of the games we commercialise. */
  ofGames: number;
  /** What they are spending a month on sponsored challenges. */
  monthly: number;
  /** What reaching the next tier takes, or null at the top. */
  next: { key: TierKey; label: string; games: number } | null;
};

const TIER_LABELS: Record<TierKey, string> = {
  reach: "Reach",
  challenge: "Challenge",
  ultimate: "Ultimate",
};

/**
 * Which tier a brand is on — from what they actually run, not what they signed.
 *
 * A tier here is a description of current activity: no live game is Reach, some
 * games is Challenge, every game we commercialise is Ultimate. Deriving it
 * rather than storing it means the badge on the portal can never disagree with
 * the campaigns listed underneath it.
 */
export function brandTier(
  activeGames: string[],
  cfg: PricingConfig = PRICING_DEFAULTS,
): BrandTier {
  const games = new Set(activeGames).size;
  const key: TierKey = games <= 0 ? "reach" : games >= cfg.games ? "ultimate" : "challenge";
  const next: BrandTier["next"] =
    key === "reach" ? { key: "challenge", label: TIER_LABELS.challenge, games: 1 }
      : key === "challenge" ? { key: "ultimate", label: TIER_LABELS.ultimate, games: cfg.games }
        : null;
  return {
    key,
    label: TIER_LABELS[key],
    games,
    ofGames: cfg.games,
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
