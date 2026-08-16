// The admin session, and the gate every admin page passes through.
//
// The gate is in the LAYOUT, not in each page. A page that has to remember to
// check is a page that can forget, and the one it would forget is whichever
// one somebody adds in a hurry — which is exactly the page that would leak the
// gamer directory.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, isDemoMode } from "../db/index.ts";
import { currentGamer } from "../auth/current.ts";
import { staffFor, accessFor, mayAccess, type Department } from "./auth.ts";

export type Staff = {
  userId: string;
  /** The first department. Kept for every call site that asks one question. */
  department: Department;
  /** Every department this title reaches. A title may reach more than one. */
  departments: Department[];
  name: string;
};

/**
 * The staff member for this request.
 *
 * In demo mode, with no staff row anywhere, the first visitor is treated as an
 * admin so the console can be clicked through with nothing configured. That is
 * fenced on `isDemoMode` — a process with a real database has real staff rows
 * and this branch is unreachable.
 */
export async function currentStaff(): Promise<Staff | null> {
  const db = await getDb();
  const gamer = await currentGamer();

  // ===== A10/U7 — STAFF ARE GAMERS, AND THE TITLE IS THE GRANT =====
  //
  // The grant lives on `users.staffTitleId` and points at a `staff_titles`
  // row. Read here so a title that reaches two departments works everywhere
  // the console asks — and read as a LIST, because `accessFor` compares a
  // route against departments and a title like "Finance lead" has two.
  if (gamer?.staffTitleId) {
    const { departmentsForTitle } = await import("./staff.ts");
    const departments = await departmentsForTitle(db, gamer.staffTitleId);
    if (departments.length > 0) {
      return { userId: gamer.id, department: departments[0], departments, name: gamer.slug };
    }
  }

  // The legacy `staff` table, kept until every grant has moved to a title.
  // One department, so the list is that one department.
  const staff = await staffFor(db, gamer?.id ?? null);
  if (staff) return { ...staff, departments: [staff.department] };

  if (isDemoMode) {
    return {
      userId: "demo-admin",
      department: "admin",
      departments: ["admin"],
      name: "Demo Admin",
    };
  }
  return null;
}

/** Called once, by the admin layout. Every page under it is covered. */
export async function requireAdminAccess(): Promise<Staff> {
  const staff = await currentStaff();
  const route = (await headers()).get("x-pathname") ?? "/admin";

  if (!staff) redirect("/signup");
  // Any department the title reaches may open the route. ST2 is unaffected:
  // `ADMIN_ONLY` is its own kind, not a department list, so no title can reach
  // the gamer directory however many departments it names.
  if (!staff.departments.some((d) => mayAccess(accessFor(route), d))) {
    redirect(`/admin?denied=${encodeURIComponent(route)}`);
  }
  return staff;
}
