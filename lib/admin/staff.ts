// Staff titles, and who may grant one.
//
// ===== ST1: ONLY THE SUPER ADMIN. THE COLUMN OPENS THE CONSOLE =====
//
// `users.staffTitleId` is the grant that opens the admin console. It shipped
// in sprint 3 with the schema and **nothing enforcing who may write it** —
// which is a column that opens the console with no gate on it. This module is
// that gate, and nothing else in the codebase may write the column.
//
// A10/U7 — staff are gamers. The grant changes what they can *open*; it
// changes nothing about how they play, score or redeem. U8 spells out why a
// staff member can win a challenge they run and there is no lever to pull:
// the metrics are the same for every entrant, trophy values are held to the
// prize pool by T3, and points come from provider stats we read.
//
// ST2 — whatever a title says, `/admin/users` and `/admin/linked-accounts`
// stay admin-only. A title feeds `lib/admin/auth.ts`; it never overrides it.

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { DEPARTMENTS, type Department } from "./auth.ts";

/**
 * The one department that can grant a title.
 *
 * "Super admin" in the documents. It is the `admin` department, and this
 * constant exists so the check reads as the rule rather than as a string
 * comparison somebody could widen without noticing what they widened.
 */
export const SUPER_ADMIN: Department = "admin";

export class StaffRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffRefused";
  }
}

export function isSuperAdmin(department: Department | null): boolean {
  return department === SUPER_ADMIN;
}

/** Every title, with the departments it reaches. */
export async function staffTitles(db: DB) {
  return db.select().from(schema.staffTitles);
}

export async function createStaffTitle(
  db: DB,
  input: { name: string; departments: string[]; actorDepartment: Department | null; actorId: string },
): Promise<string> {
  requireSuperAdmin(input.actorDepartment, "create a staff title");

  const departments = input.departments.filter((d): d is Department =>
    (DEPARTMENTS as readonly string[]).includes(d),
  );
  if (departments.length === 0) {
    throw new StaffRefused(
      `A title reaches at least one department. The departments are: ${DEPARTMENTS.join(", ")}.`,
    );
  }
  if (!input.name.trim()) throw new StaffRefused("A title needs a name.");

  const id = uid();
  await db.insert(schema.staffTitles).values({
    id,
    name: input.name.trim(),
    departments,
    createdBy: input.actorId,
  });
  await logStaffAction(db, {
    actorId: input.actorId,
    action: "staff_title_created",
    detail: `${input.name.trim()} → ${departments.join(", ")}`,
  });
  return id;
}

/**
 * Grant, or revoke, a title on a gamer.
 *
 * `titleId: null` revokes. Both directions go through the same check and the
 * same log, because "who took my console access away" is as much a question as
 * "who gave it".
 */
export async function grantStaffTitle(
  db: DB,
  input: {
    userId: string;
    titleId: string | null;
    actorDepartment: Department | null;
    actorId: string;
  },
): Promise<void> {
  requireSuperAdmin(input.actorDepartment, "grant or revoke a staff title");

  if (input.titleId) {
    const [title] = await db
      .select()
      .from(schema.staffTitles)
      .where(eq(schema.staffTitles.id, input.titleId));
    if (!title) throw new StaffRefused("No such title.");
  }

  await db
    .update(schema.users)
    .set({ staffTitleId: input.titleId })
    .where(eq(schema.users.id, input.userId));

  await logStaffAction(db, {
    actorId: input.actorId,
    action: input.titleId ? "staff_title_granted" : "staff_title_revoked",
    detail: `${input.userId} → ${input.titleId ?? "none"}`,
  });
}

function requireSuperAdmin(department: Department | null, what: string): void {
  if (!isSuperAdmin(department)) {
    throw new StaffRefused(
      `Only the super admin can ${what}. A title is what opens the console, so ` +
        `granting one is the one thing a title cannot let you do.`,
    );
  }
}

/**
 * The departments a staff title reaches.
 *
 * This is what `lib/admin/auth.ts` compares a route against. It returns a
 * **list**, because a title like "Finance lead" legitimately reaches two — and
 * it can never return anything `ROUTE_ACCESS` treats as `admin_only`, because
 * that kind is not a department list at all (ST2).
 */
export async function departmentsForTitle(
  db: DB,
  titleId: string | null,
): Promise<Department[]> {
  if (!titleId) return [];
  const [title] = await db
    .select()
    .from(schema.staffTitles)
    .where(eq(schema.staffTitles.id, titleId));
  if (!title) return [];
  return (title.departments ?? []).filter((d): d is Department =>
    (DEPARTMENTS as readonly string[]).includes(d),
  );
}

async function logStaffAction(
  db: DB,
  input: { actorId: string; action: string; detail: string },
): Promise<void> {
  // ST1 — "logged" is part of the rule, not a nicety. A console grant with no
  // record is a console grant nobody can question.
  await db.insert(schema.auditLog).values({
    id: uid(),
    actorId: input.actorId,
    action: input.action,
    detail: { what: input.detail },
  });
}
