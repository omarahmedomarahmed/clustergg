import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isAdmin, isStaff } from "@/lib/auth";
import { AdminRail, AdminMobileNav } from "@/components/AdminNav";
import { navFor, navForSystems, accessOf } from "@/lib/admin-nav";
import { areaAllowed, getStaffGrants } from "@/lib/permissions";
import { currentAccess } from "@/lib/departments";
import { pathAllowedFor, systemBy } from "@/lib/systems";
import { countPendingRequests } from "@/lib/challenge-requests";

// The chrome only. Which pages exist and what they do live in lib/admin-nav.ts;
// who may open them lives in lib/systems.ts and a person's department.
//
// The rail is built from the SAME predicate the page guards use, so it can
// never offer a link that would then 403. A console listing doors you can't
// open is worse than one listing fewer.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user)) redirect("/feed");
  const admin = isAdmin(user);

  const access = await currentAccess();
  const systems = access?.systems ?? [];
  const department = access?.department ?? null;

  // Admins keep the whole map, still filtered by the legacy area grants so the
  // "admin only" pages stay admin only. Staff get exactly their department's
  // systems and nothing else.
  const grants = admin ? [] : await getStaffGrants();
  const nav = admin
    ? navFor(true, grants, areaAllowed)
    : navForSystems(systems, pathAllowedFor);

  const pendingRequests = admin || systems.includes("challenges")
    ? await countPendingRequests()
    : 0;

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

  const staffNote = admin
    ? undefined
    : department
      ? `${department.name} — you run ${department.systems.map((s) => systemBy(s)?.name ?? s).join(", ") || "nothing yet"}. Everything outside your systems is hidden rather than locked.`
      : undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:py-8 lg:flex lg:gap-8">
      <AdminMobileNav groups={groups} />

      <aside className="hidden lg:block w-56 shrink-0">
        <AdminRail groups={groups} staffNote={staffNote} />
      </aside>
      <div className="min-w-0 flex-1">
        {/* A staff member nobody has placed yet. Not an error — somebody has to
            decide what they run before they can run it — so it says exactly
            that instead of showing an admin that looks broken. */}
        {!admin && !department ? <NoDepartment name={user.displayName} /> : children}
      </div>
    </div>
  );
}

function NoDepartment({ name }: { name: string }) {
  return (
    <div className="glass max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Welcome, {name}.</h1>
      <p className="mt-2 text-muted">
        You have a staff account but you&apos;re not in a department yet, so there&apos;s nothing here to
        run. Cluster is organised into systems — the bot, challenges, trophies and payout, billing, and so
        on — and each one is owned by a department. When someone puts you in one, this console fills with
        that system&apos;s pages, its numbers, and a brief explaining what the job actually is.
      </p>
      <p className="mt-3 text-sm text-muted">
        Ask a super admin to place you. In the meantime you can{" "}
        <Link href="/admin/systems" className="text-cyan-300 hover:underline">read what each system does</Link>{" "}
        — that page is open to everyone on staff.
      </p>
    </div>
  );
}
