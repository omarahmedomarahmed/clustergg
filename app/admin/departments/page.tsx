import Link from "next/link";
import { inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { listDepartments } from "@/lib/departments";
import { SYSTEMS } from "@/lib/systems";
import DepartmentEditor from "@/components/DepartmentEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Departments" };

// The org chart.
//
// Admin-only, because deciding who runs what is the one call that cannot be
// delegated to the people it affects. Everything else in the console is a tool;
// this is the thing that decides who holds which tool.
export default async function DepartmentsPage() {
  await requireAdmin();
  const db = await getDb();
  const [departments, staff] = await Promise.all([
    listDepartments(),
    db.select({
      id: schema.users.id, displayName: schema.users.displayName,
      email: schema.users.email, departmentId: schema.users.departmentId,
    }).from(schema.users).where(inArray(schema.users.role, ["staff", "admin", "superadmin"])),
  ]);

  return (
    <div className="max-w-4xl">
      <div className="mb-2 flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Departments</h1>
        <Link href="/admin/systems" className="text-sm text-cyan-300 hover:underline">The systems →</Link>
      </div>
      <p className="mb-8 max-w-3xl text-sm text-muted">
        Cluster is {SYSTEMS.length} systems, and every one of them is somebody&apos;s job. A department runs
        one or more systems; a staff member is put in a department and inherits it. Nobody holds a personal
        list of permissions — you change what someone can do by moving them, which is the difference between
        an org chart and a spreadsheet of exceptions.
      </p>
      <p className="mb-8 max-w-3xl rounded-xl border border-white/12 bg-black/25 p-4 text-sm text-muted">
        Admins see every page regardless. Departments exist for everyone else: a staff member sees only their
        systems, and a staff member in no department sees nothing at all — which is the correct first-morning
        state, not a fault.
      </p>

      <DepartmentEditor
        departments={departments.map((d) => ({
          id: d.id, name: d.name, purpose: d.purpose,
          systems: d.systems ?? [], staff: d.staff,
        }))}
        staff={staff}
      />
    </div>
  );
}
