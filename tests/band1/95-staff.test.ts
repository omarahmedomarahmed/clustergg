// Staff titles — the grant that opens the console.
//
// ===== THE COLUMN SHIPPED BEFORE THE GATE, AND THAT IS THE POINT =====
//
// `users.staffTitleId` arrived with sprint 3's schema. For one sprint it was a
// column that opens the admin console with **nothing enforcing who may write
// it**. Nothing exploited it, because nothing wrote it at all — but a column
// like that is one careless `db.update` away from being the whole security
// model, and "nobody has written it yet" is not a guard.
//
// So these are the two properties: only the super admin may grant, and no
// title reaches the gamer directory however many departments it names.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import { eq as sqlEq } from "drizzle-orm";
import { createGamer } from "../../lib/identity/gamers.ts";
import {
  createStaffTitle,
  grantStaffTitle,
  departmentsForTitle,
  isSuperAdmin,
  SUPER_ADMIN,
  StaffRefused,
} from "../../lib/admin/staff.ts";
import { DEPARTMENTS, accessFor, mayAccess, ROUTE_ACCESS } from "../../lib/admin/auth.ts";

test("only the super admin can create a title", async () => {
  const db = await resetDemoDb();

  for (const department of DEPARTMENTS.filter((d) => d !== SUPER_ADMIN)) {
    await throws(
      () =>
        createStaffTitle(db, {
          name: "Finance lead",
          departments: ["finance"],
          actorDepartment: department,
          actorId: "someone",
        }),
      /Only the super admin/,
      `${department} cannot create a title`,
    );
  }

  const id = await createStaffTitle(db, {
    name: "Finance lead",
    departments: ["finance"],
    actorDepartment: SUPER_ADMIN,
    actorId: "the-boss",
  });
  ok(id.length > 0, "and the super admin can");
});

test("only the super admin can grant or revoke one", async () => {
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Works Here" });
  const titleId = await createStaffTitle(db, {
    name: "Support",
    departments: ["support"],
    actorDepartment: SUPER_ADMIN,
    actorId: "the-boss",
  });

  for (const department of DEPARTMENTS.filter((d) => d !== SUPER_ADMIN)) {
    await throws(
      () =>
        grantStaffTitle(db, {
          userId,
          titleId,
          actorDepartment: department,
          actorId: "someone",
        }),
      /Only the super admin/,
      `${department} cannot grant a title`,
    );
  }

  // The refusal has to hold for revoking too — "who took my access away" is as
  // much a question as "who gave it".
  await throws(
    () =>
      grantStaffTitle(db, {
        userId,
        titleId: null,
        actorDepartment: "finance",
        actorId: "someone",
      }),
    /Only the super admin/,
    "and finance cannot revoke one either",
  );

  await grantStaffTitle(db, { userId, titleId, actorDepartment: SUPER_ADMIN, actorId: "the-boss" });
  const [row] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
  eq(row.staffTitleId, titleId, "the super admin can");
});

test("every grant is logged, in both directions", async () => {
  // ST1 — "logged" is part of the rule. A console grant with no record is a
  // console grant nobody can question.
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Works Here" });
  const titleId = await createStaffTitle(db, {
    name: "Sales",
    departments: ["sales"],
    actorDepartment: SUPER_ADMIN,
    actorId: "the-boss",
  });
  await grantStaffTitle(db, { userId, titleId, actorDepartment: SUPER_ADMIN, actorId: "the-boss" });
  await grantStaffTitle(db, {
    userId,
    titleId: null,
    actorDepartment: SUPER_ADMIN,
    actorId: "the-boss",
  });

  const log = await db.select().from(schema.auditLog);
  const actions = log.map((l) => l.action);
  ok(actions.includes("staff_title_created"), "creating a title is logged");
  ok(actions.includes("staff_title_granted"), "granting is logged");
  ok(actions.includes("staff_title_revoked"), "and so is revoking");
});

test("a title reaches at least one real department", async () => {
  const db = await resetDemoDb();
  await throws(
    () =>
      createStaffTitle(db, {
        name: "Nothing",
        departments: [],
        actorDepartment: SUPER_ADMIN,
        actorId: "the-boss",
      }),
    /at least one department/,
    "an empty title is refused",
  );
  await throws(
    () =>
      createStaffTitle(db, {
        name: "Invented",
        departments: ["legal", "marketing"],
        actorDepartment: SUPER_ADMIN,
        actorId: "the-boss",
      }),
    /at least one department/,
    "and so is one made of departments that do not exist",
  );
});

test("no title reaches the gamer directory, whatever it says", async () => {
  // ===== ST2, AND HOUSE RULE 7 =====
  //
  // The interesting case is a title that names EVERY department. It must still
  // be refused, because `ADMIN_ONLY` is its own kind and not a department list
  // — the thing sprint 1's `lib/admin/auth.ts` was built around.
  const db = await resetDemoDb();
  const titleId = await createStaffTitle(db, {
    name: "Everything",
    departments: [...DEPARTMENTS],
    actorDepartment: SUPER_ADMIN,
    actorId: "the-boss",
  });

  const departments = await departmentsForTitle(db, titleId);
  eq(departments.length, DEPARTMENTS.length, "the title really does name every department");

  for (const route of ["/admin/users", "/admin/linked-accounts", "/admin/staff"]) {
    const access = accessFor(route);
    eq(access.kind, "admin_only", `${route} is admin-only by kind`);
    // Only the `admin` department passes, and it passes because it IS admin —
    // not because the title granted it.
    const reached = departments.filter((d) => mayAccess(access, d));
    eq(reached, ["admin"], `and a title naming everything reaches ${route} only as admin`);
  }
});

test("the staff route is admin-only by kind, not by membership", () => {
  // The same shape as the two directories: a shared `ADMIN_ONLY` value, so a
  // well-meaning edit widening a department list cannot reach it.
  eq(ROUTE_ACCESS["/admin/staff"], ROUTE_ACCESS["/admin/users"], "the same value, not a copy");
  eq(accessFor("/admin/staff/anything").kind, "admin_only", "and a sub-route inherits it");
});

test("a staff grant changes nothing about being a gamer", async () => {
  // A10/U7/U8. The one place this could go wrong is somebody deciding a staff
  // member is a different kind of record. They are not: same row, same
  // onboarding, same everything.
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Plays And Works" });
  const titleId = await createStaffTitle(db, {
    name: "Support",
    departments: ["support"],
    actorDepartment: SUPER_ADMIN,
    actorId: "the-boss",
  });

  const [before] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
  await grantStaffTitle(db, { userId, titleId, actorDepartment: SUPER_ADMIN, actorId: "the-boss" });
  const [after] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));

  eq(after.ageBand, before.ageBand, "the age band is untouched");
  eq(after.country, before.country, "so is the country");
  eq(after.parentGuildId, before.parentGuildId, "so is the parent server");
  eq(after.status, before.status, "and they are still an ordinary active gamer");
  ok(after.staffTitleId !== null, "the only thing that changed is what they can open");
});

test("isSuperAdmin is the rule, not a string comparison at a call site", () => {
  ok(isSuperAdmin("admin"), "admin is the super admin");
  for (const d of DEPARTMENTS.filter((x) => x !== "admin")) {
    no(isSuperAdmin(d), `${d} is not`);
  }
  no(isSuperAdmin(null), "and neither is nobody");
});

test("the refusal type is the one the page catches", async () => {
  const db = await resetDemoDb();
  let caught: unknown = null;
  try {
    await createStaffTitle(db, {
      name: "Nope",
      departments: ["finance"],
      actorDepartment: "finance",
      actorId: "someone",
    });
  } catch (e) {
    caught = e;
  }
  ok(caught instanceof StaffRefused, "so it renders as a refusal rather than a crash");
});
