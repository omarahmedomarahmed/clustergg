import { PRICING_DEFAULTS, prizeSharePct, type PricingConfig } from "@/lib/pricing";

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
  /** What a paying brand pays a month: base + one game of challenges. */
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
  /** Games we operate challenges on. */
  games: number;
  /** Challenges per game per month. One a week. */
  challengesPerGamePerMonth: number;
  /**
   * Does a brand's sponsored challenge REPLACE one we were running anyway?
   *
   * The pricing calls it naming rights: that game's weekly challenge carries
   * your brand. Read that way, selling a challenge adds revenue and no cost —
   * the prize was already funded. If instead every sponsored challenge is an
   * extra competition, each one adds a prize pool. The answer moves the budget
   * by tens of thousands, so it is a switch rather than a silent assumption.
   */
  sponsorsUseHouseInventory: boolean;

  // ===== Everything else =====
  /** Infrastructure, game-API access, partnerships, tooling — for the period. */
  techBudget: number;
  /** People. */
  hires: number;
  hireMonthlyCost: number;
};

export const FINANCE_DEFAULTS: FinanceConfig = {
  raise: 100_000,
  equityPct: 20,
  months: 6,

  targetBrands: 30,
  freeChallengesPerBrand: 4,
  brandsConverting: 25,
  revenuePerBrand: 1_500,

  targetServers: 1_000,
  welcomeChallengeCost: 25,
  membersPerServer: 1_000,
  linkedPerServer: 10,

  games: 6,
  challengesPerGamePerMonth: 4,
  sponsorsUseHouseInventory: true,

  techBudget: 10_000,
  hires: 4,
  hireMonthlyCost: 416,
};

export const FINANCE_NUMBER_KEYS = (Object.keys(FINANCE_DEFAULTS) as (keyof FinanceConfig)[])
  .filter((k) => k !== "sponsorsUseHouseInventory")
  .map((k) => `finance.${k}`);

export const FINANCE_CMS_KEYS = [...FINANCE_NUMBER_KEYS, "finance.sponsorsUseHouseInventory"];

/** Read a CMS content map into a config. Anything missing or unparseable keeps
 *  its default rather than rendering a NaN on an investor's screen. */
export function buildFinance(content: Record<string, string> = {}): FinanceConfig {
  const out = { ...FINANCE_DEFAULTS };
  for (const key of Object.keys(FINANCE_DEFAULTS) as (keyof FinanceConfig)[]) {
    const raw = content[`finance.${key}`];
    if (raw === undefined || raw === "") continue;
    if (key === "sponsorsUseHouseInventory") {
      out[key] = raw !== "false" && raw !== "0";
      continue;
    }
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

  /** Month-by-month, so the shape of the plan is visible rather than asserted. */
  months: FinanceMonth[];
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
  const prizeCostPerMonth = challengesPerMonth * prize;
  const prizeCostTotal = challengesTotal * prize;

  // The free first month. Under naming rights the challenge was already funded,
  // so what it costs is the invoice we don't send. If instead each sponsored
  // challenge is an additional competition, the prize money is additional too.
  const freeChallenges = cfg.targetBrands * cfg.freeChallengesPerBrand;
  const brandOfferForegone = freeChallenges * price;
  const brandOfferCash = cfg.sponsorsUseHouseInventory ? 0 : freeChallenges * prize;

  const serverCash = cfg.targetServers * cfg.welcomeChallengeCost;
  const teamCash = cfg.hires * cfg.hireMonthlyCost * cfg.months;

  const lines: FundLine[] = [
    {
      key: "prizes",
      label: "Prize pools — the competitions themselves",
      formula: `${cfg.games} games × ${cfg.challengesPerGamePerMonth} challenges × ${cfg.months} months × $${prize}`,
      cash: prizeCostTotal,
      foregone: 0,
      note: "Every challenge on the network pays out, sponsored or not. This is what keeps something worth entering live in every game, every week — the inventory a brand is later sold.",
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
      note: cfg.sponsorsUseHouseInventory
        ? "Naming rights on challenges we were already running and already paying for, so the cost is the invoice we don't send rather than money out."
        : "Each sponsored challenge runs as an additional competition, so its prize pool is additional cash as well as an unsent invoice.",
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
  const reachable = cfg.targetServers * cfg.membersPerServer;
  const linkedGamers = cfg.targetServers * cfg.linkedPerServer;
  const mrr = cfg.brandsConverting * cfg.revenuePerBrand;

  // A steady month once acquisition stops: we still run the network and still
  // pay people. Server onboarding and the free months are one-off by design.
  const steadyMonthlyCost = prizeCostPerMonth + (cfg.techBudget / cfg.months) + (cfg.hires * cfg.hireMonthlyCost);

  // ===== Breakeven =====
  //
  // Contribution per brand is revenue minus the cost of serving that brand.
  // Under naming rights there is no per-brand prize cost — the challenge runs
  // either way — so the whole invoice contributes, and prize money sits in the
  // fixed cost base above. That is the honest structure, and it is also why
  // breakeven is reached with a normal conversion rate rather than a heroic one.
  const perBrandPrizeCost = cfg.sponsorsUseHouseInventory ? 0 : cfg.freeChallengesPerBrand * prize;
  const contributionPerBrand = Math.max(1, cfg.revenuePerBrand - perBrandPrizeCost);
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
    const payingBrands = Math.round(brandsOnboardedLastMonth * convRate);
    const monthMrr = payingBrands * cfg.revenuePerBrand;

    const spend = prizeCostPerMonth
      + serversAdded * cfg.welcomeChallengeCost
      + (cfg.techBudget / cfg.months)
      + cfg.hires * cfg.hireMonthlyCost
      + (brandsOnboardedByNow - brandsOnboardedLastMonth) * (cfg.sponsorsUseHouseInventory ? 0 : cfg.freeChallengesPerBrand * prize);

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

  return {
    cfg,
    lines,
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
      payingBrands: cfg.brandsConverting,
      mrr: round(mrr),
      arr: round(arr),
      steadyMonthlyCost: round(steadyMonthlyCost),
      monthlyProfit: round(mrr - steadyMonthlyCost),
      conversionPct: cfg.targetBrands > 0 ? round((cfg.brandsConverting / cfg.targetBrands) * 100) : 0,
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
export function challengeUnit(pricing: PricingConfig = PRICING_DEFAULTS) {
  const fee = pricing.challengePrice - pricing.prizePool;
  return {
    price: pricing.challengePrice,
    prize: pricing.prizePool,
    prizePct: prizeSharePct(pricing),
    fee,
    feePct: 100 - prizeSharePct(pricing),
  };
}
