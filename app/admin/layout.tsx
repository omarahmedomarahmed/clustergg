import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin, isStaff } from "@/lib/auth";
import { areaAllowed, getStaffGrants } from "@/lib/permissions";
import { AdminRail, AdminMobileNav } from "@/components/AdminNav";
import { navFor, accessOf } from "@/lib/admin-nav";
import { countPendingRequests } from "@/lib/challenge-requests";

// The chrome only. Which pages exist, what they do and who may open them all
// live in lib/admin-nav.ts, shared with the command centre.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user)) redirect("/feed");
  const admin = isAdmin(user);
  const grants = admin ? [] : await getStaffGrants();

  // The rail and the command centre read the SAME map (lib/admin-nav.ts), so a
  // page can't exist in one and not the other.
  const nav = navFor(admin, grants, areaAllowed);

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
      access: accessOf(i.area),
      badge: i.href === "/admin/discord/requests" ? pendingRequests : undefined,
    })),
  }));

  // Staff see what they have, not a list of locked doors. Admins see the same
  // rail with each item marked, so delegating is a visible decision.
  const staffNote = admin
    ? undefined
    : `You have staff access${grants.length > 0 ? `, plus ${grants.join(", ")} granted by an admin` : ""}. Anything admin-only is hidden rather than shown locked — ask an admin on /admin/roles.`;

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
