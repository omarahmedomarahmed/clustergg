import { PRICING_DEFAULTS, type PricingConfig } from "@/lib/pricing";

// The commercial argument, as data.
//
// Every claim on a brand-facing page, in the deck and in the partner profile
// comes from here. Two reasons that matters more than it looks:
//
//   * A comparison table on the pricing page and a slide in the deck that say
//     different things about the same competitor is the fastest way to lose a
//     room. One source, rendered twice.
//   * These are claims about other people's businesses. Keeping them in one
//     reviewable file — rather than scattered through JSX — is what makes them
//     auditable before they ship.
//
// The language here is deliberately B2B. Gamers and server owners get the
// gaming voice; a brand's marketing director gets the language they use in
// their own planning documents.

// ===== Who a brand is actually choosing between =====

export type Competitor = {
  key: string;
  name: string;
  note: string;
  /** Us. Rendered as the column that wins. */
  ours?: boolean;
};

export const COMPETITORS: Competitor[] = [
  { key: "cluster", name: "Cluster", note: "Software. One subscription.", ours: true },
  { key: "bots", name: "Giveaway bots", note: "Free Discord bots run by the server itself" },
  { key: "platforms", name: "Tournament platforms", note: "Brackets, check-in, admins" },
  { key: "agencies", name: "Esports agencies", note: "Custom activations, per campaign" },
];

/** `yes` full, `part` partial with a caveat, `no` absent. */
export type Verdict = "yes" | "part" | "no";

export type Capability = {
  label: string;
  /** What a brand is really asking when they ask for this. */
  why: string;
  by: Record<string, Verdict>;
  /** Shown under a `part` verdict on the column it belongs to. */
  caveat?: Record<string, string>;
};

export const CAPABILITIES: Capability[] = [
  {
    label: "Reaches gamers inside Discord",
    why: "Where the audience already is, rather than a site you have to send them to.",
    by: { cluster: "yes", bots: "yes", platforms: "no", agencies: "part" },
    caveat: { agencies: "Usually by paying a creator to mention you." },
  },
  {
    label: "Results verified against the game's API",
    why: "The scoreboard cannot be edited by a participant or by the community running it.",
    by: { cluster: "yes", bots: "no", platforms: "part", agencies: "part" },
    caveat: { platforms: "Match results are usually reported by players and settled by admins." },
  },
  {
    label: "Brand creative rendered into the product",
    why: "Placement inside the thing people came for, not next to it.",
    by: { cluster: "yes", bots: "no", platforms: "part", agencies: "no" },
    caveat: { platforms: "Logo on a bracket page." },
  },
  {
    label: "Runs every week without you",
    why: "Sponsorship as a subscription, not a project with a launch date.",
    by: { cluster: "yes", bots: "part", platforms: "no", agencies: "no" },
    caveat: { bots: "Only while the server's own staff keep running it." },
  },
  {
    label: "Prize money funded and paid by the vendor",
    why: "No prize administration, tax paperwork or payout disputes on your side.",
    by: { cluster: "yes", bots: "no", platforms: "no", agencies: "part" },
  },
  {
    label: "No staff, venue or production required",
    why: "The cost line that turns a $250 activation into a $25,000 one.",
    by: { cluster: "yes", bots: "yes", platforms: "no", agencies: "no" },
  },
  {
    label: "Impression and click reporting",
    why: "The numbers your media plan is measured on.",
    by: { cluster: "yes", bots: "no", platforms: "part", agencies: "part" },
    caveat: { platforms: "Page views, not placement-level delivery." },
  },
  {
    label: "Published price",
    why: "You can decide without three meetings.",
    by: { cluster: "yes", bots: "yes", platforms: "part", agencies: "no" },
  },
];

// ===== The no-operations argument =====
//
// The single most important thing to communicate to an investor and to a
// brand, and the thing most easily lost in a sentence: Cluster is not a
// tournament organiser. There is no staff rota, no venue, no production
// crew and no match admin, because the competition is scored by reading each
// game's own API on a schedule.

export type CostLine = { label: string; pct: number; note: string };

/** Where a sponsorship dollar goes at a traditional activation vs here. */
export const OPS_SPLIT: { key: string; title: string; sub: string; lines: CostLine[] }[] = [
  {
    key: "traditional",
    title: "A produced tournament",
    sub: "Staff, venue, production, admin — before a single prize is paid",
    lines: [
      { label: "Production & venue", pct: 35, note: "Stage, stream crew, kit, space" },
      { label: "Staff & match admins", pct: 30, note: "People running brackets and disputes" },
      { label: "Marketing & sign-up", pct: 15, note: "Filling the bracket" },
      { label: "Prize money", pct: 20, note: "What the players actually receive" },
    ],
  },
  {
    key: "cluster",
    title: "A Cluster challenge",
    sub: "Software reads the game's API. Nobody is in a room.",
    lines: [
      { label: "Prize money", pct: 70, note: "Paid straight to the winners" },
      { label: "Platform", pct: 30, note: "Hosting, APIs, rendering, support" },
    ],
  },
];

// ===== Engineering, for the people who ask about it =====
//
// A brand does not read this. A technical due-diligence call opens with it.

export type TechProof = { key: string; title: string; body: string; metric: string; metricLabel: string };

export function techProof(cfg: PricingConfig = PRICING_DEFAULTS): TechProof[] {
  return [
    {
      key: "renderer",
      title: "The card renderer",
      body: "Every response the bot gives is a 1200×630 PNG composed on the server from live platform data — profile, leaderboard, challenge, planet. No headless browser, no design tool, no per-card artwork. Layouts are data, so staff move any element on any card without a deploy, and the sponsor box is one of those elements.",
      metric: "12",
      metricLabel: "card types, one engine",
    },
    {
      key: "verify",
      title: "Verified stats, not self-reported",
      body: "Accounts are linked through each game's own API and re-synced on a schedule. A challenge standing is derived from the same numbers the game itself reports, which is why a result cannot be argued with — and why a brand's activation cannot be gamed by its own audience.",
      metric: "24",
      metricLabel: "game integrations",
    },
    {
      key: "rotation",
      title: "Ad rotation inside the render",
      body: "Creatives are selected per card and per rotation window, interleaved so adjacent cards carry different brands, and cached per creative so a rotation costs nothing to serve. Delivery is written to the same analytics pipeline as the website placements.",
      metric: `${cfg.slotCount}`,
      metricLabel: "brands per rotation slot",
    },
    {
      key: "ops",
      title: "Zero-touch operations",
      body: "Challenges open, score and close on a schedule. Winners are decided by the data. Servers onboard themselves by installing a bot. There is no queue of work that grows with the number of communities, which is what makes the model scale without headcount.",
      metric: "0",
      metricLabel: "match admins employed",
    },
  ];
}

// ===== The loop that makes it compound =====
//
// Profile of the Week is not a feature list item. It is the reason a gamer
// sends their Cluster link to people who have never heard of us, every week,
// without being paid to.

export type LoopNode = { key: string; title: string; body: string };

export const WEEK_LOOP: LoopNode[] = [
  { key: "compete", title: "Every profile is entered", body: "Nobody signs up for it. If you have a Cluster profile you are in this week's competition." },
  { key: "share", title: "They ask their server to vote", body: "A vote has to come from a signed-in profile, so asking means bringing people in." },
  { key: "join", title: "New gamers arrive to vote", body: "They land on a profile, not a marketing page — and the fastest way to vote is to have one." },
  { key: "announce", title: "Sunday is announced everywhere", body: "The result is posted into every server on the network, with the sponsor on the card." },
  { key: "trophy", title: "Winners keep the trophy", body: "It sits on their profile permanently, branded by the sponsor who paid for that week." },
];

// ===== What a server's community earns =====
//
// Server owners are not paid a commission — the prize money goes to the
// gamers. So the number that matters to an owner is how much of the monthly
// prize pool their own members are in a position to win, and that rises with
// how many of them are connected.

export type EarnPoint = { gamers: number; share: number; monthly: number };
export type EarnCurve = { points: EarnPoint[]; field: number; pool: number };

/**
 * Expected monthly prize money reaching one server's members.
 *
 * A server's members win in proportion to how much of the connected field they
 * are, so the curve needs ONE field size for every point on it. Computing the
 * field per point — `max(thisPoint, network)` — was the obvious-looking version
 * and it produced a flat line at 100%: every server, at every size, came out as
 * the entire network. A chart that says a 100-gamer server wins as much as a
 * 5,000-gamer one is worse than no chart.
 *
 * So the field is the live network, or the top of the axis when the network is
 * still smaller than that — and the caller states which, because an assumption
 * a reader can't see is a claim.
 */
export function earnCurve(
  cfg: PricingConfig,
  networkGamers: number,
  points: number[] = [100, 250, 500, 1000, 2500, 5000],
): EarnCurve {
  const pool = cfg.games * cfg.challengesPerGame * cfg.prizePool;
  const field = Math.max(networkGamers, ...points);
  return {
    field,
    pool,
    points: points.map((gamers) => {
      const share = Math.min(1, gamers / field);
      return { gamers, share, monthly: Math.round(pool * share) };
    }),
  };
}
