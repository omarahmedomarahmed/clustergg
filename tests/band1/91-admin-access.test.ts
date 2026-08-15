// House rule 7, and the shape of the gate that enforces it.
//
//   `/admin/users` and `/admin/linked-accounts` are **admin-only**. No staff
//   department reaches the gamer directory, ever.
//
// "Ever" is the word under test. The risk is not that somebody deliberately
// opens the directory to sales — it is that a route is added and nobody
// remembers to classify it, or that a department list grows by one line in a
// hurry. So the guard is written as three properties:
//
//   1. An unknown route **fails closed**, to admin-only.
//   2. The two directories are `admin_only`, which is its own kind and not a
//      list anybody can append to.
//   3. Every admin route that exists on disk is classified — walked, not
//      listed, so the page somebody adds tomorrow is covered by the same rule.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb } from "../../lib/db/index.ts";
import {
  ROUTE_ACCESS,
  accessFor,
  mayAccess,
  staffFor,
  grantStaff,
  DEPARTMENTS,
  ADMIN_ONLY,
  type Department,
} from "../../lib/admin/auth.ts";
import { createGamer } from "../../lib/identity/gamers.ts";

const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

test("the gamer directory is admin-only, and admin-only is not a list", () => {
  for (const route of ["/admin/users", "/admin/linked-accounts"]) {
    const access = accessFor(route);
    eq(access.kind, "admin_only", `${route} is admin-only by kind, not by membership`);

    for (const department of DEPARTMENTS) {
      const allowed = mayAccess(access, department);
      eq(
        allowed,
        department === "admin",
        `${department} ${department === "admin" ? "reaches" : "does not reach"} ${route}`,
      );
    }
  }
});

test("a sub-route of the directory inherits its access", () => {
  // `/admin/users/abc` must not fall through to a default that is looser than
  // its parent — which is exactly what a naive exact-match lookup would do.
  eq(accessFor("/admin/users/some-gamer-id").kind, "admin_only", "a gamer's page is admin-only");
  eq(
    accessFor("/admin/linked-accounts/xyz").kind,
    "admin_only",
    "and so is one linked account",
  );
});

test("the dashboard itself is reachable by every department", () => {
  // The counterpart to fail-closed, and the assertion that was missing: the
  // fix for the prefix bug excludes `/admin` from prefix matching, and a
  // careless edit to that exclusion would lock every department out of the
  // dashboard instead. Failing closed everywhere is not correct either.
  for (const department of DEPARTMENTS) {
    ok(
      mayAccess(accessFor("/admin"), department),
      `${department} can open the dashboard`,
    );
  }
});

test("an unclassified route fails closed", () => {
  // The direction of the default is the whole safety property. Failing OPEN
  // means the page somebody adds in a hurry is readable by everyone until
  // somebody notices.
  eq(
    accessFor("/admin/something-nobody-classified").kind,
    "admin_only",
    "an unknown admin route is admin-only until somebody says otherwise",
  );
  no(
    mayAccess(accessFor("/admin/brand-new-page"), "sales"),
    "so a new page is not reachable by a department by accident",
  );
});

test("every admin page on disk is classified", async () => {
  // Walked, not listed. A guard with a hand-maintained route list only guards
  // the routes somebody remembered.
  const adminDir = path.join(repoRoot, "app", "admin");
  const routes: string[] = [];

  async function walk(dir: string, route: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // A dynamic segment inherits its parent's access, which is what
        // `accessFor`'s prefix match gives us.
        await walk(full, entry.name.startsWith("[") ? route : `${route}/${entry.name}`);
      } else if (entry.name === "page.tsx") {
        routes.push(route);
      }
    }
  }
  await walk(adminDir, "/admin");

  ok(routes.length > 5, "the walk found the admin pages");
  ok(routes.includes("/admin/users"), "including the gamer directory");

  const unclassified = [...new Set(routes)].filter(
    (r) => !Object.prototype.hasOwnProperty.call(ROUTE_ACCESS, r),
  );
  eq(
    unclassified,
    [],
    "every admin page has an explicit access rule — an unclassified page is " +
      "admin-only, which is safe, but silence is not a decision",
  );
});

test("no department list ever contains the directories", () => {
  // The property, stated directly: whatever `ROUTE_ACCESS` grows into, the two
  // directories must never become a `departments(...)` entry.
  for (const route of ["/admin/users", "/admin/linked-accounts"]) {
    const access = ROUTE_ACCESS[route];
    eq(access, ADMIN_ONLY, `${route} is the shared ADMIN_ONLY value, not a copy of it`);
  }

  const widened = Object.entries(ROUTE_ACCESS)
    .filter(([route]) => /\/(users|linked-accounts)$/.test(route))
    .filter(([, access]) => access.kind !== "admin_only")
    .map(([route]) => route);
  eq(widened, [], "and nothing named like a directory has been widened");
});

test("a department reaches what it should and nothing more", () => {
  const cases: [Department, string, boolean][] = [
    ["finance", "/admin/redeems", true],
    ["finance", "/admin/payouts", true],
    ["finance", "/admin/vaults/prize", true],
    ["finance", "/admin/users", false],
    ["finance", "/admin/linked-accounts", false],
    ["sales", "/admin/brands", true],
    ["sales", "/admin/challenges", true],
    ["sales", "/admin/redeems", false],
    ["sales", "/admin/users", false],
    ["support", "/admin/servers", true],
    ["support", "/admin/users", false],
    ["admin", "/admin/users", true],
    ["admin", "/admin/settings", true],
  ];
  for (const [department, route, expected] of cases) {
    eq(
      mayAccess(accessFor(route), department),
      expected,
      `${department} ${expected ? "reaches" : "does not reach"} ${route}`,
    );
  }
});

test("somebody with no staff row reaches nothing", () => {
  for (const route of Object.keys(ROUTE_ACCESS)) {
    no(mayAccess(accessFor(route), null), `${route} is closed to a non-staff visitor`);
  }
});

test("staff are stored apart from gamers", async () => {
  // A `department` column on `users` would put the answer inside the table
  // house rule 7 exists to keep people out of.
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Works Here" });

  eq(await staffFor(db, userId), null, "a gamer is not staff by default");
  await grantStaff(db, { userId, name: "Works Here", department: "finance" });

  const staff = await staffFor(db, userId);
  eq(staff?.department, "finance", "until they are granted a department");
  no(
    mayAccess(accessFor("/admin/users"), staff?.department ?? null),
    "and finance still does not reach the directory",
  );

  await grantStaff(db, { userId, name: "Works Here", department: "admin" });
  ok(
    mayAccess(accessFor("/admin/users"), (await staffFor(db, userId))?.department ?? null),
    "a promotion to admin does",
  );
});
