// The screenshot system: which components are worth proving, and how a page
// claims one.
//
// The rule this exists to enforce: **no claim on the website without a real
// screenshot of the real feature behind it.** A marketing page that says
// "counted reach, not projections" should be standing next to a picture of the
// actual reach table, taken from the actual product.
//
// Three pieces:
//
//   SHOT_REGISTRY   — this file. Every key, what it proves, where to capture it.
//   feature_shots   — one row per key: the image, the caption, the alt text.
//   <FeatureShot/>  — what a page renders. Reads the row by key.
//
// A key is a **component**, not a page. `server.earnings.ledger` appears on the
// marketing page, in the deck and in the data room; all three read one row, so
// an admin who replaces that one image has replaced it in all three places.
// That is the whole design.
//
// ⚠ THE IMAGES IN `public/shots/` ARE PROVISIONAL.
//
// The capture pass ran in wave 1, which is earlier than the plan's ordering
// intends (§1.1). Most of these shots are pictures of a product still being
// changed: B23 rewrites the marketing pages, B41 replaces the homepage, B2 puts
// the coin on every CP figure, B27 changes every bot card's buttons, B34
// reprices the currency. A full recapture is owed once Part I closes — see V1.R
// in docs/EXECUTION_PLAN.md.
//
// Do NOT recapture piecemeal in the meantime. A visibly stale shot between now
// and then is expected, and refreshing one mid-item is the waste the single-pass
// ordering exists to avoid. Keep placing new slots as pages are touched and
// leave them EMPTY — a visible placeholder is the component doing its job.
//
// Everything here is admin-editable at /admin/shots: the picture, the caption,
// the alt text. Including keys that have never been captured — those render a
// visible labelled placeholder rather than a gap, so a missing shot is obvious
// instead of silently absent, and an admin can upload one at any time without a
// developer.

export type ShotDef = {
  /** Stable key. Never rename one — every page and every registry row uses it. */
  key: string;
  /** The claim this shot is being used to support. Shown to admins, never to visitors. */
  claim: string;
  /** Where a capture run should point its browser. */
  capturedFrom: string;
  /** Which part of the product it belongs to, for grouping the admin console. */
  group: "gamer" | "server" | "brand" | "admin" | "bot" | "marketing";
  /** Who has to be signed in for the capture to show anything. */
  as?: "guest" | "gamer" | "admin" | "server" | "brand";
  /** A CSS selector to crop to. Absent means the whole viewport. */
  selector?: string;
  /**
   * Text on the control that has to be clicked before `selector` exists.
   *
   * Some evidence lives behind an accordion — the League rank grid is inside a
   * collapsed account row. Naming the control beats having the capture script
   * click every button on the page hoping one of them opens the right thing,
   * which is what it did first and which closed the row it had just opened.
   */
  openText?: string;
};

/**
 * The keys that actually have a file in `public/shots/` (B18, found the hard way).
 *
 * `seedFeatureShots` wrote `/shots/<key>.jpg` for EVERY registry key regardless
 * of whether the file existed, so a registered-but-uncaptured slot rendered a
 * BROKEN IMAGE — a full-height box showing alt text — instead of the labelled
 * placeholder it was designed to show. Eight slots were in that state: every one
 * placed since B47, which is precisely the set the "place slots and leave them
 * EMPTY" rule created.
 *
 * A list rather than a filesystem check: `public/` is not reliably readable from
 * a serverless function, and this has to be right in production, not only
 * locally. **V1.R adds every key it captures to this list** — a shot that is not
 * here renders as a placeholder, which is the correct and visible default.
 */
export const CAPTURED_SHOT_KEYS = new Set<string>([
  "admin.challenge.rules",
  "admin.payments.providers",
  "admin.shots.console",
  "bot.card.challenge",
  "bot.card.market",
  "bot.card.profile",
  "brand.analytics.roas",
  "brand.campaign.builder",
  "brand.invoice",
  "brand.reach.perserver",
  "gamer.cp.ledger",
  "gamer.feed.dashboard",
  "gamer.leaderboard.rank",
  "gamer.linked.verified",
  "gamer.lol.card",
  "gamer.marketplace.shelf",
  "gamer.planet.page",
  "gamer.profile.public",
  "gamer.quest.map",
  "gamer.redeem.method",
  "nav.badges",
  "nav.potw.expanded",
  "planet.completed.standings",
  "server.earnings.ledger",
  "server.growth.journey",
  "server.members.winnings",
  "server.payout.history",
  "server.tier.flagship",
]);

// Ordered by group, then by how early a visitor meets it.
export const SHOT_REGISTRY: ShotDef[] = [
  // ---- The gamer ----
  { key: "gamer.profile.public", group: "gamer", claim: "A profile worth sharing", capturedFrom: "/u/nova", as: "guest" },
  // B17. Registered and left empty until V1.R.
  { key: "gamer.cp.capped", group: "gamer", claim: "Capped, and told plainly", capturedFrom: "/quests", as: "gamer" },
  // B18. Registered and left empty until V1.R.
  { key: "gamer.wallet", group: "gamer", claim: "Your points, your trophies, what they are worth", capturedFrom: "/wallet", as: "gamer" },
  { key: "gamer.wallet.ledger", group: "gamer", claim: "Every point accounted for", capturedFrom: "/wallet", as: "gamer" },
  { key: "gamer.linked.verified", group: "gamer", claim: "Every account is verified against the game's own API", capturedFrom: "/u/nova", as: "guest", selector: "[data-shot='linked-accounts']" },
  { key: "gamer.lol.card", group: "gamer", claim: "Your rank, in the game's own words", capturedFrom: "/u/nova", as: "guest", selector: "[data-shot='lol-card']", openText: "League of Legends" },
  { key: "gamer.cp.ledger", group: "gamer", claim: "Every point is accounted for", capturedFrom: "/quests", as: "gamer" },
  { key: "gamer.quest.map", group: "gamer", claim: "Quests you actually travel", capturedFrom: "/quests", as: "gamer" },
  { key: "gamer.marketplace.shelf", group: "gamer", claim: "Spend points on real trophies", capturedFrom: "/marketplace", as: "gamer" },
  { key: "gamer.redeem.method", group: "gamer", claim: "Cash out without giving us your bank", capturedFrom: "/feed", as: "gamer" },
  { key: "gamer.feed.dashboard", group: "gamer", claim: "Build the dashboard you want to look at", capturedFrom: "/feed", as: "gamer" },
  { key: "gamer.leaderboard.rank", group: "gamer", claim: "Ranked against everyone who plays it", capturedFrom: "/leaderboards", as: "guest" },
  { key: "gamer.planet.page", group: "gamer", claim: "A planet per game, with its own world", capturedFrom: "/planets", as: "guest" },

  // ---- The server owner ----
  { key: "server.tier.flagship", group: "server", claim: "Owners take 25% at 5,000 linked", capturedFrom: "/servers", as: "guest" },
  { key: "server.earnings.ledger", group: "server", claim: "Every line itemised", capturedFrom: "/servers/demo-guild-nebula-1?key=DEMO-DNEBULA1", as: "server", openText: "Earnings" },
  { key: "server.members.winnings", group: "server", claim: "Your members' winnings, paid to them", capturedFrom: "/servers/demo-guild-nebula-2?key=DEMO-DNEBULA2", as: "server", openText: "Server board" },
  { key: "server.growth.journey", group: "server", claim: "A ladder you can see yourself climbing", capturedFrom: "/servers/demo-guild-nebula-3?key=DEMO-DNEBULA3", as: "server" },
  { key: "server.payout.history", group: "server", claim: "Paid, in flight, awaiting — all visible", capturedFrom: "/servers/demo-guild-nebula-1?key=DEMO-DNEBULA1", as: "server", openText: "Earnings" },
  // B47. Registered and left empty until V1.R, like every slot placed from here.
  { key: "server.profile.incomplete", group: "server", claim: "A server we cannot describe is a server we cannot sell", capturedFrom: "/servers/demo-guild-nebula-1?key=DEMO-DNEBULA1", as: "server", selector: "#server-profile" },

  // ---- The brand ----
  { key: "brand.reach.perserver", group: "brand", claim: "Counted reach, not projections", capturedFrom: "/brands/nebulatech?key=DEMO-NEBULATECH", as: "brand", openText: "Challenges" },
  { key: "brand.invoice", group: "brand", claim: "One invoice a month, every line itemised", capturedFrom: "/brands/nebulatech?key=DEMO-NEBULATECH", as: "brand", openText: "Billing" },
  { key: "brand.campaign.builder", group: "brand", claim: "Buy a sponsored challenge like a media placement", capturedFrom: "/brands/astrofuel?key=DEMO-ASTROFUEL", as: "brand" },
  { key: "brand.analytics.roas", group: "brand", claim: "See what it returned", capturedFrom: "/brands/nebulatech?key=DEMO-NEBULATECH", as: "brand", openText: "Analytics" },

  // ---- Admin ----
  { key: "admin.challenge.rules", group: "admin", claim: "Rules in the game's own ladder", capturedFrom: "/admin/challenges", as: "admin" },
  { key: "admin.payments.providers", group: "admin", claim: "Real payout rails, not promises", capturedFrom: "/admin/payments", as: "admin" },
  { key: "admin.shots.console", group: "admin", claim: "Every screenshot on the site is one row an admin owns", capturedFrom: "/admin/shots", as: "admin" },
  // Registered, deliberately NOT captured — see the note at the top of this file.
  // New slots are placed as pages are touched and left empty until V1.R.
  { key: "admin.email.console", group: "admin", claim: "Every message we send, and whether it arrived", capturedFrom: "/admin/email", as: "admin" },
  { key: "admin.email.compose", group: "admin", claim: "Email any gamer, brand or server owner", capturedFrom: "/admin/email", as: "admin", openText: "Write to someone" },
  { key: "admin.cp.calculator", group: "admin", claim: "Every point we give away, modelled before we give it", capturedFrom: "/admin/cp-calculator", as: "admin" },
  { key: "admin.abuse.review", group: "admin", claim: "Growth we look at before we pay for it", capturedFrom: "/admin/growth-review", as: "admin" },

  // ---- The bot ----
  { key: "bot.card.profile", group: "bot", claim: "Your trophies and every account, on one card", capturedFrom: "/api/card/profile?slug=nova", as: "guest" },
  { key: "bot.card.market", group: "bot", claim: "The marketplace, inside Discord", capturedFrom: "/api/card/market", as: "guest" },
  { key: "bot.card.challenge", group: "bot", claim: "A challenge card anyone can join from Discord", capturedFrom: "/api/card/planets", as: "guest" },

  // ---- Marketing chrome ----
  { key: "nav.badges", group: "marketing", claim: "One nav, two doors: your planets and the marketplace", capturedFrom: "/", as: "gamer", selector: "header" },
  { key: "nav.potw.expanded", group: "marketing", claim: "One continuous surface", capturedFrom: "/", as: "guest", selector: "header" },
  { key: "planet.completed.standings", group: "marketing", claim: "Every challenge settles in public", capturedFrom: "/planets", as: "guest" },
];

export const SHOT_KEYS = SHOT_REGISTRY.map((s) => s.key);
export const shotDef = (key: string): ShotDef | undefined => SHOT_REGISTRY.find((s) => s.key === key);

/** The groups, in the order the admin console lists them. */
export const SHOT_GROUPS: { key: ShotDef["group"]; label: string }[] = [
  { key: "gamer", label: "The gamer" },
  { key: "server", label: "The server owner" },
  { key: "brand", label: "The brand" },
  { key: "bot", label: "The Discord bot" },
  { key: "marketing", label: "Marketing pages" },
  { key: "admin", label: "Admin" },
];
