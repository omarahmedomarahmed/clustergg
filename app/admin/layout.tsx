import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin, isStaff } from "@/lib/auth";
import { areaAllowed, getStaffGrants } from "@/lib/permissions";
import { AdminRail, AdminMobileNav } from "@/components/AdminNav";
import { countPendingRequests } from "@/lib/challenge-requests";

// Grouped so each thing is edited in exactly one place. Items/sections carry an
// optional `area`: undefined = staff-default; "ads"/"storage"/"audit" = grantable
// (admin can delegate to staff on /admin/roles); "roles"/"settings" = admin-only.
const NAV: {
  section: string; area?: string; icon?: string;
  items: { href: string; label: string; area?: string; exact?: boolean; badge?: "requests" }[];
}[] = [
  {
    section: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", exact: true },
      { href: "/admin/audit-log", label: "Audit log", area: "audit" },
    ],
  },
  {
    section: "Discord",
    icon: "link",
    items: [
      { href: "/admin/discord", label: "Bot status & setup", exact: true },
      { href: "/admin/discord/requests", label: "Challenge requests", badge: "requests" },
      { href: "/admin/discord/broadcast", label: "Broadcast & ads" },
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
      { href: "/admin/redeems", label: "Trophy redemptions" },
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

  // Counts that belong in the nav: a queue nobody can see from the rail is a
  // queue nobody works.
  const pendingRequests = admin ? await countPendingRequests() : 0;

  const groups = nav.map((g) => ({
    section: g.section,
    icon: g.icon,
    items: g.items.map((i) => ({
      href: i.href,
      label: i.label,
      exact: i.exact,
      badge: i.badge === "requests" ? pendingRequests : undefined,
    })),
  }));

  const staffNote = admin ? undefined
    : `Staff access: edit planets, games, challenges, content, badges, trophies & leaderboards${
      grants.length > 0 ? `, plus ${grants.join(", ")} (granted by an admin)` : ""
    }. Roles & settings stay admin-only.`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:py-8 lg:flex lg:gap-8">
      <AdminMobileNav groups={groups} />

      <aside className="hidden lg:block w-56 shrink-0">
        <AdminRail groups={groups} staffNote={staffNote} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
