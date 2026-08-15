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

export type Staff = { userId: string; department: Department; name: string };

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
  const staff = await staffFor(db, gamer?.id ?? null);
  if (staff) return staff;

  if (isDemoMode) {
    return { userId: "demo-admin", department: "admin", name: "Demo Admin" };
  }
  return null;
}

/** Called once, by the admin layout. Every page under it is covered. */
export async function requireAdminAccess(): Promise<Staff> {
  const staff = await currentStaff();
  const route = (await headers()).get("x-pathname") ?? "/admin";

  if (!staff) redirect("/signup");
  if (!mayAccess(accessFor(route), staff.department)) {
    redirect(`/admin?denied=${encodeURIComponent(route)}`);
  }
  return staff;
}
