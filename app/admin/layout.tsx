// The admin shell. **The gate is here**, so no page can forget it.

import Link from "next/link";
import { requireAdminAccess } from "../../lib/admin/session.ts";
import { ROUTE_ACCESS, mayAccess } from "../../lib/admin/auth.ts";

export const dynamic = "force-dynamic";

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/challenges", label: "Challenges" },
  { href: "/admin/challenges/new", label: "Build" },
  { href: "/admin/vaults", label: "Vaults" },
  { href: "/admin/vaults/prize", label: "Prize vault" },
  { href: "/admin/vaults/ledger", label: "Ledger" },
  { href: "/admin/trophies", label: "Trophies" },
  { href: "/admin/trophies/templates", label: "Templates" },
  { href: "/admin/redeems", label: "Redeems" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/invoices", label: "Invoices" },
  { href: "/admin/brands", label: "Brands" },
  { href: "/admin/servers", label: "Servers" },
  { href: "/admin/servers/requests", label: "Requests" },
  { href: "/admin/users", label: "Gamers" },
  { href: "/admin/linked-accounts", label: "Linked accounts" },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/cards", label: "Cards" },
  { href: "/admin/weekend", label: "Weekend" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireAdminAccess();

  // Only the links this department may actually open. A nav that shows a door
  // somebody cannot walk through teaches them the console is broken.
  const visible = NAV.filter((n) => mayAccess(ROUTE_ACCESS[n.href], staff.department));

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3 text-sm">
          <span className="font-semibold tracking-tight">ClusterGG admin</span>
          {visible.map((n) => (
            <Link key={n.href} href={n.href} className="text-mute hover:text-white">
              {n.label}
            </Link>
          ))}
          <span className="ml-auto text-xs text-mute">
            {staff.name} · {staff.department}
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
