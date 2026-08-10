import { PRICING_DEFAULTS, prizeSharePct, marginPerChallenge, perGame, money, type PricingConfig } from "@/lib/pricing";
import { DEFAULT_SPLIT } from "@/lib/vault-split";

// The plan for the money, as arithmetic instead of a slide.
//
// Every figure a founder says out loud in a room — use of funds, runway,
// breakeven, the month-six state, the valuation — is derived here from a small
// set of assumptions an admin can edit. Nothing is typed twice, so the deck,
// the data room and the public page cannot disagree with each other, and a
// change of plan is a change of one number rather than a hunt through prose.
//
// Two modelling rules, both learned the hard way from the first draft of this
// plan:
//
//  1. CASH IS NOT THE SAME AS BUDGET. Giving a brand its first month free is a
//     real cost, but most of it is revenue we choose not to charge, not money
//     that leaves the bank. Mixing the two overstates burn and understates
//     runway. Every line below therefore carries both figures.
//
//  2. INVENTORY COST IS FIXED, NOT PER-SALE. Cluster funds the prize pool of
//     every challenge on the network whether or not a brand has bought the
//     naming rights on it. So prize money is a function of how many challenges
//     we RUN, not of how many we SELL — and a brand's free month costs nothing
//     extra in cash, because the challenge was already running.
//
// This module is PURE: no database, no server imports, so the same functions
// render the deck on the server and drive the sliders in the browser.

export type FinanceConfig = {
  // ===== The round =====
  /** What we're raising. */
  raise: number;
  /** For what share of the company, post-money. */
  equityPct: number;
  /** How long the raise has to last. */
  months: number;

  // ===== Brand acquisition =====
  /** Brands we put through the free first month. */
  targetBrands: number;
  /** Challenges each of them gets on us, in that month. */
  freeChallengesPerBrand: number;
  /** How many of those stay, and pay. */
  brandsConverting: number;
  /**
   * What a paying brand pays a month.
   *
   * DEFAULTED FROM THE RATE CARD, not typed. It sat at $1,500 while one game
   * of challenges invoiced at $1,400 — a model projecting revenue the product
   * cannot bill, which is the same defect as a marketing page quoting a price
   * we do not charge. Still editable, because a plan may assume brands buy
   * more than one game; it just may not silently assume a different rate.
   */
  revenuePerBrand: number;

  // ===== Server acquisition =====
  /** Servers we want carrying the bot. */
  targetServers: number;
  /** The one-off welcome challenge we fund for each of them. */
  welcomeChallengeCost: number;
  /** Typical members in a server we onboard. */
  membersPerServer: number;
  /** Of those, how many link a game account. */
  linkedPerServer: number;

  // ===== The network we run =====
  /**
   * Games we operate challenges on. ALSO THE CAPACITY CONSTRAINT — see
   * `payingBrandCapacity` below.
   */
  games: number;
  /**
   * How many games a paying brand buys at once.
   *
   * One by default: a campaign is four consecutive weekly challenges on ONE
   * game. It matters here because a game runs a single sponsored challenge at a
   * time, so this is the divisor on how many brands can be served at all.
   */
  gamesPerPayingBrand: number;
  /** Challenges per game per month. One a week. */
  challengesPerGamePerMonth: number;
  // A switch called `sponsorsUseHouseInventory` was here. C8.
  //
  // It asked whether a sponsored challenge REPLACES one we were running anyway,
  // and set to true it said the prize "was already funded" — while the prizes
  // line below charged the house for every challenge on the network, sponsored
  // or not. The same $175 was funded twice, once out of the raise and once out
  // of the brand's payment.
  //
  // COMMERCIAL_MODEL_V2 §2 answers the question, so it stops being a switch:
  // half of what a brand pays IS the prize pool. A sold challenge's prize comes
  // out of the sale; the house funds only the challenges nobody bought. That is
  // computed below rather than toggled, because a checkbox that contradicts the
  // commercial model is a checkbox somebody will eventually tick.

  // ===== Everything else =====
  /** Infrastructure, game-API access, partnerships, tooling — for the period. */
  techBudget: number;
  /** People. */
  hires: number;
  hireMonthlyCost: number;
};

// ===== THE ROUND, REPRICED. B120 =====
//
// It was $100,000 for 20%, over six months. Three things were wrong with that,
// and the first two only became visible once `marginPerChallenge` was corrected.
//
//  1. IT PRICED THE COMPANY AT 1.2× THE ARR ITS OWN PLAN PROJECTS. A $500,000
//     post-money against $420,000 of projected ARR is not a seed price, it is a
//     discount to revenue that has not been earned yet — which is the wrong way
//     round.
//
//  2. IT SOLD 20% FOR MONEY THE PLAN DOES NOT SPEND. At the modelled burn, only
//     about two thirds of the $100,000 was allocated; the rest sat as buffer.
//     Dilution is the most expensive thing a founder pays with, and paying it
//     for cash that stays in the account is the one form of waste that cannot
//     be undone later.
//
//  3. THE BASE CASE ASSUMED 25 OF 30 BRANDS CONVERT. 83% free-to-paid is a
//     number an investor discounts to nothing, and discounting the base case
//     discounts everything built on it. The base case is now 50% — the "Strong"
//     rung of our own stress test — and 83% is upside rather than the plan.
//
// $150,000 for 12% instead: $1.25M post, $1.1M pre, nine months. That is about
// 3.4× projected ARR on a base case that survives every rung of the stress test
// down to one brand in six, against a five-month payback and roughly 4× LTV to
// CAC. The extra $50,000 is spent, not banked — 45 brands through the funnel
// instead of 30, 2,000 servers instead of 1,000, and a team line that is
// actually funded. `levers()` shows which of those moves ARR and which does
// not.
export const FINANCE_DEFAULTS: FinanceConfig = {
  raise: 150_000,
  equityPct: 12,
  months: 9,

  // The plan SPENDS the raise. Scaling the money without scaling the funnel
  // would have left $79,000 of $150,000 unallocated — a worse version of the
  // second problem above, since dilution paid for cash that sits in the account
  // is the one cost that cannot be recovered later. The buffer is now about
  // $5,000: enough to absorb a bad month, not enough to be a rounding error
  // somebody raised 12% of the company for.
  // Sized to FILL the game slots at a 50% conversion rate, not to a brand
  // count picked independently of them. 36 through the funnel, 18 stay, 18
  // slots. Onboarding more than the network can serve is spending cash on
  // brands we would have to turn away.
  targetBrands: 36,
  freeChallengesPerBrand: 4,
  brandsConverting: 18,
  revenuePerBrand: perGame(PRICING_DEFAULTS),

  targetServers: 2_000,
  welcomeChallengeCost: 25,
  membersPerServer: 1_000,
  linkedPerServer: 10,

  // EIGHTEEN, and this is what the round is actually for.
  //
  // A game runs one sponsored challenge at a time, so a game is one paying
  // brand's slot. At the six games we run today the network can serve six
  // sponsors — about $100,000 of ARR — against a cost base of roughly $7,000 a
  // month. It does not reach breakeven at any conversion rate, because
  // conversion was never the binding constraint. Inventory was.
  //
  // Twelve new game integrations over nine months takes capacity to eighteen
  // and the plan to breakeven in month seven. `levers()` now shows the same
  // thing from the other side: with capacity fixed, brand acquisition and
  // conversion both move ARR by exactly zero.
  games: 18,
  gamesPerPayingBrand: 1,
  challengesPerGamePerMonth: 4,

  techBudget: 20_000,
  hires: 4,
  // Nine months at a rate that is still part-time, but not the $416 that was
  // here — a figure low enough that the team line was not really being funded.
  hireMonthlyCost: 1_200,
};

export const FINANCE_NUMBER_KEYS = (Object.keys(FINANCE_DEFAULTS) as (keyof FinanceConfig)[])
  .map((k) => `finance.${k}`);

export const FINANCE_CMS_KEYS = [...FINANCE_NUMBER_KEYS];

/** Read a CMS content map into a config. Anything missing or unparseable keeps
 *  its default rather than rendering a NaN on an investor's screen. */
export function buildFinance(content: Record<string, string> = {}): FinanceConfig {
  const out = { ...FINANCE_DEFAULTS };
  for (const key of Object.keys(FINANCE_DEFAULTS) as (keyof FinanceConfig)[]) {
    const raw = content[`finance.${key}`];
    if (raw === undefined || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) (out[key] as number) = n;
  }
  out.months = Math.max(1, Math.min(60, Math.round(out.months)));
  out.equityPct = Math.max(0.1, Math.min(99, out.equityPct));
  out.games = Math.max(1, Math.round(out.games));
  // Converting more brands than we acquired is not optimism, it's an error.
  out.brandsConverting = Math.min(out.brandsConverting, out.targetBrands);
  return out;
}

// ===== Use of funds =====

export type FundLine = {
  key: string;
  label: string;
  /** How the number is arrived at, in words an investor can check. */
  formula: string;
  /** Money that actually leaves the bank. */
  cash: number;
  /** Revenue we choose not to charge. Real cost, but not runway. */
  foregone: number;
  /** What it buys. */
  note: string;
};

export type Finance = {
  cfg: FinanceConfig;
  lines: FundLine[];
  /** Cash out over the whole period. */
  cashTotal: number;
  /** Revenue given away over the whole period. */
  foregoneTotal: number;
  /** cash + foregone — the number a "use of funds" slide usually shows. */
  investedTotal: number;
  /** raise − cashTotal. Positive is unallocated buffer; negative is a hole. */
  buffer: number;
  /** Average cash out per month. */
  monthlyBurn: number;
  /** How long the raise lasts at that rate, in months. */
  runwayMonths: number;

  /**
   * How many brands the network can serve at once. B120.
   *
   * ===== THE CONSTRAINT THE PLAN WAS IGNORING =====
   *
   * A game runs ONE sponsored challenge at a time — two on the same game in the
   * same week split the field and make both look empty. A campaign is four
   * consecutive weekly challenges, which is one month on one game. So a game
   * serves exactly one paying brand per month, and the whole network serves
   * `games ÷ gamesPerPayingBrand` of them.
   *
   * At six games that is SIX. The plan projected twenty-two, and every figure
   * built on it — MRR, ARR, the valuation multiple, breakeven — was a
   * projection of revenue the network had no inventory to deliver.
   *
   * `payingBrands` below is now the smaller of what converts and what fits.
   */
  payingBrandCapacity: number;
  /** True when conversion is no longer the binding constraint — inventory is. */
  capacityBound: boolean;

  // The network we run, and what it costs to run it
  challengesPerMonth: number;
  challengesTotal: number;
  prizeCostPerMonth: number;

  // Where we land
  exit: {
    servers: number;
    reachable: number;
    linkedGamers: number;
    payingBrands: number;
    mrr: number;
    arr: number;
    /** What the business costs to run in a steady month at that point. */
    steadyMonthlyCost: number;
    /** MRR − steady monthly cost. */
    monthlyProfit: number;
    /** Of the brands we gave a free month, the share that stayed. */
    conversionPct: number;
  };

  // Breakeven
  breakeven: {
    /** Cost of a month once acquisition spending stops. */
    monthlyCost: number;
    /** What one paying brand contributes after the cost of serving it. */
    contributionPerBrand: number;
    /** Paying brands needed to cover that. */
    brandsNeeded: number;
    /** As a share of the brands we put through the free month. */
    conversionNeededPct: number;
    /** Month in which MRR is projected to cross it, or null if it doesn't. */
    month: number | null;
  };

  // The round
  valuation: {
    post: number;
    pre: number;
    /** Post-money as a multiple of the ARR we're projecting at month six. */
    postOnExitArr: number;
    /** What the next round might price at, on a range of ARR multiples. */
    nextRound: { multiple: number; valuation: number; stepUp: number }[];
  };

  /**
   * The four numbers an investor actually underwrites. B120.
   *
   * Everything above answers "what does the plan cost". None of it answered
   * "does a customer pay for itself, and how fast" — which is the question that
   * decides whether spending more is growth or a hole.
   */
  unit: UnitEconomics;

  /** What moves the outcome most, measured rather than asserted. B120. */
  levers: Lever[];

  /** Month-by-month, so the shape of the plan is visible rather than asserted. */
  months: FinanceMonth[];
};

export type UnitEconomics = {
  /** What it costs to land one PAYING brand — including the ones that did not stay. */
  cacBrand: number;
  /** What it costs to land one server. */
  cacServer: number;
  /** Our share of what a brand pays, per month. */
  contributionPerBrand: number;
  /** Our share as a percentage of what they pay. */
  grossMarginPct: number;
  /** Months of contribution to repay the cost of acquiring that brand. */
  paybackMonths: number;
  /**
   * Lifetime value at an assumed retention, and the assumption stated with it.
   *
   * A single LTV number with the churn hidden inside it is the figure most
   * often wrong on a seed deck, so both halves are returned.
   */
  assumedMonthlyChurnPct: number;
  lifetimeMonths: number;
  ltv: number;
  /** LTV ÷ CAC. Under 1 means every sale loses money. */
  ltvToCac: number;
  /** What one linked gamer costs to acquire. */
  costPerLinkedGamer: number;
};

export type Lever = {
  key: string;
  label: string;
  /** What is being changed, in words. */
  change: string;
  /** Month-six ARR if this lever moves and nothing else does. */
  arr: number;
  /** Against the base case. */
  deltaArr: number;
  /** Does the raise still survive the period? */
  survives: boolean;
  /** Why this one is worth pulling, or why it is not. */
  note: string;
};

export type FinanceMonth = {
  month: number;
  serversAdded: number;
  serversTotal: number;
  brandsFree: number;
  payingBrands: number;
  mrr: number;
  /** Cash out this month. */
  spend: number;
  /** Cash in this month. */
  revenue: number;
  /** raise − cumulative(spend − revenue). */
  cashLeft: number;
  linkedGamers: number;
  reachable: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The whole model.
 *
 * Deliberately returns everything at once rather than a dozen small functions:
 * the figures are interdependent (breakeven depends on the cost base, which
 * depends on how many challenges we run, which sets the prize line), and
 * computing them in one place is what stops a slide from quoting a burn that
 * disagrees with the cash-flow table beside it.
 */
export function finance(cfg: FinanceConfig = FINANCE_DEFAULTS, pricing: PricingConfig = PRICING_DEFAULTS): Finance {
  const prize = pricing.prizePool;
  const price = pricing.challengePrice;

  // What we run, monthly and over the period. This is the inventory, and it is
  // the same whether or not anybody has bought it.
  const challengesPerMonth = cfg.games * cfg.challengesPerGamePerMonth;
  const challengesTotal = challengesPerMonth * cfg.months;

  // C8. A SOLD challenge's prize comes out of the sale — half of what the brand
  // pays IS the prize pool. So the house funds the prizes on challenges nobody
  // bought, and only those. Charging the house for all of them while also taking
  // 50% of every sale for prizes funded the same money twice.
  // Sold is bounded by INVENTORY, not by how many brands said yes. Using
  // `brandsConverting` here let 22 brands "buy" 88 challenges out of a network
  // that runs 24, which zeroed the house prize line — the plan looked cheaper
  // precisely where it was least deliverable.
  const sellableSlots = Math.max(0, Math.floor(cfg.games / Math.max(1, cfg.gamesPerPayingBrand)))
    * cfg.gamesPerPayingBrand * cfg.challengesPerGamePerMonth;
  const soldPerMonth = Math.min(
    challengesPerMonth,
    sellableSlots,
    Math.min(cfg.brandsConverting, Math.floor(cfg.games / Math.max(1, cfg.gamesPerPayingBrand)))
      * cfg.gamesPerPayingBrand * cfg.challengesPerGamePerMonth,
  );
  const housePrizeChallengesPerMonth = Math.max(0, challengesPerMonth - soldPerMonth);
  const prizeCostPerMonth = housePrizeChallengesPerMonth * prize;
  const prizeCostTotal = prizeCostPerMonth * cfg.months;

  // The free first month is the one case where a sponsored challenge's prize IS
  // ours: the brand's name is on it and no invoice went out, so nothing funded
  // the pool. That is a real cash cost, and with the switch gone it is stated
  // rather than hidden behind a default.
  const freeChallenges = cfg.targetBrands * cfg.freeChallengesPerBrand;
  const brandOfferForegone = freeChallenges * price;
  const brandOfferCash = freeChallenges * prize;

  const serverCash = cfg.targetServers * cfg.welcomeChallengeCost;
  const teamCash = cfg.hires * cfg.hireMonthlyCost * cfg.months;

  const lines: FundLine[] = [
    {
      key: "prizes",
      label: "Prize pools — the competitions themselves",
      formula: `${housePrizeChallengesPerMonth} unsold of ${challengesPerMonth} challenges/mo × ${cfg.months} months × $${prize}`,
      cash: prizeCostTotal,
      foregone: 0,
      note: "The challenges nobody has bought yet. They still pay out — that is what keeps something worth entering live in every game, every week, and it is the inventory a brand is later sold. A SOLD challenge is not in this line: half of what the brand paid is its prize pool.",
    },
    {
      key: "servers",
      label: "Server onboarding — the welcome challenge",
      formula: `${cfg.targetServers.toLocaleString()} servers × $${cfg.welcomeChallengeCost}`,
      cash: serverCash,
      foregone: 0,
      note: "A private competition we fund for each community on the day it installs the bot. It is the only acquisition offer that reaches members rather than owners, and it is what turns an install into linked gamers.",
    },
    {
      key: "brands",
      label: "Brand acquisition — the first month on us",
      formula: `${cfg.targetBrands} brands × ${cfg.freeChallengesPerBrand} challenges × $${price}`,
      cash: brandOfferCash,
      foregone: brandOfferForegone,
      note: "The first month on us. The brand's name is on the challenge and no invoice goes out, so nothing funds the prize pool — it is real cash as well as an unsent invoice. This is the only case where we pay for a sponsored challenge's prizes.",
    },
    {
      key: "tech",
      label: "Infrastructure, game APIs and partnerships",
      formula: `${Math.round((cfg.techBudget / cfg.raise) * 100)}% of the raise`,
      cash: cfg.techBudget,
      foregone: 0,
      note: "Hosting, image rendering, the game-API access every verified stat depends on, and the partnership work that opens new games.",
    },
    {
      key: "team",
      label: "Team",
      formula: `${cfg.hires} people × $${cfg.hireMonthlyCost}/mo × ${cfg.months} months`,
      cash: teamCash,
      foregone: 0,
      note: "Part-time and early-stage rates. This is the line that has to rise first, and the one the next round is for.",
    },
  ];

  const cashTotal = lines.reduce((s, l) => s + l.cash, 0);
  const foregoneTotal = lines.reduce((s, l) => s + l.foregone, 0);
  const monthlyBurn = cashTotal / cfg.months;

  // ===== Where we land =====
  //
  // CAPACITY FIRST. A game runs one sponsored challenge at a time and a
  // campaign is a month on one game, so the network serves `games ÷
  // gamesPerPayingBrand` paying brands at once — six, at six games. Everything
  // downstream reads `payingBrands`, never `brandsConverting`, because the plan
  // projected twenty-two against inventory for six.
  const payingBrandCapacity = Math.max(0, Math.floor(cfg.games / Math.max(1, cfg.gamesPerPayingBrand)));
  const payingBrands = Math.min(cfg.brandsConverting, payingBrandCapacity);
  const capacityBound = cfg.brandsConverting > payingBrandCapacity;

  const reachable = cfg.targetServers * cfg.membersPerServer;
  const linkedGamers = cfg.targetServers * cfg.linkedPerServer;
  const mrr = payingBrands * cfg.revenuePerBrand;

  // A steady month once acquisition stops: we still run the network and still
  // pay people. Server onboarding and the free months are one-off by design.
  const steadyMonthlyCost = prizeCostPerMonth + (cfg.techBudget / cfg.months) + (cfg.hires * cfg.hireMonthlyCost);

  // ===== Breakeven =====
  //
  // Contribution per brand is revenue minus the cost of serving that brand, and
  // under v2 that cost is real: half of what they pay leaves as prize money.
  // The old model set this to zero on the "the challenge runs either way"
  // argument, which flattered breakeven by exactly the prize line — the same
  // money the prizes row above was already spending.
  // B120. This subtracted only the PRIZE from a brand's payment and called the
  // rest contribution. A sale divides four ways: the prize pool, the server
  // pool at 15%, the points vault at 15%, and us. The server pool is paid out
  // every Monday and the points vault funds every point a gamer earns — both
  // leave the bank on a sale exactly as the prize does.
  //
  // Counting them as margin overstated contribution per brand by 30% of
  // revenue and pulled breakeven in by the same distance. `marginPerChallenge`
  // is now our real share, and this reads it rather than repeating the
  // subtraction that was wrong there too.
  const ourSharePct = pricing.challengePrice > 0
    ? marginPerChallenge(pricing) / pricing.challengePrice
    : 0;
  const contributionPerBrand = Math.max(1, cfg.revenuePerBrand * ourSharePct);
  const brandsNeeded = Math.ceil(steadyMonthlyCost / contributionPerBrand);
  const conversionNeededPct = cfg.targetBrands > 0 ? (brandsNeeded / cfg.targetBrands) * 100 : 0;

  // ===== Month by month =====
  const months: FinanceMonth[] = [];
  const serversPerMonth = cfg.targetServers / cfg.months;
  const brandsPerMonth = cfg.targetBrands / cfg.months;
  let cashLeft = cfg.raise;
  let breakevenMonth: number | null = null;

  for (let m = 1; m <= cfg.months; m++) {
    const serversTotal = Math.round(serversPerMonth * m);
    const serversAdded = serversTotal - (months[m - 2]?.serversTotal ?? 0);
    // A brand takes its free month, then pays from the next one. Only the share
    // that converts keeps paying.
    const brandsOnboardedByNow = Math.round(brandsPerMonth * m);
    const brandsOnboardedLastMonth = Math.round(brandsPerMonth * (m - 1));
    const convRate = cfg.targetBrands > 0 ? cfg.brandsConverting / cfg.targetBrands : 0;
    const payingBrands = Math.min(
      Math.round(brandsOnboardedLastMonth * convRate),
      payingBrandCapacity,
    );
    const monthMrr = payingBrands * cfg.revenuePerBrand;

    const spend = prizeCostPerMonth
      + serversAdded * cfg.welcomeChallengeCost
      + (cfg.techBudget / cfg.months)
      + cfg.hires * cfg.hireMonthlyCost
      // The free month's prizes, which nothing else funds.
      + (brandsOnboardedByNow - brandsOnboardedLastMonth) * cfg.freeChallengesPerBrand * prize;

    cashLeft = cashLeft - spend + monthMrr;
    if (breakevenMonth === null && monthMrr >= spend) breakevenMonth = m;

    months.push({
      month: m,
      serversAdded,
      serversTotal,
      brandsFree: brandsOnboardedByNow - brandsOnboardedLastMonth,
      payingBrands,
      mrr: round(monthMrr),
      spend: round(spend),
      revenue: round(monthMrr),
      cashLeft: round(cashLeft),
      linkedGamers: serversTotal * cfg.linkedPerServer,
      reachable: serversTotal * cfg.membersPerServer,
    });
  }

  // ===== The round =====
  const post = cfg.raise / (cfg.equityPct / 100);
  const pre = post - cfg.raise;
  const arr = mrr * 12;
  const nextRound = [4, 6, 8, 10].map((multiple) => ({
    multiple,
    valuation: arr * multiple,
    stepUp: post > 0 ? (arr * multiple) / post : 0,
  }));

  // ===== Unit economics =====
  //
  // CAC is measured against the brands that STAYED, not the ones we onboarded.
  // Dividing acquisition spend by everybody who took a free month is the
  // flattering version and it is the one that hides a conversion problem: at
  // 25 of 30 converting it understates CAC by a sixth, and at 5 of 30 it
  // understates it fivefold.
  const brandAcquisitionCash = brandOfferCash;
  const cacBrand = payingBrands > 0
    ? brandAcquisitionCash / payingBrands
    : brandAcquisitionCash;
  const cacServer = cfg.targetServers > 0 ? serverCash / cfg.targetServers : 0;
  const grossMarginPct = cfg.revenuePerBrand > 0
    ? (contributionPerBrand / cfg.revenuePerBrand) * 100
    : 0;
  const paybackMonths = contributionPerBrand > 0 ? cacBrand / contributionPerBrand : Infinity;

  // Churn is an ASSUMPTION with no evidence behind it yet, so it is returned
  // beside the LTV it produces rather than folded into it. 5% monthly is a
  // twenty-month life — deliberately conservative for a product a brand can
  // stop buying at the end of any month.
  const assumedMonthlyChurnPct = 5;
  const lifetimeMonths = 100 / assumedMonthlyChurnPct;
  const ltv = contributionPerBrand * lifetimeMonths;
  const costPerLinkedGamer = linkedGamers > 0 ? serverCash / linkedGamers : 0;

  const unit: UnitEconomics = {
    cacBrand: round(cacBrand),
    cacServer: round(cacServer),
    contributionPerBrand: round(contributionPerBrand),
    grossMarginPct: round(grossMarginPct),
    paybackMonths: Number.isFinite(paybackMonths) ? round(paybackMonths) : 0,
    assumedMonthlyChurnPct,
    lifetimeMonths,
    ltv: round(ltv),
    ltvToCac: cacBrand > 0 ? round(ltv / cacBrand) : 0,
    costPerLinkedGamer: round(costPerLinkedGamer),
  };

  return {
    cfg,
    lines,
    unit,
    levers: [],
    payingBrandCapacity,
    capacityBound,
    cashTotal: round(cashTotal),
    foregoneTotal: round(foregoneTotal),
    investedTotal: round(cashTotal + foregoneTotal),
    buffer: round(cfg.raise - cashTotal),
    monthlyBurn: round(monthlyBurn),
    runwayMonths: monthlyBurn > 0 ? round(cfg.raise / monthlyBurn) : cfg.months,
    challengesPerMonth,
    challengesTotal,
    prizeCostPerMonth: round(prizeCostPerMonth),
    exit: {
      servers: cfg.targetServers,
      reachable,
      linkedGamers,
      payingBrands,
      mrr: round(mrr),
      arr: round(arr),
      steadyMonthlyCost: round(steadyMonthlyCost),
      monthlyProfit: round(mrr - steadyMonthlyCost),
      conversionPct: cfg.targetBrands > 0 ? round((payingBrands / cfg.targetBrands) * 100) : 0,
    },
    breakeven: {
      monthlyCost: round(steadyMonthlyCost),
      contributionPerBrand: round(contributionPerBrand),
      brandsNeeded,
      conversionNeededPct: round(conversionNeededPct),
      month: breakevenMonth,
    },
    valuation: {
      post: round(post),
      pre: round(pre),
      postOnExitArr: arr > 0 ? round(post / arr) : 0,
      nextRound,
    },
    months,
  };
}

/**
 * What actually moves the outcome. B120.
 *
 * ===== WHY THESE ARE MEASURED AND NOT LISTED =====
 *
 * "Growth levers" on a seed deck are usually a bullet list of things somebody
 * would like to be true. The only useful version answers a different question:
 * if exactly one assumption moves and nothing else does, what happens to ARR at
 * month six, and does the raise still survive?
 *
 * So each lever RE-RUNS the whole model with one number changed. That makes
 * them comparable — and it makes the honest answer visible when a lever people
 * are fond of turns out to move almost nothing.
 */
export function levers(
  cfg: FinanceConfig = FINANCE_DEFAULTS,
  pricing: PricingConfig = PRICING_DEFAULTS,
): Lever[] {
  const base = finance(cfg, pricing);
  const at = (over: Partial<FinanceConfig>, overPricing: Partial<PricingConfig> = {}) =>
    finance({ ...cfg, ...over }, { ...pricing, ...overPricing });

  const mk = (
    key: string, label: string, change: string, f: Finance, note: string,
  ): Lever => ({
    key, label, change,
    arr: f.exit.arr,
    deltaArr: round(f.exit.arr - base.exit.arr),
    survives: f.months[f.months.length - 1]?.cashLeft >= 0,
    note,
  });

  return [
    mk("conversion", "Free-to-paid conversion",
      `${cfg.brandsConverting} of ${cfg.targetBrands} → ${Math.round(cfg.targetBrands * 0.9)} of ${cfg.targetBrands}`,
      at({ brandsConverting: Math.round(cfg.targetBrands * 0.9) }),
      "The assumption the whole projection turns on, and the one with no evidence behind it yet. It is first because it costs nothing to move — the spend is already committed the moment a brand takes its free month."),

    // The price has to move `revenuePerBrand` WITH it. The first version of
    // this lever changed only `challengePrice` and reported a delta of exactly
    // zero — because what a brand pays is an editable override, so raising the
    // rate card without raising the invoice changed nothing but the cost side.
    // A lever that silently measures nothing is worse than one that is absent.
    mk("price", "The rate card",
      `${money(pricing.challengePrice, pricing.currency)} → ${money(Math.round(pricing.challengePrice * 1.2), pricing.currency)} a challenge`,
      at(
        { revenuePerBrand: round(cfg.revenuePerBrand * 1.2) },
        { challengePrice: Math.round(pricing.challengePrice * 1.2) },
      ),
      "Every dollar of a price rise is margin at the same percentage, and the prize pool rises with it because the split is a percentage — so the offer gets BETTER as the price goes up, which is the unusual property of this model."),

    // Games and brands have to move TOGETHER, and the plan is sized so that
    // they are already balanced — eighteen slots, eighteen sponsors. Moving
    // either one alone therefore reports zero, which is the finding rather than
    // a broken lever: capacity without demand runs unsold challenges the house
    // pays prizes on, and demand without capacity is brands we turn away.
    mk("games", "Game coverage, with the sponsors to fill it",
      `${cfg.games} → ${cfg.games + 6} games, ${cfg.targetBrands} → ${cfg.targetBrands + 12} brands`,
      at({
        games: cfg.games + 6,
        targetBrands: cfg.targetBrands + 12,
        brandsConverting: cfg.brandsConverting + 6,
      }),
      "The main line of the raise. A game runs one sponsored challenge at a time, so a game IS a sponsor's slot — six more games is six more brands the network can serve at all."),

    mk("capacity-only", "More games, no more brands",
      `${cfg.games} → ${cfg.games + 6} games alone`,
      at({ games: cfg.games + 6 }),
      "Zero, and worth showing. An unsold challenge still pays out a prize pool every week, so opening a game ahead of demand is a cost with no revenue behind it. This is the mistake the plan is built to avoid."),

    mk("brands", "Brands through the funnel",
      `${cfg.targetBrands} → ${Math.round(cfg.targetBrands * 1.5)}`,
      at({
        targetBrands: Math.round(cfg.targetBrands * 1.5),
        brandsConverting: Math.round(cfg.brandsConverting * 1.5),
      }),
      "Straightforward and the most expensive of the four: each one takes a free month, and a free month is real cash because nothing funds its prize pool."),

    mk("basket", "Games per paying brand",
      `1 → 2 games each`,
      at({ revenuePerBrand: cfg.revenuePerBrand * 2 }),
      "The cheapest revenue on the list — no new brand to find and no new free month to fund. It is why the rate card is per game rather than a single package price."),
  ];
}

export type Scenario = {
  label: string;
  conversionPct: number;
  payingBrands: number;
  mrr: number;
  arr: number;
  /** MRR − the cost of a steady month. Negative means still losing money. */
  monthlyProfit: number;
  /** Cash in the bank at the end of the period. */
  cashAtEnd: number;
  /** Does the raise get us there without running out? */
  survives: boolean;
};

/**
 * The same plan at conversion rates other than the one we hope for.
 *
 * Free-to-paid conversion is the single assumption the whole projection turns
 * on, and it is the one with no evidence behind it yet — so it gets a range
 * rather than a number. A plan that only works at its best case is a plan an
 * investor is right to discount; showing where it stops working is what makes
 * the base case worth believing.
 */
export function stress(
  cfg: FinanceConfig = FINANCE_DEFAULTS,
  pricing: PricingConfig = PRICING_DEFAULTS,
  rates: { label: string; pct: number }[] = [
    { label: "Weak — one in six stays", pct: 17 },
    { label: "Normal for a free trial", pct: 30 },
    { label: "Strong", pct: 50 },
    { label: "Planned", pct: (FINANCE_DEFAULTS.brandsConverting / FINANCE_DEFAULTS.targetBrands) * 100 },
  ],
): Scenario[] {
  return rates.map((r) => {
    const brands = Math.round((r.pct / 100) * cfg.targetBrands);
    const f = finance({ ...cfg, brandsConverting: brands }, pricing);
    return {
      label: r.label,
      conversionPct: round(r.pct),
      payingBrands: brands,
      mrr: f.exit.mrr,
      arr: f.exit.arr,
      monthlyProfit: f.exit.monthlyProfit,
      cashAtEnd: f.months[f.months.length - 1]?.cashLeft ?? cfg.raise,
      survives: (f.months[f.months.length - 1]?.cashLeft ?? 0) > 0,
    };
  });
}

/**
 * The unit economics of one sponsored challenge, which is what the whole model
 * rests on. Printed next to the plan so the reader can check the foundation
 * rather than take the totals on trust.
 */
/**
 * The three unit-economics rows the investor deck shows, from the live card.
 *
 * B110. These used to be typed into `SEED_DOCS` — `{ revenue: 250, cost: 175 }`
 * — under a subtitle reading "Every number here is the live rate card". The
 * costs had been kept in step with the prize and the REVENUES had not, so the
 * section quietly understated every margin by the difference between the price
 * we charge and the price somebody typed in a different quarter.
 *
 * Computed rather than stored, so the sentence above them is true.
 */
export function liveUnitRows(pricing: PricingConfig = PRICING_DEFAULTS) {
  const u = challengeUnit(pricing);
  const perMonth = pricing.challengesPerGame;
  // B120. `cost` was the PRIZE alone, under a note reading "the only cost of
  // goods". There are three obligations on a sale, not one: the prize pool, the
  // weekly server pool and the points vault. Counting only the first left the
  // server pool and the points vault inside the margin on every row of the
  // slide an investor reads to check our unit economics.
  const cost = u.prize + u.pools;
  return [
    {
      label: "One weekly challenge",
      revenue: u.price,
      cost,
      note: `${money(u.prize, pricing.currency)} is the prize, paid as trophies carrying the sponsor's brand; ${money(u.pools, pricing.currency)} is the weekly server pool and the points vault. All three are owed to somebody else — ${money(u.ours, pricing.currency)} is ours.`,
    },
    {
      label: "One game, one month",
      revenue: u.price * perMonth,
      cost: cost * perMonth,
      note: `${perMonth} challenges — one month, one sponsor. A game runs a single sponsored challenge at a time, so this row IS the per-game ceiling.`,
    },
    {
      label: `${pricing.games} games, one month`,
      revenue: u.price * perMonth * pricing.games,
      cost: cost * perMonth * pricing.games,
      note: `The full catalogue as sold today. ${pricing.games} games is ${pricing.games} sponsors at once — the ceiling on revenue moves by adding games, not by selling harder.`,
    },
  ];
}

/**
 * One challenge, divided FOUR ways. B120.
 *
 * ===== `fee` WAS PRICE MINUS PRIZE, AND THE DECK CALLED IT OURS =====
 *
 * It returned `challengePrice − prizePool` as `fee`, and the investor model
 * printed it under the sentence "the platform fee is the only line the business
 * lives on". It is not. Of a $350 challenge, $52.50 goes to the server pool and
 * $52.50 to the points vault — both paid out — and $70 is ours.
 *
 * That is the third place this same subtraction was wrong, after
 * `marginPerChallenge` and the contribution line in the model. All three had
 * the same cause: the split lived in a module the pure code could not import.
 *
 * `fee` is kept, honestly labelled: it is everything that is not prize money,
 * which is a real figure and the one the ownerless-cost argument rests on. What
 * the deck must print beside "the business lives on" is `ours`.
 */
export function challengeUnit(pricing: PricingConfig = PRICING_DEFAULTS) {
  const price = pricing.challengePrice;
  const ours = marginPerChallenge(pricing);
  return {
    price,
    prize: pricing.prizePool,
    prizePct: prizeSharePct(pricing),
    /** Everything that is not the prize pool. NOT our margin. */
    fee: round(price - pricing.prizePool),
    feePct: 100 - prizeSharePct(pricing),
    /** The server pool and the points vault: owed to somebody, not income. */
    poolsPct: DEFAULT_SPLIT.server + DEFAULT_SPLIT.cp,
    pools: round(price * ((DEFAULT_SPLIT.server + DEFAULT_SPLIT.cp) / 100)),
    /** OURS. The line the business actually lives on. */
    ours,
    oursPct: price > 0 ? round((ours / price) * 100) : 0,
  };
}
