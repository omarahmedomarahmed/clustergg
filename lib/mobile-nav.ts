// Admin-editable mobile chrome: the bottom tab bar and the side-drawer links.
// Both are stored as JSON in CMS content keys and fall back to sensible defaults
// when unset, so the app works out of the box and admins get full control.

export type MobileTab = { key: string; label: string; icon: string; href: string; center?: boolean; enabled?: boolean };
export type DrawerLink = { label: string; icon: string; href: string };

// Built-in bottom tabs. Empty `label` means "use the translated default for this
// key" (home/quests/ranks/you/planets) so the defaults stay localized.
export function defaultBottomTabs(loggedIn: boolean): MobileTab[] {
  return [
    { key: "home", label: "", icon: "home", href: loggedIn ? "/feed" : "/", enabled: true },
    { key: "quests", label: "", icon: "trophy", href: "/quests", enabled: true },
    { key: "planets", label: "", icon: "planet", href: "/planets", center: true, enabled: true },
    { key: "ranks", label: "", icon: "chart", href: "/leaderboards", enabled: true },
    { key: "you", label: "", icon: "user", href: loggedIn ? "/profile" : "/login", enabled: true },
  ];
}

// Parse the admin bottom-nav override (or null to use defaults).
export function parseBottomTabs(json?: string | null): MobileTab[] | null {
  if (!json) return null;
  try {
    const j = JSON.parse(json);
    if (Array.isArray(j) && j.length) {
      const tabs = j
        .filter((x) => x && typeof x === "object" && x.href && x.icon)
        .map((x, i): MobileTab => ({ key: String(x.key || `t${i}`), label: String(x.label || ""), icon: String(x.icon), href: String(x.href), center: !!x.center, enabled: x.enabled !== false }));
      return tabs.length ? tabs : null;
    }
  } catch { /* fall back to defaults */ }
  return null;
}

// Parse the admin extra drawer links.
export function parseDrawerLinks(json?: string | null): DrawerLink[] {
  if (!json) return [];
  try {
    const j = JSON.parse(json);
    if (Array.isArray(j)) {
      return j
        .filter((x) => x && typeof x === "object" && x.href && x.label)
        .map((x): DrawerLink => ({ label: String(x.label), icon: String(x.icon || "link"), href: String(x.href) }));
    }
  } catch { /* none */ }
  return [];
}
