import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin, isStaff } from "@/lib/auth";
import { areaAllowed, getStaffGrants } from "@/lib/permissions";
import Icon from "@/components/Icon";

// Grouped so each thing is edited in exactly one place. Items/sections carry an
// optional `area`: undefined = staff-default; "ads"/"storage"/"audit" = grantable
// (admin can delegate to staff on /admin/roles); "roles"/"settings" = admin-only.
const NAV: { section: string; area?: string; items: { href: string; label: string; area?: string }[] }[] = [
  {
    section: "Overview",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/audit-log", label: "Audit log", area: "audit" },
    ],
  },
  {
    section: "Design & content",
    items: [
      { href: "/admin/content", label: "Site content" },
      { href: "/admin/language", label: "Language & flags (Arabic)" },
      { href: "/admin/translations", label: "Content translations (Ar/En)" },
      { href: "/admin/backgrounds", label: "Page backgrounds" },
      { href: "/admin/cards", label: "Card backgrounds" },
      { href: "/admin/brand-kit", label: "Logos & brand kit" },
      { href: "/admin/mobile", label: "Mobile chrome (nav/drawer)" },
      { href: "/admin/creative-studio", label: "Creative studio" },
      { href: "/admin/partners", label: "Partners" },
    ],
  },
  {
    section: "Games & planets",
    items: [
      { href: "/admin/games", label: "Games catalog" },
      { href: "/admin/game-worlds", label: "Game worlds (heroes/lore)" },
      { href: "/admin/connect", label: "Connect providers" },
      { href: "/admin/spaces", label: "Planets" },
      { href: "/admin/spaces/requests", label: "Planet requests" },
    ],
  },
  {
    section: "Competition",
    items: [
      { href: "/admin/challenges", label: "Challenges" },
      { href: "/admin/quests", label: "Quests" },
      { href: "/admin/leaderboards", label: "Leaderboards" },
      { href: "/admin/trophies", label: "Trophies" },
    ],
  },
  {
    section: "Community",
    items: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/roles", label: "Roles & staff access", area: "roles" },
      { href: "/admin/linked-accounts", label: "Linked accounts" },
    ],
  },
  {
    section: "Ads (offline sales)",
    area: "ads",
    items: [
      { href: "/admin/brands", label: "Brands" },
      { href: "/admin/creatives", label: "Creatives" },
      { href: "/admin/placements", label: "Placements" },
      { href: "/admin/ads/schedule", label: "Ad schedule" },
      { href: "/admin/ads/analytics", label: "Ad analytics" },
    ],
  },
  {
    section: "Platform",
    items: [
      { href: "/admin/storage", label: "Image storage", area: "storage" },
      { href: "/admin/settings", label: "Settings", area: "settings" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user)) redirect("/feed");
  const admin = isAdmin(user);
  const grants = admin ? [] : await getStaffGrants();

  const nav = NAV
    .filter((g) => areaAllowed(admin, g.area, grants))
    .map((g) => ({ ...g, items: g.items.filter((i) => areaAllowed(admin, i.area, grants)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:py-8 lg:flex lg:gap-8">
      {/* Mobile admin nav — horizontal scroll of every area (Mission Control on mobile) */}
      <div className="lg:hidden mb-4 -mx-4 px-4">
        <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-widest text-amber-300"><Icon name="shield" size={14} /> Mission Control</div>
        <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none]">
          {nav.flatMap((g) => g.items).map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 rounded-full border border-white/12 px-3 py-1.5 text-xs text-muted hover:text-ink hover:border-cyan-400/40 whitespace-nowrap">
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <aside className="hidden lg:block w-52 shrink-0">
        {/* Independently scrollable — hovering the rail scrolls only the rail
            (overscroll-contain stops the wheel from chaining to the page). */}
        <div className="glass p-4 sticky top-20 space-y-5 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain">
          <div className="text-xs uppercase tracking-widest text-amber-300 flex items-center gap-2">
            <Icon name="shield" size={14} /> Mission Control
          </div>
          {!admin && (
            <div className="text-[10px] text-muted border border-amber-400/25 rounded-lg p-2">
              Staff access: edit planets, games, challenges, content, badges, trophies &amp; leaderboards
              {grants.length > 0 ? `, plus ${grants.join(", ")} (granted by an admin)` : ""}. Roles &amp; settings stay admin-only.
            </div>
          )}
          {nav.map((group) => (
            <div key={group.section}>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">{group.section}</div>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="block rounded-lg px-2.5 py-1.5 text-sm text-muted hover:text-ink hover:bg-violet-500/10">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
