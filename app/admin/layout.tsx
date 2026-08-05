import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getCurrentUser, isAdmin, isStaff } from "@/lib/auth";
import { AdminRail, AdminMobileNav, AdminSectionTabs } from "@/components/AdminNav";
import { navFor, navForSystems, accessOf, homeOf } from "@/lib/admin-nav";
import { areaAllowed, getStaffGrants } from "@/lib/permissions";
import { currentAccess } from "@/lib/departments";
import { pathAllowedFor, systemBy } from "@/lib/systems";
import { ADMIN_PATH_HEADER } from "@/middleware";
import { countPendingRequests } from "@/lib/challenge-requests";
import { unreadThreadCount } from "@/lib/threads";

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

  // The two queues the rail is allowed to shout about. Everything else is a
  // page you go to; these are people waiting on a person.
  const [pendingRequests, waitingMessages] = await Promise.all([
    admin || systems.includes("challenges") ? countPendingRequests() : 0,
    admin || systems.includes("bot") || systems.includes("brand")
      // B55.1: a count(distinct), not a scan of every message body.
      ? unreadThreadCount().catch(() => 0)
      : 0,
  ]);

  const groups = nav.map((g) => ({
    section: g.section,
    icon: g.icon,
    home: homeOf(g),
    items: g.items.map((i) => ({
      href: i.href,
      label: i.label,
      exact: i.exact,
      access: accessOf(i.area),
      badge: i.href === "/admin/discord/requests" ? pendingRequests
        : i.href === "/admin/messages" ? waitingMessages
        : undefined,
    })),
  }));

  // ===== The boundary, enforced once =====
  //
  // The rail only ever offered a department the pages it owns, and that is a
  // suggestion: three of forty-odd admin pages called a guard of their own, so
  // typing the URL of somebody else's page worked. It is checked here instead,
  // for every admin page at once, using the same predicate that built the rail.
  //
  // `notFound()` rather than a message: a console that says "you may not open
  // the ad desk" tells a staff member what to ask for. 404 is what a page they
  // have no business knowing about should look like.
  const path = (await headers()).get(ADMIN_PATH_HEADER) ?? "";
  if (!admin && path && !pathAllowedFor(systems, path)) notFound();

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
        {!admin && !department ? <NoDepartment name={user.displayName} /> : (
          <>
            {/* The section's pages, as tabs. Rendered once here so every admin
                page gets its own bar without each page remembering to draw
                one — which is what turns a folder of pages into one page with
                panels. */}
            <AdminSectionTabs groups={groups} />
            {children}
          </>
        )}
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
