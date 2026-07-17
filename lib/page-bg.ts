// The set of pages an admin can set a custom background image for, plus the
// mapping from a live pathname to its page key. Backgrounds are stored in the
// CMS under `page.bg.<key>`; an empty value means "use the default nebula".

export const PAGE_BG_PAGES: { key: string; label: string; note: string }[] = [
  { key: "home", label: "Home (landing)", note: "The guest landing page with the hero." },
  { key: "feed", label: "Feed / dashboard", note: "The logged-in home." },
  { key: "planets", label: "Planets", note: "Planet list and each planet page." },
  { key: "leaderboards", label: "Leaderboards", note: "All leaderboard pages." },
  { key: "quests", label: "Quests", note: "Quest list and each quest map page." },
  { key: "search", label: "Search", note: "Find gamers." },
  { key: "u", label: "Public profiles", note: "Every /u/<name> gamer profile." },
  { key: "profile", label: "Customize profile", note: "Your own profile editor." },
  { key: "onboarding", label: "Onboarding", note: "The welcome / connect flow." },
  { key: "messages", label: "Messages", note: "DMs and conversations." },
  { key: "notifications", label: "Notifications", note: "The notifications page." },
];

export const PAGE_BG_KEYS = PAGE_BG_PAGES.map((p) => p.key);
export const pageBgCmsKeys = PAGE_BG_KEYS.map((k) => `page.bg.${k}`);

// Map a pathname to a page-background key (or null when the page has none).
export function pathToPageKey(pathname: string): string | null {
  if (pathname === "/") return "home";
  const seg = pathname.split("/").filter(Boolean)[0] ?? "";
  const direct: Record<string, string> = {
    feed: "feed",
    planets: "planets",
    spaces: "planets",
    games: "planets",
    leaderboards: "leaderboards",
    quests: "quests",
    search: "search",
    u: "u",
    profile: "profile",
    onboarding: "onboarding",
    messages: "messages",
    notifications: "notifications",
  };
  return direct[seg] ?? null;
}
