// The admin map — one definition, used by the rail AND the command centre.
//
// There are 45 admin pages. They were only ever listed in the layout's sidebar,
// which meant the dashboard couldn't show them, nothing described what a page
// was for, and there was no way to tell at a glance whether staff could reach
// it. So the map lives here: every group, every page, what it does, who can
// open it, and which live number belongs next to it.
//
// `area` follows lib/areas.ts exactly:
//   undefined            → staff + admin
//   "ads"|"storage"|"audit" → admin, and staff only if an admin granted it
//   "roles"|"settings"   → admin only, never grantable

import type { SystemKey } from "@/lib/systems";

export type AdminAccess = "staff" | "grantable" | "admin";

export type AdminLink = {
  href: string;
  label: string;
  /** One line saying what you do here. Shown on the command centre. */
  desc?: string;
  area?: string;
  exact?: boolean;
  /** Which live counter to show, resolved by the page that renders it. */
  metric?: MetricKey;
  /** A queue: shown as an amber badge and surfaced in "Needs you". */
  queue?: boolean;
  /**
   * The desk that owns this page — the single declaration of who may open it.
   *
   * It used to live in lib/systems.ts as a per-system list of path prefixes,
   * parallel to this one. Two lists of the same pages is two lists that can
   * disagree, and they did: `/admin/discord/broadcast` sat in the Discord
   * section while the ad desk owned it, expressed as a prefix here and an
   * `except` there. Now the owner is written next to the page, once, and
   * systems.ts derives its pages from this file.
   *
   * Omitted deliberately for pages nobody should inherit: an `area`-gated page
   * is admin-or-granted, and an unclaimed page is admin-only by default.
   */
  system?: SystemKey;
  /** Pages two desks legitimately share, e.g. the unified inbox. */
  systems?: SystemKey[];
  /**
   * Deliberately nobody's desk.
   *
   * Same effect as leaving `system` off — `pathAllowedFor` denies anything
   * unclaimed — but written down, so the difference between "we decided this is
   * admins only" and "somebody added a page and forgot to file it" is visible.
   * A check over this file can then insist every page is one or the other.
   */
  adminOnly?: boolean;
};

export type AdminGroup = {
  section: string;
  icon?: string;
  blurb?: string;
  area?: string;
  items: AdminLink[];
};

/**
 * Where the rail sends you for a section: its first page.
 *
 * The rail used to list all 39 pages at once, which is a table of contents
 * pretending to be navigation — nobody can hold 39 items, and half of them were
 * one control each. It now lists the seven sections, and the pages inside a
 * section appear as tabs across the top of whichever one you opened. Same
 * pages, one level of choice at a time.
 */
export function homeOf(group: AdminGroup): string {
  return group.items[0]?.href ?? "/admin";
}

/** The section a path belongs to, so a page can draw its own tab bar. */
export function groupForPath(groups: AdminGroup[], pathname: string): AdminGroup | null {
  let best: { group: AdminGroup; len: number } | null = null;
  for (const g of groups) {
    for (const i of g.items) {
      const hit = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
      if (hit && (!best || i.href.length > best.len)) best = { group: g, len: i.href.length };
    }
  }
  return best?.group ?? null;
}

export type MetricKey =
  | "users" | "linkedAccounts" | "syncErrors"
  | "guilds" | "guildMembers" | "botCommands" | "challengeRequests" | "serverMessages"
  | "games" | "planets" | "planetRequests"
  | "challenges" | "quests" | "leaderboards" | "trophies" | "redeems"
  | "brandEnquiries" | "brands" | "creatives" | "placements" | "adImpressions" | "adClicks"
  | "posts" | "images";

export function accessOf(area: string | undefined): AdminAccess {
  if (!area) return "staff";
  if (area === "roles" || area === "settings") return "admin";
  return "grantable";
}

export const ACCESS_LABEL: Record<AdminAccess, string> = {
  staff: "Staff + admin",
  grantable: "Admin · grantable to staff",
  admin: "Admin only",
};

// The eight desks.
//
// The groups used to be by THING — "Ads & revenue" held both closing the books
// and running campaigns, "Community" held gamers and staff administration, and
// "Games & planets" was four pages pretending to be a section. They are now by
// JOB: which desk you sit at. Money is its own group and comes second, because
// the pages where being wrong costs money should not be mixed in with the pages
// where being wrong costs a typo.
export const ADMIN_NAV: AdminGroup[] = [
  {
    section: "Overview",
    icon: "chart",
    blurb: "Where everything is, and what needs you today.",
    items: [
      { href: "/admin", label: "Command centre", desc: "Every console, every live number, in one place.", exact: true },
      { href: "/admin/messages", label: "Messages", desc: "Every conversation with a server owner or a brand, in one queue.", metric: "serverMessages", queue: true, systems: ["bot", "brand"] },
      { href: "/admin/systems", label: "The systems", desc: "What Cluster is made of, what each part is for, and who runs it.", exact: true },
      { href: "/admin/dataroom", label: "Data room", desc: "The investor deck and partner profile — every section editable, every number live.", area: "settings" },
      { href: "/admin/audit-log", label: "Audit log", desc: "Every admin and staff action, with who and when.", area: "audit" },
    ],
  },
  {
    section: "Money",
    icon: "diamond",
    blurb: "Every dollar in and every dollar out. Being wrong here costs money.",
    items: [
      { href: "/admin/vaults", label: "Vaults", desc: "Where every dollar is — prizes, the server pool, the CP vault and ours. Balances summed from the ledger, the split that divides new sales, and what actually reached gamers.", system: "billing" },
      { href: "/admin/week", label: "The week", desc: "The weekly close: who carried a challenge, how they scored, and what the server pool paid them. Runs Monday; re-runnable safely.", system: "billing" },
      { href: "/admin/billing", label: "Billing & revenue", desc: "Brand invoices, what came in, what we owe gamers and servers, and what's left." , system: "billing" },
      { href: "/admin/payouts", label: "Payouts", desc: "What server owners earned, and releasing it to them." , system: "billing" },
      { href: "/admin/redeems", label: "Trophy redemptions", desc: "Winners cashing in. Pay out or reject.", metric: "redeems", queue: true , system: "trophies" },
      { href: "/admin/stuck", label: "Stuck money", desc: "Every state where a prize has nowhere to go — what is stuck, why, and what unsticks it.", queue: true, system: "trophies" },
      { href: "/admin/growth-review", label: "Growth review", desc: "Servers whose linked-member growth is worth a look before a payout goes out.", queue: true, system: "billing" },
      { href: "/admin/offers", label: "Founding offers", desc: "The two promotional campaigns — off by default. Switch them on, set what percentage of a bill they cover, and see what they have cost and returned.", system: "billing" },
      { href: "/admin/payments", label: "Payment providers", desc: "Who collects from brands and who pays owners and gamers.", area: "settings" },
    ],
  },
  {
    section: "Brands & ads",
    icon: "zap",
    blurb: "Selling the inventory and running what was sold.",
    area: "ads",
    items: [
      // Billing only, deliberately. Testimonials used to be a separate page
      // owned by the content desk, and giving that desk this page instead would
      // have handed it campaign management and portal-key rotation on
      // /admin/brands/[id] — `ownersOfPath` matches by prefix, so a desk that
      // owns /admin/brands owns everything under it. A tab is not worth a key.
      { href: "/admin/brands", label: "Brands", desc: "Every brand, the enquiries that became them, and the player quotes their reports close with.", metric: "brands", system: "billing" },
      { href: "/admin/creatives", label: "Creatives", desc: "The artwork that runs.", metric: "creatives" , system: "ad" },
      { href: "/admin/placements", label: "Placements", desc: "Where creatives can appear.", metric: "placements" , system: "ad" },
      { href: "/admin/ads/schedule", label: "Ad schedule", desc: "What runs when." , system: "ad" },
      { href: "/admin/ads/analytics", label: "Ad analytics", desc: "Impressions, clicks and earnings by campaign.", metric: "adImpressions" , system: "ad" },
    ],
  },
  {
    section: "Discord",
    icon: "link",
    blurb: "The bot is the product. This is every server running it.",
    items: [
      { href: "/admin/discord", label: "Servers & bot status", desc: "Every connected server, its growth, and whether the bot is configured.", exact: true, metric: "guilds" , system: "bot" },
      { href: "/admin/discord/analytics", label: "Bot analytics", desc: "Commands, screens, funnel and latency across every server.", metric: "botCommands" , system: "bot" },
      { href: "/admin/discord/requests", label: "Challenge requests", desc: "Server owners asking to run a challenge. Approve or reject.", metric: "challengeRequests", queue: true , system: "challenges" },
      { href: "/admin/discord/broadcast", label: "Broadcast & ads", desc: "Post to every server at once, or push an ad creative.", area: "ads" , system: "ad" },
      { href: "/admin/discord/hq", label: "HQ server", desc: "Build our own Discord: channels, categories, roles, pinned starters.", area: "settings" },
    ],
  },
  {
    section: "Competition",
    icon: "trophy",
    blurb: "The games, the challenges on them, and the trophies they pay out.",
    items: [
      { href: "/admin/games", label: "Games & planets", desc: "Every game, its art and theme, and the planet it appears as — edited together.", metric: "games" , system: "planets" },
      { href: "/admin/game-worlds", label: "Game worlds", desc: "Champions, agents, weapons and lore per game." , system: "planets" },
      { href: "/admin/connect", label: "Connect providers", desc: "Which APIs we link accounts through, and their onboarding cards." , system: "planets" },
      { href: "/admin/spaces/requests", label: "Game requests", desc: "Gamers asking for a game we don't carry yet.", metric: "planetRequests", queue: true , system: "planets" },
      { href: "/admin/challenges", label: "Challenges", desc: "Build, gate, pause and end every challenge.", metric: "challenges" , system: "challenges" },
      { href: "/admin/profile-week", label: "Profile of the Week", desc: "The weekly vote: standings, adjustments, disqualifications, the Sunday stream and the podium." , system: "challenges" },
      { href: "/admin/quests", label: "Quests", desc: "Tiers, thresholds, maps and Cluster Point rewards.", metric: "quests" , system: "quests" },
      { href: "/admin/cp-calculator", label: "CP calculator", desc: "What every action pays, what it costs at a million gamers, and what a second account would farm first.", system: "quests" },
      { href: "/admin/leaderboards", label: "Leaderboards", desc: "Every board on every game — a game can run several.", metric: "leaderboards" , system: "challenges" },
      { href: "/admin/trophies", label: "Trophies", desc: "The prize catalogue and what each is worth.", metric: "trophies" , system: "trophies" },
      { href: "/admin/badges", label: "Badges", desc: "The badge catalogue: what each one is, and the rule that earns it. Grants are automatic — this defines the rule, it does not award anything.", system: "trophies" },
      { href: "/admin/marketplace", label: "Marketplace", desc: "Trophies bought with Cluster Points — the shelf, the ledger and what we owe.", system: "trophies" },
    ],
  },
  {
    section: "Gamers",
    icon: "users",
    blurb: "The people who play. The most sensitive data we hold.",
    items: [
      { href: "/admin/users", label: "Users", desc: "Every gamer: profile, roles, trophies, ban and impersonate.", metric: "users" },
      { href: "/admin/linked-accounts", label: "Linked accounts", desc: "Every synced game account and its sync health.", metric: "linkedAccounts" },
    ],
  },
  {
    section: "Content",
    icon: "spark",
    blurb: "Every word, colour and image the site shows.",
    items: [
      { href: "/admin/content", label: "Site content", desc: "Everything the public site says — copy, nav & footer, mobile chrome and the partner strip, as four tabs." , system: "brand" },
      { href: "/admin/language", label: "Language", desc: "Every word the platform says, in English and Arabic — interface strings, marketing copy, database content, and the country flags.", system: "brand" },
      { href: "/admin/art", label: "Art", desc: "The artwork on every surface — page backgrounds, card backgrounds, and where the words land on a card.", system: "brand" },
      { href: "/admin/brand-kit", label: "Logos & brand kit", desc: "Wordmark, mark, favicon, orbs and framing." , system: "brand" },
      { href: "/admin/shots", label: "Screenshots", desc: "Every feature screenshot on the site — replace the image, rewrite the caption, and it changes everywhere that component appears.", system: "brand" },
    ],
  },
  {
    section: "Platform",
    icon: "settings",
    blurb: "Run the company rather than run the product.",
    items: [
      { href: "/admin/analytics", label: "Product analytics", desc: "Every metric we track, filterable, with a one-page report per metric.", metric: "users", adminOnly: true },
      { href: "/admin/roles", label: "Roles & staff access", desc: "Promote staff and grant them admin areas.", area: "roles" },
      { href: "/admin/departments", label: "Departments", desc: "Who runs which system. Move a person, not a checklist.", area: "roles" },
      { href: "/admin/email", label: "Email", desc: "Every message we tried to send and whether it arrived. A bounce is how you learn a customer never heard from you.", system: "billing" },
      { href: "/admin/storage", label: "Image storage", desc: "Every stored image, its size and origin. Re-host art to Blob.", area: "storage", metric: "images" },
      { href: "/admin/settings", label: "Settings", desc: "Platform-wide switches. Admin only.", area: "settings" },
    ],
  },
];

// Filter the map for who's looking, using the same rule the guards use.
export function navFor(
  isAdminUser: boolean,
  grants: string[],
  allowed: (isAdminUser: boolean, area: string | undefined, grants: string[]) => boolean,
): AdminGroup[] {
  return ADMIN_NAV
    .filter((g) => allowed(isAdminUser, g.area, grants))
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(isAdminUser, i.area, grants)) }))
    .filter((g) => g.items.length > 0);
}

/**
 * The rail as one department sees it.
 *
 * Filtered by the same function the page guard uses, so the rail cannot show a
 * link that would 403 — a console that offers you doors you can't open is worse
 * than one that offers you fewer.
 */
export function navForSystems(
  systems: string[],
  allowedPath: (systems: string[], path: string) => boolean,
): AdminGroup[] {
  return ADMIN_NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => allowedPath(systems, i.href)) }))
    .filter((g) => g.items.length > 0);
}


// ===== The derived owner map =====
//
// One pass over the nav, so "which desk owns this page" has exactly one answer
// and it is written beside the page. Longest prefix wins, which is what lets
// `/admin/discord/requests` belong to the challenge desk while `/admin/discord`
// belongs to the bot desk without an `except` list to keep in sync.

export type PageOwner = { href: string; systems: SystemKey[] };

export const PAGE_OWNERS: PageOwner[] = ADMIN_NAV.flatMap((g) =>
  g.items.flatMap((i) => {
    const systems = i.systems ?? (i.system ? [i.system] : []);
    return systems.length ? [{ href: i.href, systems }] : [];
  }),
);

/**
 * Which desks may open this path. Empty means nobody inherits it.
 *
 * Always a PREFIX match, longest wins — deliberately ignoring the item's
 * `exact` flag, which exists so the rail knows which tab to light up and has
 * nothing to do with ownership. Honouring it here would leave every detail page
 * unowned: `/admin/discord` is marked exact so the Servers tab doesn't stay lit
 * on the analytics tab, and that would have made `/admin/discord/<guildId>` —
 * the page where a server is actually administered — invisible to the bot desk.
 */
export function ownersOfPath(path: string): SystemKey[] {
  let best: PageOwner | null = null;
  for (const o of PAGE_OWNERS) {
    if (path !== o.href && !path.startsWith(`${o.href}/`)) continue;
    if (!best || o.href.length > best.href.length) best = o;
  }
  return best?.systems ?? [];
}

/**
 * Pages that moved, and where they went.
 *
 * Every merge left a stub at the old URL, because staff bookmark admin pages.
 * But a stub is a page like any other, and an unregistered page is admin-only —
 * so without this map a staff member clicking a bookmark got a 404 from the
 * layout guard BEFORE the redirect ever ran. A 404 on a page that still exists
 * under a different name is the worst possible answer: it says "this is gone"
 * when the truth is "this moved".
 *
 * Declared here rather than in each stub so the guard and the redirect cannot
 * disagree, and so the list of what moved is readable in one place.
 */
export const MOVED_ROUTES: Record<string, string> = {
  // → /admin/content
  "/admin/chrome": "/admin/content?tab=chrome",
  "/admin/mobile": "/admin/content?tab=mobile",
  "/admin/partners": "/admin/content?tab=partners",
  // → /admin/art
  "/admin/backgrounds": "/admin/art?tab=pages",
  "/admin/cards": "/admin/art?tab=cards",
  "/admin/cards/guide": "/admin/art?tab=layouts",
  // → /admin/language
  "/admin/translations": "/admin/language?tab=content",
  // → /admin/brands
  "/admin/brand-enquiries": "/admin/brands?tab=enquiries",
  "/admin/brands/testimonials": "/admin/brands?tab=testimonials",
  // Earlier merges, which had the same hole.
  "/admin/spaces": "/admin/games",
  "/admin/discord/messages": "/admin/messages?kind=server",
};

/** Where a moved path lands, as a bare pathname. Null if it did not move. */
export function movedTo(path: string): string | null {
  const to = MOVED_ROUTES[path];
  return to ? to.split("?")[0] : null;
}

/** Every page one desk owns — what the department editor and the brief list. */
export function pagesOfSystem(key: SystemKey): AdminLink[] {
  return ADMIN_NAV.flatMap((g) =>
    g.items.filter((i) => (i.systems ?? (i.system ? [i.system] : [])).includes(key)),
  );
}
