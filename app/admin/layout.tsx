import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";

const NAV: { section: string; items: { href: string; label: string }[] }[] = [
  {
    section: "Overview",
    items: [{ href: "/admin", label: "Dashboard" }, { href: "/admin/audit-log", label: "Audit log" }],
  },
  {
    section: "Community",
    items: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/roles", label: "Roles" },
      { href: "/admin/linked-accounts", label: "Linked accounts" },
      { href: "/admin/spaces", label: "Spaces" },
      { href: "/admin/spaces/requests", label: "Space requests" },
    ],
  },
  {
    section: "Competition",
    items: [
      { href: "/admin/badges", label: "Badges" },
      { href: "/admin/leaderboards", label: "Leaderboards" },
      { href: "/admin/challenges", label: "Challenges" },
    ],
  },
  {
    section: "Monetization",
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
    items: [{ href: "/admin/settings", label: "Settings" }],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/feed");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 flex gap-8">
      <aside className="hidden lg:block w-52 shrink-0">
        <div className="glass p-4 sticky top-20 space-y-5">
          <div className="text-xs uppercase tracking-widest text-amber-300">⚙ Mission Control</div>
          {NAV.map((group) => (
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
