// What appears in the nav and the footer — under admin control.
//
// Every item in the top bar and every link in the footer used to be a decision
// baked into a component, which meant "hide the search icon for guests" was a
// deploy. It is now a setting, and the two audiences are set separately:
// what a guest needs in that row (the two commercial doors, a way in) and what
// a signed-in gamer needs (their quests, their alerts, their profile) are
// different rows, and forcing one switch to serve both is what makes navs grow
// until nothing fits on a phone.
//
// Stored as one JSON blob per surface in `platform_settings`. Unset means the
// house default, so a fresh install and an install where nobody has opened the
// editor behave identically.

export const NAV_SETTING_KEY = "chrome.nav";
export const FOOTER_SETTING_KEY = "chrome.footer";

export type Audience = "guest" | "user";

export type NavItemDef = {
  id: string;
  label: string;
  /** What it does, for the admin list — not shown to visitors. */
  note: string;
  /** Which audiences can ever see it. An item is only offered where it exists. */
  audiences: Audience[];
  /** The house default, per audience. */
  on: Partial<Record<Audience, boolean>>;
};

// The order here is the order of the admin list, not of the nav.
export const NAV_ITEMS: NavItemDef[] = [
  { id: "gameLogos", label: "Game planet logos", note: "The row of game logos next to the wordmark.", audiences: ["guest", "user"], on: { guest: true, user: true } },
  { id: "allPlanets", label: "All planets button", note: "The globe icon at the end of the game logos.", audiences: ["guest", "user"], on: { guest: true, user: true } },
  // The marketplace badge sits in the same row as the planets badge and is
  // configured the same way. It is on for both audiences by default: a guest
  // who can see what points buy has a reason to link an account, and hiding the
  // shop from everyone who has not signed up yet is how a currency stays
  // abstract.
  { id: "marketplaceBadge", label: "Marketplace badge", note: "The trophy badge beside the planets badge. Art, label and order are set in Brand Kit.", audiences: ["guest", "user"], on: { guest: true, user: true } },
  { id: "questCard", label: "Quest card", note: "The live quest tracker that fills the middle of the bar.", audiences: ["user"], on: { user: true } },
  { id: "alerts", label: "Notifications & messages", note: "The bell and the DM icon.", audiences: ["user"], on: { user: true } },
  { id: "profileMenu", label: "Profile menu", note: "The avatar, and everything under it.", audiences: ["user"], on: { user: true } },
  { id: "search", label: "Search", note: "Find a gamer by name.", audiences: ["guest", "user"], on: { guest: false, user: false } },
  { id: "brandsLink", label: "“For brands” link", note: "Sends a brand to the rate card.", audiences: ["guest", "user"], on: { guest: true, user: false } },
  { id: "serversLink", label: "“For Discord servers” link", note: "Sends an owner to the bot page.", audiences: ["guest", "user"], on: { guest: true, user: false } },
  { id: "loginLink", label: "Log in link", note: "The plain text link, beside the Discord button.", audiences: ["guest"], on: { guest: true } },
  { id: "addBot", label: "Add to server button", note: "The bot install button.", audiences: ["guest", "user"], on: { guest: true, user: true } },
  { id: "discordSignIn", label: "Sign in with Discord", note: "The blurple button on the right.", audiences: ["guest"], on: { guest: true } },
  { id: "weekBand", label: "Profile of the Week strip", note: "The competition bar under the nav.", audiences: ["guest", "user"], on: { guest: true, user: true } },
  { id: "mobileHud", label: "Mobile HUD strip", note: "Level bar and alert dots, phones only.", audiences: ["user"], on: { user: true } },
];

export type NavSettings = Record<string, Partial<Record<Audience, boolean>>>;

/** Parse whatever is stored; unknown ids and junk are dropped. */
export function parseNav(raw: string | null | undefined): NavSettings {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const known = new Set(NAV_ITEMS.map((i) => i.id));
    const out: NavSettings = {};
    for (const [id, v] of Object.entries(o as Record<string, unknown>)) {
      if (!known.has(id) || !v || typeof v !== "object") continue;
      const val = v as Record<string, unknown>;
      out[id] = {
        ...(typeof val.guest === "boolean" ? { guest: val.guest } : {}),
        ...(typeof val.user === "boolean" ? { user: val.user } : {}),
      };
    }
    return out;
  } catch { return {}; }
}

/**
 * Should this item render, for this audience?
 *
 * The default is the item's own default, NOT `true` — an item nobody has
 * configured behaves as designed rather than appearing everywhere the moment
 * the settings blob exists.
 */
export function navShows(settings: NavSettings, id: string, audience: Audience): boolean {
  const def = NAV_ITEMS.find((i) => i.id === id);
  if (!def || !def.audiences.includes(audience)) return false;
  const set = settings[id]?.[audience];
  return typeof set === "boolean" ? set : def.on[audience] === true;
}

// ===== The nav destination badges =====

/**
 * The badges that sit at the end of the game-logo row: all-planets, and the
 * trophy marketplace.
 *
 * This returns data rather than markup, and both the desktop row and the mobile
 * drawer read it, because the requirement is that they agree on *order* as well
 * as on which badges exist. Two hand-written blocks in two components is how
 * "the drawer shows them the other way round" happens, and nobody notices for a
 * month.
 */
export type NavBadge = {
  id: "planets" | "market";
  href: string;
  label: string;
  /** Admin-uploaded art, or "" to fall back to the glyph. */
  art: string;
  glyph: "planet" | "trophy";
  /** Tailwind hover classes — each badge keeps its own accent. */
  hover: string;
};

export function navBadges(opts: {
  hidePlanets: boolean;
  show: (id: string) => boolean;
  planetsIcon: string;
  marketIcon: string;
  marketLabel: string;
  marketFirst: boolean;
}): NavBadge[] {
  const planets: NavBadge = {
    id: "planets", href: "/planets", label: "All planets",
    art: opts.planetsIcon, glyph: "planet",
    hover: "hover:text-cyan-300 hover:border-cyan-400/50",
  };
  const market: NavBadge = {
    id: "market", href: "/marketplace", label: opts.marketLabel,
    art: opts.marketIcon, glyph: "trophy",
    hover: "hover:text-amber-200 hover:border-amber-400/50",
  };
  const out: NavBadge[] = [];
  if (!opts.hidePlanets && opts.show("allPlanets")) out.push(planets);
  if (opts.show("marketplaceBadge")) out.push(market);
  return opts.marketFirst ? out.slice().reverse() : out;
}

// ===== Footer =====

export type FooterLink = { label: string; href: string };
export type FooterColumn = { title: string; links: FooterLink[] };

// What the footer ships with. Editing any column replaces the whole set, so an
// admin who removes a column has removed it — this is the fallback for "nobody
// has touched it", not a floor under their edits.
export const FOOTER_DEFAULT: FooterColumn[] = [
  {
    title: "For brands",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Talk to us", href: "/brands" },
      { label: "Partner profile", href: "/dataroom/company-profile" },
      { label: "Sponsored challenges", href: "/pricing#plans" },
      { label: "Brand sign-in", href: "/login/brand" },
      { label: "Investors & partners", href: "/dataroom" },
    ],
  },
  {
    title: "For server owners",
    links: [
      { label: "Add the bot", href: "/discord-bot" },
      { label: "Monetize your server", href: "/servers" },
      { label: "Connected servers", href: "/servers" },
      { label: "Server sign-in", href: "/login/server" },
      { label: "Blog & guides", href: "/blog" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Planets", href: "/planets" },
      { label: "Leaderboards", href: "/leaderboards" },
      { label: "Find gamers", href: "/search" },
      { label: "Join the Cluster", href: "/signup" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
      { label: "Cookies", href: "/legal/cookies" },
    ],
  },
];

const SAFE_HREF = /^(\/[^\s"'<>]*|https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+)$/i;

/** Parse stored footer columns. Anything malformed falls back to the default. */
export function parseFooter(raw: string | null | undefined): FooterColumn[] {
  if (!raw) return FOOTER_DEFAULT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return FOOTER_DEFAULT;
    const cols = parsed
      .slice(0, 6)
      .map((c): FooterColumn | null => {
        const col = (c ?? {}) as { title?: unknown; links?: unknown };
        const title = typeof col.title === "string" ? col.title.trim().slice(0, 40) : "";
        const links = Array.isArray(col.links)
          ? col.links.slice(0, 12).map((l): FooterLink | null => {
              const link = (l ?? {}) as { label?: unknown; href?: unknown };
              const label = typeof link.label === "string" ? link.label.trim().slice(0, 40) : "";
              const href = typeof link.href === "string" ? link.href.trim() : "";
              // An admin-entered href ends up in an anchor, so `javascript:`
              // and friends are refused here rather than in the template.
              if (!label || !SAFE_HREF.test(href)) return null;
              return { label, href };
            }).filter((l): l is FooterLink => l !== null)
          : [];
        if (!title && links.length === 0) return null;
        return { title, links };
      })
      .filter((c): c is FooterColumn => c !== null);
    // An empty save means "no columns", which is a legitimate choice; only a
    // parse failure falls back.
    return cols;
  } catch { return FOOTER_DEFAULT; }
}
