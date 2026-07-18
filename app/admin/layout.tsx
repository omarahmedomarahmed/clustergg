import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin, isStaff } from "@/lib/auth";
import Icon from "@/components/Icon";

// Grouped so each thing is edited in exactly one place: Design owns all
// look/theme/art, Games & Planets owns the game catalog + communities,
// Competition owns challenges/quests/trophies, Community owns people, Ads and
// Platform stay admin-only.
const NAV: { section: string; adminOnly?: boolean; items: { href: string; label: string; adminOnly?: boolean }[] }[] = [
  {
    section: "Overview",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/audit-log", label: "Audit log", adminOnly: true },
    ],
  },
  {
    section: "Design & content",
    items: [
      { href: "/admin/content", label: "Site content" },
      { href: "/admin/backgrounds", label: "Page backgrounds" },
      { href: "/admin/cards", label: "Card backgrounds" },
      { href: "/admin/brand-kit", label: "Logos & brand kit" },
      { href: "/admin/partners", label: "Partners" },
    ],
  },
  {
    section: "Games & planets",
    items: [
      { href: "/admin/games", label: "Games catalog" },
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
      { href: "/admin/roles", label: "Roles", adminOnly: true },
      { href: "/admin/linked-accounts", label: "Linked accounts" },
    ],
  },
  {
    section: "Ads (offline sales)",
    adminOnly: true,
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
    adminOnly: true,
    items: [
      { href: "/admin/storage", label: "Image storage" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user)) redirect("/feed");
  const admin = isAdmin(user);

  const nav = NAV
    .filter((g) => admin || !g.adminOnly)
    .map((g) => ({ ...g, items: g.items.filter((i) => admin || !i.adminOnly) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 flex gap-8">
      <aside className="hidden lg:block w-52 shrink-0">
        <div className="glass p-4 sticky top-20 space-y-5">
          <div className="text-xs uppercase tracking-widest text-amber-300 flex items-center gap-2">
            <Icon name="shield" size={14} /> Mission Control
          </div>
          {!admin && (
            <div className="text-[10px] text-muted border border-amber-400/25 rounded-lg p-2">
              Staff access: edit planets, games, challenges, content, badges, trophies &amp; leaderboards. Ads, roles &amp; settings stay admin-only.
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
