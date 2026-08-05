import { cache } from "react";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { getCurrentUser, isAdmin, isStaff, type CurrentUser } from "@/lib/auth";
import { SYSTEM_KEYS, systemBy, pathAllowedFor, type SystemDef } from "@/lib/systems";

// Who runs what.
//
// Staff do not hold permissions here — departments do, and a person inherits
// their department's. Access changes by moving somebody between teams rather
// than by editing a per-head checklist, which is the difference between an org
// chart and a spreadsheet of exceptions nobody can audit.
//
// A staff member in no department can open nothing. That is the intended state
// for a new hire on their first morning, and the console says so plainly rather
// than showing them an admin that appears broken.

export type Department = typeof schema.departments.$inferSelect;

export type DepartmentView = Department & {
  /** The systems this department runs, resolved to their definitions. */
  runs: SystemDef[];
  /** Who works here. */
  staff: { id: string; displayName: string; email: string | null; role: string }[];
};

export async function listDepartments(): Promise<DepartmentView[]> {
  try {
    const db = await getDb();
    const [rows, people] = await Promise.all([
      db.select().from(schema.departments).orderBy(asc(schema.departments.name)),
      db.select({
        id: schema.users.id, displayName: schema.users.displayName,
        email: schema.users.email, role: schema.users.role,
        departmentId: schema.users.departmentId,
      }).from(schema.users).where(inArray(schema.users.role, ["staff", "admin", "superadmin"])),
    ]);
    return rows.map((d) => ({
      ...d,
      runs: (d.systems ?? []).map((k) => systemBy(k)).filter((s): s is SystemDef => !!s),
      staff: people.filter((p) => p.departmentId === d.id)
        .map(({ id, displayName, email, role }) => ({ id, displayName, email, role })),
    }));
  } catch { return []; }
}

/** Staff who belong to no department — the people who currently see nothing. */
export async function unassignedStaff() {
  try {
    const db = await getDb();
    const rows = await db.select({
      id: schema.users.id, displayName: schema.users.displayName,
      email: schema.users.email, role: schema.users.role,
      departmentId: schema.users.departmentId,
    }).from(schema.users).where(eq(schema.users.role, "staff"));
    return rows.filter((r) => !r.departmentId);
  } catch { return []; }
}

export async function saveDepartment(input: {
  id?: string; name: string; purpose?: string; systems: string[];
}): Promise<string | null> {
  const name = input.name.trim();
  if (!name) return null;
  // Only real system keys are stored. A typo silently granting nothing is
  // better than a typo silently granting everything.
  const systems = [...new Set(input.systems.filter((s) => (SYSTEM_KEYS as string[]).includes(s)))];
  try {
    const db = await getDb();
    if (input.id) {
      await db.update(schema.departments)
        .set({ name: name.slice(0, 60), purpose: (input.purpose ?? "").slice(0, 400), systems })
        .where(eq(schema.departments.id, input.id));
      return input.id;
    }
    const id = uid();
    await db.insert(schema.departments).values({
      id, name: name.slice(0, 60), purpose: (input.purpose ?? "").slice(0, 400), systems,
    });
    return id;
  } catch { return null; }
}

/**
 * Deleting a department releases its people rather than orphaning them.
 *
 * Without this a deleted department leaves staff pointing at an id that no
 * longer exists — which happens to fail closed, but by accident. Clearing it
 * makes "you have no department" the explicit state it should be.
 */
export async function deleteDepartment(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.update(schema.users).set({ departmentId: null })
      .where(eq(schema.users.departmentId, id));
    await db.delete(schema.departments).where(eq(schema.departments.id, id));
  } catch { /* nothing to do — the caller re-reads the list */ }
}

export async function assignStaff(userId: string, departmentId: string | null): Promise<void> {
  try {
    const db = await getDb();
    await db.update(schema.users).set({ departmentId }).where(eq(schema.users.id, userId));
  } catch { /* the page re-reads and shows the truth */ }
}

// ===== What the person in front of us can open =====

export type Access = {
  user: CurrentUser;
  /** Admins run everything; that is what being an admin is. */
  isAdmin: boolean;
  department: Department | null;
  /** System keys this person can open. */
  systems: string[];
};

/**
 * Who this staff member is and what they run — once per request (B55.2).
 *
 * Called by the admin layout AND by `requireSystemFor` on the page inside it,
 * so an uncached version was at least two identical reads on every admin
 * navigation. `cache()` takes no arguments here, so the dedupe is total.
 */
export const currentAccess = cache(async (): Promise<Access | null> => {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return null;
  if (isAdmin(user)) {
    return { user, isAdmin: true, department: null, systems: [...SYSTEM_KEYS] };
  }
  try {
    const db = await getDb();
    const [me] = await db.select({ departmentId: schema.users.departmentId })
      .from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
    if (!me?.departmentId) return { user, isAdmin: false, department: null, systems: [] };
    const [dept] = await db.select().from(schema.departments)
      .where(eq(schema.departments.id, me.departmentId)).limit(1);
    return {
      user, isAdmin: false,
      department: dept ?? null,
      systems: dept?.systems ?? [],
    };
  } catch {
    // Can't read the department? Grant nothing. A staff console that opens up
    // when the database hiccups is the worst possible failure mode.
    return { user, isAdmin: false, department: null, systems: [] };
  }
});

/**
 * Page guard.
 *
 * Not-staff-at-all throws FORBIDDEN, the same as `requireAdmin`. But a staff
 * member reaching for a page outside their department gets a 404, not a crash:
 * the rail never showed them the link, so as far as their console is concerned
 * the page doesn't exist — and a 404 renders a real page where an uncaught
 * throw renders a 500 and an error digest.
 */
export async function requireSystemFor(path: string): Promise<Access> {
  const access = await currentAccess();
  if (!access) throw new Error("FORBIDDEN");
  if (access.isAdmin) return access;
  if (!pathAllowedFor(access.systems, path)) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return access;
}
