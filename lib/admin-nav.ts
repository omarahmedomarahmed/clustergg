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
};

export type AdminGroup = {
  section: string;
  icon?: string;
  blurb?: string;
  area?: string;
  items: AdminLink[];
};

export type MetricKey =
  | "users" | "linkedAccounts" | "syncErrors"
  | "guilds" | "guildMembers" | "botCommands" | "challengeRequests"
  | "games" | "planets" | "planetRequests"
  | "challenges" | "quests" | "leaderboards" | "trophies" | "redeems"
  | "brands" | "creatives" | "placements" | "adImpressions" | "adClicks"
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

export const ADMIN_NAV: AdminGroup[] = [
  {
    section: "Overview",
    icon: "chart",
    blurb: "Where everything is, and what needs you today.",
    items: [
      { href: "/admin", label: "Command centre", desc: "Every console, every live number, in one place.", exact: true },
      { href: "/admin/analytics", label: "Product analytics", desc: "Every metric we track, filterable, with a one-page report per metric.", metric: "users" },
      { href: "/admin/audit-log", label: "Audit log", desc: "Every admin and staff action, with who and when.", area: "audit" },
    ],
  },
  {
    section: "Discord",
    icon: "link",
    blurb: "The bot is the product. This is every server running it.",
    items: [
      { href: "/admin/discord", label: "Servers & bot status", desc: "Every connected server, its growth, and whether the bot is configured.", exact: true, metric: "guilds" },
      { href: "/admin/discord/analytics", label: "Bot analytics", desc: "Commands, screens, funnel and latency across every server.", metric: "botCommands" },
      { href: "/admin/discord/requests", label: "Challenge requests", desc: "Server owners asking to run a challenge. Approve or reject.", metric: "challengeRequests", queue: true },
      { href: "/admin/discord/broadcast", label: "Broadcast & ads", desc: "Post to every server at once, or push an ad creative.", area: "ads" },
      { href: "/admin/discord/hq", label: "HQ server", desc: "Build our own Discord: channels, categories, roles, pinned starters.", area: "settings" },
    ],
  },
  {
    section: "Design & content",
    icon: "spark",
    blurb: "Every word, colour and image the site shows.",
    items: [
      { href: "/admin/content", label: "Site content", desc: "Headlines, subtitles and CTAs on every public page." },
      { href: "/admin/language", label: "Language & flags", desc: "Arabic toggle, locale defaults, country flags." },
      { href: "/admin/translations", label: "Content translations", desc: "Per-entity Arabic for quests, planets, challenges and boards." },
      { href: "/admin/backgrounds", label: "Page backgrounds", desc: "Background art per page." },
      { href: "/admin/cards", label: "Card backgrounds", desc: "The art behind every rendered card, including the bot's.", exact: true },
      { href: "/admin/cards/guide", label: "Card layout guide", desc: "Where text, mascot and logo land on each card — build seasonal art to match." },
      { href: "/admin/brand-kit", label: "Logos & brand kit", desc: "Wordmark, mark, favicon, orbs and framing." },
      { href: "/admin/mobile", label: "Mobile chrome", desc: "Bottom nav and side drawer on phones." },
      { href: "/admin/creative-studio", label: "Creative studio", desc: "Build social creatives from platform art." },
      { href: "/admin/partners", label: "Partners", desc: "The logos in the trusted-by strip." },
    ],
  },
  {
    section: "Games & planets",
    icon: "planet",
    blurb: "The worlds we sync and what lives on them.",
    items: [
      { href: "/admin/games", label: "Games catalog", desc: "Every game, its art, theme and planet layout.", metric: "games" },
      { href: "/admin/game-worlds", label: "Game worlds", desc: "Champions, agents, weapons and lore per game." },
      { href: "/admin/connect", label: "Connect providers", desc: "Which APIs we link accounts through, and their onboarding cards." },
      { href: "/admin/spaces", label: "Planets", desc: "One planet per game — pins, regions and hero layout.", metric: "planets" },
      { href: "/admin/spaces/requests", label: "Planet requests", desc: "Gamers asking for a game we don't carry yet.", metric: "planetRequests", queue: true },
    ],
  },
  {
    section: "Competition",
    icon: "trophy",
    blurb: "Challenges, quests, boards and the trophies they pay out.",
    items: [
      { href: "/admin/challenges", label: "Challenges", desc: "Build, gate, pause and end every challenge.", metric: "challenges" },
      { href: "/admin/quests", label: "Quests", desc: "Tiers, thresholds, maps and Cluster Point rewards.", metric: "quests" },
      { href: "/admin/leaderboards", label: "Leaderboards", desc: "Every board on every game — a game can run several.", metric: "leaderboards" },
      { href: "/admin/trophies", label: "Trophies", desc: "The prize catalogue and what each is worth.", metric: "trophies" },
      { href: "/admin/redeems", label: "Trophy redemptions", desc: "Winners cashing in. Pay out or reject.", metric: "redeems", queue: true },
    ],
  },
  {
    section: "Community",
    icon: "users",
    blurb: "Gamers, their accounts, and who on staff can do what.",
    items: [
      { href: "/admin/users", label: "Users", desc: "Every gamer: profile, roles, trophies, ban and impersonate.", metric: "users" },
      { href: "/admin/linked-accounts", label: "Linked accounts", desc: "Every synced game account and its sync health.", metric: "linkedAccounts" },
      { href: "/admin/roles", label: "Roles & staff access", desc: "Promote staff and grant them admin areas.", area: "roles" },
    ],
  },
  {
    section: "Ads & revenue",
    icon: "zap",
    area: "ads",
    blurb: "Offline sales, run through the platform.",
    items: [
      { href: "/admin/brands", label: "Brands", desc: "Advertisers and their portals.", metric: "brands" },
      { href: "/admin/creatives", label: "Creatives", desc: "The artwork that runs.", metric: "creatives" },
      { href: "/admin/placements", label: "Placements", desc: "Where creatives can appear.", metric: "placements" },
      { href: "/admin/ads/schedule", label: "Ad schedule", desc: "What runs when." },
      { href: "/admin/ads/analytics", label: "Ad analytics", desc: "Impressions, clicks and earnings by campaign.", metric: "adImpressions" },
    ],
  },
  {
    section: "Platform",
    icon: "settings",
    blurb: "The machinery underneath.",
    items: [
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
