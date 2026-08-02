import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PRICING_DEFAULTS, buildPricing, PRICING_NUMBER_KEYS, type PricingConfig } from "@/lib/pricing";
import { buildFinance, FINANCE_CMS_KEYS, type FinanceConfig } from "@/lib/finance";
import { getContent } from "@/lib/cms";

// The two founding offers, as one place that decides who gets them.
//
// Both exist because a marketplace with real inventory and no case studies has
// to buy its first ones, and both are funded out of the round rather than out
// of a customer's budget:
//
//   SERVERS — a community that installs the bot gets a private competition we
//   fund, on the day it installs. It is the only offer that reaches MEMBERS
//   rather than owners, which is what turns an install into linked gamers.
//
//   BRANDS — the first hundred get the placements base discounted, and taking
//   it unlocks a month of sponsored challenges on us.
//
// The rule that matters most is the one about EXISTING customers. An offer that
// only new signups can take teaches everyone already with you that waiting
// would have been better, and there is no faster way to make your earliest
// supporters feel stupid. Both offers are therefore retroactive by design:
// every server already carrying the bot is owed its welcome challenge, and
// every brand already paying is owed the credit month.

export type OfferState = {
  /** How many have been given out. */
  claimed: number;
  /** How many the offer is capped at. */
  cap: number;
  /** Still to be given — including to people who joined before the offer. */
  remaining: number;
  /** Already here, and owed it. */
  waiting: number;
  /** What each one is worth. */
  value: number;
  open: boolean;
};

export type Offers = {
  servers: OfferState;
  brands: OfferState;
  pricing: PricingConfig;
  finance: FinanceConfig;
  /** The discounted base for the first hundred brands. */
  founderBase: number;
  /** The challenge credit taking it unlocks. */
  founderCredit: number;
};

/**
 * Where both offers stand right now.
 *
 * `waiting` is the number this file exists for: servers and brands that were
 * here BEFORE the offer and have not had it. Everything else is a counter; that
 * one is a to-do list.
 */
export async function offers(): Promise<Offers> {
  const [priceContent, financeContent] = await Promise.all([
    getContent(PRICING_NUMBER_KEYS).catch(() => ({} as Record<string, string>)),
    getContent(FINANCE_CMS_KEYS).catch(() => ({} as Record<string, string>)),
  ]);
  const pricing = buildPricing(priceContent);
  const finance = buildFinance(financeContent);

  const empty: OfferState = { claimed: 0, cap: 0, remaining: 0, waiting: 0, value: 0, open: false };
  let servers = { ...empty, cap: finance.targetServers, value: finance.welcomeChallengeCost };
  let brands = {
    ...empty,
    cap: FOUNDER_BRAND_CAP,
    value: finance.freeChallengesPerBrand * pricing.challengePrice,
  };

  try {
    const db = await getDb();
    const [given, live, brandsGiven, brandsLive] = await Promise.all([
      db.select({ n: count() }).from(schema.discordGuilds)
        .where(isNotNull(schema.discordGuilds.welcomeChallengeAt)),
      db.select({ n: count() }).from(schema.discordGuilds)
        .where(and(eq(schema.discordGuilds.status, "active"), isNull(schema.discordGuilds.welcomeChallengeAt))),
      db.select({ n: count() }).from(schema.brands).where(isNotNull(schema.brands.founderCreditAt)),
      db.select({ n: count() }).from(schema.brands)
        .where(and(eq(schema.brands.status, "active"), isNull(schema.brands.founderCreditAt))),
    ]);
    servers.claimed = Number(given[0]?.n ?? 0);
    servers.waiting = Number(live[0]?.n ?? 0);
    brands.claimed = Number(brandsGiven[0]?.n ?? 0);
    brands.waiting = Number(brandsLive[0]?.n ?? 0);
  } catch {
    // A counter that can't be read must not take down the page that shows it.
  }

  servers = { ...servers, remaining: Math.max(0, servers.cap - servers.claimed), open: servers.claimed < servers.cap };
  brands = { ...brands, remaining: Math.max(0, brands.cap - brands.claimed), open: brands.claimed < brands.cap };

  return {
    servers,
    brands,
    pricing,
    finance,
    founderBase: FOUNDER_BASE,
    founderCredit: finance.freeChallengesPerBrand * pricing.challengePrice,
  };
}

/** The first hundred brands, and what they pay. */
export const FOUNDER_BRAND_CAP = 100;
/** The discounted placements base for them — down from `pricing.reachBase`. */
export const FOUNDER_BASE = 500;

/** What the founding brand offer is worth, in words, wherever it's quoted. */
export function founderOfferLine(o: Offers): string {
  return `$${FOUNDER_BASE}/month for placements — down from $${o.pricing.reachBase} — and $${o.founderCredit.toLocaleString()} of challenge credit for your first month on one game.`;
}

/** Rounded down to something a human says out loud. */
export function remainingLine(o: OfferState, noun: string): string {
  if (!o.open) return `All ${o.cap.toLocaleString()} ${noun} taken.`;
  return `${o.remaining.toLocaleString()} of ${o.cap.toLocaleString()} ${noun} left.`;
}

export const isDefaultPricing = (p: PricingConfig) => p.reachBase === PRICING_DEFAULTS.reachBase;
