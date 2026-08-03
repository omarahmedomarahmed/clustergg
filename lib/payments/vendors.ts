// Who moves the money.
//
// Cluster does not hold funds, does not touch a card number and does not store
// a bank account. Three flows of money exist, they have almost nothing in
// common, and pretending one vendor is good at all three is how platforms end
// up building payment infrastructure by accident:
//
//   COLLECT   Brands pay us. A handful of B2B invoices a month, $600–$5,000,
//             from companies anywhere. What matters is that a finance
//             department can pay it by card or bank transfer without an
//             account, and that the receipt is a real invoice.
//
//   PAYOUT    Server owners are paid their share. Recurring, named
//             counterparties, real amounts, tax reportable. What matters is
//             onboarding that collects THEIR bank details on the vendor's side
//             and a tax form we never see.
//
//   REWARDS   Gamers cash out trophies. High volume, small amounts, often
//             teenagers, often unbanked, anywhere on earth. What matters is
//             that the recipient picks how they want it — gift card, PayPal,
//             prepaid card, bank — without us collecting anything at all.
//
// Everything below is a note on a real vendor, kept as data so the admin
// console and `docs/PAYMENTS.md` describe the same set of options and cannot
// drift apart. `wired: true` means an adapter exists in this repo and lights up
// the moment its keys are set; the rest are documented so that choosing one
// later is a configuration decision rather than a rebuild.

export type Flow = "collect" | "payout" | "rewards";

export type Vendor = {
  key: string;
  name: string;
  /** Which of the three money flows this vendor is a candidate for. */
  flows: Flow[];
  /** One line: what it is. */
  what: string;
  /** Where it reaches. */
  coverage: string;
  /** What it costs us. */
  cost: string;
  /** What they ask for before you can send or receive a cent. */
  onboarding: string;
  /** Why it might be the answer. */
  strengths: string[];
  /** Why it might not be. Written honestly — a vendor list with no downsides is a brochure. */
  limits: string[];
  /** An adapter exists in lib/payments and turns on when the keys below are set. */
  wired: boolean;
  /** Environment variables the adapter needs. Never secrets in the database. */
  env: string[];
  /** Where to sign up. */
  url: string;
  /** Our call. */
  verdict: "recommended" | "alternative" | "fallback";
};

export const VENDORS: Vendor[] = [
  // ===== REWARDS — gamers cashing out trophies =====
  {
    key: "tremendous",
    name: "Tremendous",
    flows: ["rewards", "payout"],
    what: "A rewards and payouts API. You send an amount and an email; the recipient opens a hosted page and picks how they want it.",
    coverage: "200 countries, 2,000+ redemption options — bank transfer, PayPal, Venmo, prepaid Visa/Mastercard, and gift cards in local currency.",
    cost: "Free to use. No API fee, no setup fee, no subscription — you pay the face value of what you send. Cash-style options (PayPal, ACH, instant debit) carry a 4–6% fee, and every send must include at least one no-fee option so a gamer can always take the full amount.",
    onboarding:
      "A sandbox account and API key immediately, with nothing to sign — you can build the whole flow before you have a company. Production access is a short form. No contract, no minimum, no monthly.",
    strengths: [
      "The recipient chooses their own payout method on Tremendous's page, so we never ask a 16-year-old in Cairo for a routing number — the single biggest reason it fits trophy redemption.",
      "Gift cards mean somebody with no bank account and no PayPal can still be paid, which is most of a gaming audience.",
      "Sandbox is open with no approval, so the integration is testable end to end today.",
      "Nothing to store: we keep an order id and a redemption link, and both are useless to an attacker.",
    ],
    limits: [
      "Funding is prepaid — money has to sit in a Tremendous balance before rewards clear.",
      "Built for incentives rather than for payroll-scale recurring vendor payments; it will pay server owners, but it does not file tax forms for them.",
    ],
    wired: true,
    env: ["TREMENDOUS_API_KEY", "TREMENDOUS_FUNDING_SOURCE_ID", "TREMENDOUS_CAMPAIGN_ID", "TREMENDOUS_ENV"],
    url: "https://www.tremendous.com",
    verdict: "recommended",
  },

  // ===== PAYOUT — server owners =====
  {
    key: "trolley",
    name: "Trolley",
    flows: ["payout"],
    what: "Payout infrastructure for marketplaces and creator platforms: onboard a recipient, verify them, collect their tax form, pay them.",
    coverage: "210 countries and territories, local bank rails in most of them, recipient portal in 36 languages.",
    cost: "Per-payout pricing plus FX. Quoted, not published — assume a fee per payment and a spread on conversion.",
    onboarding:
      "A business account. They verify the paying entity, which is the trade-off for being allowed to send money to 210 countries under your own name.",
    strengths: [
      "The recipient's bank details are entered inside Trolley's own iframe widget, which is exactly the boundary we want: their data never crosses our servers, so there is nothing on our side to leak.",
      "Collects and e-files tax forms (W-9/W-8BEN) — a real problem for anyone paying server owners in dozens of countries, and one we should never build.",
      "Batch payments fit the monthly earnings cycle server owners are on.",
    ],
    limits: [
      "Business verification up front, so it is not the vendor you start with on day one.",
      "Pricing is a sales conversation, not a page.",
    ],
    wired: true,
    env: ["TROLLEY_ACCESS_KEY", "TROLLEY_SECRET_KEY", "TROLLEY_ENV"],
    url: "https://trolley.com",
    verdict: "recommended",
  },

  // ===== COLLECT — brands paying us =====
  {
    key: "stripe",
    name: "Stripe Invoicing",
    flows: ["collect"],
    what: "Hosted invoices and payment links. The brand gets a real invoice with a Pay button; cards, wallets and bank debits all work.",
    coverage: "Buyers anywhere. The SELLER has to be incorporated in one of ~46 supported countries.",
    cost: "About 2.9% + 30¢ on cards, plus an invoicing fee on some plans.",
    onboarding: "A company in a supported country, its registration documents, and a bank account in that country.",
    strengths: [
      "The best hosted invoice and checkout in the industry; nothing else makes a finance department's life easier.",
      "Payment links are one API call and need no integration on the buyer's side.",
    ],
    limits: [
      "The country list is the whole question. Stripe does not support sellers in Egypt or most of MENA, so this is only the answer once there is an entity somewhere it does support.",
      "You are the merchant of record: sales tax, VAT and chargebacks are yours.",
    ],
    wired: true,
    env: ["STRIPE_SECRET_KEY"],
    url: "https://stripe.com/invoicing",
    verdict: "alternative",
  },
  {
    key: "payoneer",
    name: "Payoneer — Request a Payment",
    flows: ["collect", "payout"],
    what: "You send a branded payment request; the client pays by card, ACH or local bank transfer and the money lands in your Payoneer balance.",
    coverage: "Get paid from 190+ countries in 70+ currencies, with local receiving accounts in USD, EUR, GBP and more.",
    cost: "Roughly 3% when the client pays by card, about 1% for ACH, and little or nothing for a local bank transfer.",
    onboarding:
      "An account plus identity and business documents — but Payoneer onboards individuals and small companies across MENA, Africa and South Asia, which is exactly the ground Stripe and most acquirers will not cover.",
    strengths: [
      "Works for a company that Stripe will not accept, which for a business operating out of Egypt is the entire decision.",
      "The buyer needs no Payoneer account — they get an invoice with a pay link, which is all a brand's finance team wants.",
      "Also sends payouts, so one relationship can cover both directions while volumes are small.",
    ],
    limits: [
      "No real API for issuing payment requests on the standard account — this is operated from their dashboard, which is why our adapter for it is the manual one: staff paste the link onto the invoice.",
      "Card acceptance costs more than a bank transfer, so large invoices should be steered to transfer.",
    ],
    wired: false,
    env: [],
    url: "https://www.payoneer.com/get-paid-by-clients/payment-request/",
    verdict: "recommended",
  },
  {
    key: "paddle",
    name: "Paddle",
    flows: ["collect"],
    what: "A merchant of record. Paddle sells to the customer, handles tax everywhere, and pays you a balance.",
    coverage: "Sells into 200+ countries. Accepts sellers in a long list including Egypt, and — unusually — accepts individuals with no company.",
    cost: "About 5% + 50¢, all-in, tax handled.",
    onboarding: "Light for a merchant of record: they carry the compliance because they are the merchant, not you.",
    strengths: [
      "Removes global sales tax and VAT as a problem entirely.",
      "One of the very few options open to a seller with no registered company.",
    ],
    limits: [
      "Their acceptable-use policy is built around software and digital products and is restrictive about services. Advertising and media buying is what Cluster sells, and a merchant of record can decline it — check this before building on it, not after.",
      "5% is the most expensive way to collect a $600 invoice.",
    ],
    wired: false,
    env: [],
    url: "https://www.paddle.com",
    verdict: "alternative",
  },
  {
    key: "wise",
    name: "Wise Business",
    flows: ["collect", "payout"],
    what: "Multi-currency business account with local account details in several currencies, plus batch payouts.",
    coverage: "Around 70 countries to hold and send from; receives local transfers in USD, EUR, GBP, AUD and more.",
    cost: "The cheapest FX of anything on this list — mid-market rate plus a small fixed spread.",
    onboarding: "Business verification. Not available to companies registered in every country.",
    strengths: [
      "Unbeatable conversion cost, which matters when the money comes in USD and goes out in a dozen currencies.",
      "Local receiving details make a brand's bank transfer domestic on their side.",
    ],
    limits: [
      "No hosted invoice-with-card-payment flow — a brand transfers, they do not click Pay.",
      "Payout automation is thin next to Trolley.",
    ],
    wired: false,
    env: [],
    url: "https://wise.com/business",
    verdict: "alternative",
  },
  {
    key: "dots",
    name: "Dots",
    flows: ["payout"],
    what: "Payout API covering 190+ countries and 300 rails, with hosted onboarding.",
    coverage: "190+ countries, 150 currencies.",
    cost: "Per-payout, quoted.",
    onboarding: "Business account and verification.",
    strengths: ["Very wide rail coverage.", "Hosted recipient onboarding, same boundary as Trolley."],
    limits: ["Smaller and younger than Trolley.", "Tax compliance is less complete."],
    wired: false,
    env: [],
    url: "https://usedots.com",
    verdict: "alternative",
  },

  // ===== The one that always works =====
  {
    key: "manual",
    name: "Manual / any provider",
    flows: ["collect", "payout", "rewards"],
    what:
      "Not a vendor — the escape hatch. Staff paste a payment link from whatever provider they used, or send a payout by hand, and record the reference against the record here.",
    coverage: "Everywhere, because it is whatever you already have: a Payoneer request, a Wise transfer, a bank wire, cash.",
    cost: "Whatever that provider charges.",
    onboarding: "None. This is the default and it needs no keys at all.",
    strengths: [
      "The billing and payout cycle is complete and usable on day one with no vendor relationship whatsoever.",
      "Nothing about it is throwaway: switching to a real provider changes which adapter runs, not a single page or table.",
      "Covers the vendors that have no API worth integrating — Payoneer payment requests being the obvious one.",
    ],
    limits: [
      "Somebody has to press the buttons.",
      "Reconciliation is a human reading a bank statement, so mark-paid is a claim rather than a confirmation.",
    ],
    wired: true,
    env: [],
    url: "",
    verdict: "fallback",
  },
];

export function vendorsFor(flow: Flow): Vendor[] {
  return VENDORS.filter((v) => v.flows.includes(flow));
}

export function vendorBy(key: string): Vendor | null {
  return VENDORS.find((v) => v.key === key) ?? null;
}

/**
 * The short version, for anyone who does not want to read the table.
 *
 * Stated as a recommendation rather than a menu because "it depends" is not
 * useful to somebody who has to pick one this week.
 */
export const RECOMMENDATION = {
  collect: "payoneer",
  payout: "trolley",
  rewards: "tremendous",
} as const;

export const RECOMMENDATION_WHY: Record<Flow, string> = {
  collect:
    "Brands are invoiced, not checked out. Payoneer issues a payment request a finance department can pay by card or local transfer from 190 countries, and — the part that decides it — it onboards companies that Stripe will not, which is the difference between billing being possible and not. Move to Stripe Invoicing the day there is an entity Stripe supports; the invoice pages here do not change either way.",
  payout:
    "Server owners are named counterparties paid every month, so the two things that matter are that they enter their bank details on somebody else's page and that their tax form is somebody else's problem. Trolley does both, in 210 countries, inside an iframe.",
  rewards:
    "A gamer redeeming a trophy is the hardest payment in the product: small, global, and often to someone with no bank account. Tremendous is the only one that solves it by not asking — we send an amount, they open a link and choose a gift card, PayPal or a transfer themselves. It is free, and the sandbox needs no approval, so it is also the one we can finish today.",
};
