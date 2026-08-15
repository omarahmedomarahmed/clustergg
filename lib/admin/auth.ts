// Who may see which admin page.
//
// ===== HOUSE RULE 7 IS ABSOLUTE =====
//
//   `/admin/users` and `/admin/linked-accounts` are **admin-only**. No staff
//   department reaches the gamer directory, ever.
//
// "Ever" is doing work in that sentence. It is not "admins and whoever needs
// it": the gamer directory is names, ages, countries and linked game accounts,
// and a finance clerk approving a redemption needs the trophy and the amount,
// not the person's whole life. So the department list for those two pages is
// empty, and the type system says so — `ADMIN_ONLY` is not a role set anyone
// can be added to at a call site.
//
// The gate is a function of the page, not of the person. A page declares what
// it needs; a person has a department; the check is one comparison, in one
// place, and a page cannot forget to call it because the layout calls it.

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";

/** Every department. `admin` is not a department, it is everything. */
export const DEPARTMENTS = ["admin", "finance", "support", "sales"] as const;
export type Department = (typeof DEPARTMENTS)[number];

/**
 * The access a page requires.
 *
 * `admin_only` is deliberately not "the set containing admin" — it is its own
 * kind, so that a well-meaning edit widening a department list cannot reach
 * the two pages that must never widen.
 */
export type Access = { kind: "admin_only" } | { kind: "departments"; allow: Department[] };

export const ADMIN_ONLY: Access = { kind: "admin_only" };
export const departments = (...allow: Department[]): Access => ({ kind: "departments", allow });

/**
 * What each admin route requires. **One table, walked by a test.**
 *
 * A route missing from here fails closed — `accessFor` returns `ADMIN_ONLY`
 * for anything it does not recognise, so forgetting to add a page makes it
 * *more* restricted rather than less. The opposite default is how a directory
 * ends up readable by sales.
 */
export const ROUTE_ACCESS: Record<string, Access> = {
  "/admin": departments("admin", "finance", "support", "sales"),
  "/admin/challenges": departments("admin", "sales"),
  "/admin/vaults": departments("admin", "finance"),
  "/admin/vaults/prize": departments("admin", "finance"),
  "/admin/vaults/server": departments("admin", "finance"),
  "/admin/trophies": departments("admin", "finance"),
  "/admin/brands": departments("admin", "sales"),
  "/admin/servers": departments("admin", "sales", "support"),
  "/admin/payouts": departments("admin", "finance"),
  "/admin/redeems": departments("admin", "finance"),
  "/admin/weekend": departments("admin", "finance", "support", "sales"),
  "/admin/settings": ADMIN_ONLY,

  // ===== The two that are never anything else. =====
  "/admin/users": ADMIN_ONLY,
  "/admin/linked-accounts": ADMIN_ONLY,
};

/**
 * Fails closed: an unknown route is admin-only until somebody says otherwise.
 *
 * ===== `/admin` MATCHES EXACTLY, AND THAT IS THE WHOLE GUARD =====
 *
 * The first version of this used a plain longest-prefix match, and the
 * dashboard's own entry defeated it: `/admin` is a prefix of every admin
 * route, so `/admin/anything-unclassified` inherited the dashboard's rule —
 * which is the LOOSEST one on the platform, open to all four departments.
 * The fail-closed default was unreachable, and a page added in a hurry would
 * have been readable by sales.
 *
 * Found by the test that asserts the default, which is the only reason it was
 * found at all: every other assertion in the suite passed.
 *
 * So the root is matched exactly and prefix inheritance starts one level down,
 * where it is what you want — `/admin/users/abc` inheriting `/admin/users`.
 */
export function accessFor(route: string): Access {
  if (route === "/admin") return ROUTE_ACCESS["/admin"];
  const match = Object.keys(ROUTE_ACCESS)
    .filter((r) => r !== "/admin")
    .filter((r) => route === r || route.startsWith(`${r}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_ACCESS[match] : ADMIN_ONLY;
}

export function mayAccess(access: Access, department: Department | null): boolean {
  if (!department) return false;
  if (access.kind === "admin_only") return department === "admin";
  return access.allow.includes(department);
}

/** The staff member behind a session, or null. */
export async function staffFor(
  db: DB,
  userId: string | null,
): Promise<{ userId: string; department: Department; name: string } | null> {
  if (!userId) return null;
  const [row] = await db.select().from(schema.staff).where(eq(schema.staff.userId, userId));
  if (!row) return null;
  return {
    userId: row.userId,
    department: row.department as Department,
    name: row.name,
  };
}

export async function grantStaff(
  db: DB,
  input: { userId: string; name: string; department: Department },
): Promise<void> {
  await db
    .insert(schema.staff)
    .values(input)
    .onConflictDoUpdate({
      target: schema.staff.userId,
      set: { department: input.department, name: input.name },
    });
}
