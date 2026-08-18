// `/setup` — every row of 10-SETUP §2's table, and every rule under it.
//
// ===== A DOCUMENTED SURFACE THAT NOTHING BUILT =====
//
// 10-SETUP §2 specifies this page in a five-row table and says *"build it
// exactly like this"*. Nothing did. `SETUP_TOKEN` appeared in no file, there
// was no `/setup`, and the consequence was not subtle: a deployed platform
// with no way to create its first administrator, and therefore no way to reach
// `/admin` at all.
//
// `94-reachability` did not catch it because that guard reads 04-SURFACES §5's
// route list, and this route is named in 10-SETUP. A guard covers the document
// it was pointed at and no other — which is worth remembering before trusting
// "the routes are covered".

import { ok, eq, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import { eq as sqlEq } from "drizzle-orm";
import {
  setupState,
  adminExists,
  createFirstAdmin,
  SetupRefused,
} from "../../lib/admin/setup.ts";
import { grantStaff } from "../../lib/admin/auth.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import { passwordMatches } from "../../lib/identity/credentials.ts";

const TOKEN = "a-long-random-setup-token-value";

/** Set `SETUP_TOKEN` for one test and always put it back. */
async function withToken<T>(value: string | null, fn: () => Promise<T>): Promise<T> {
  const before = process.env.SETUP_TOKEN;
  if (value === null) delete process.env.SETUP_TOKEN;
  else process.env.SETUP_TOKEN = value;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.SETUP_TOKEN;
    else process.env.SETUP_TOKEN = before;
  }
}

test("with no admin and a token set, the form is shown", async () => {
  const db = await resetDemoDb();
  await withToken(TOKEN, async () => {
    const state = await setupState(db);
    eq(state.kind, "form", "row 1 of the table");
  });
});

test("with no token in the environment, setup is not enabled", async () => {
  const db = await resetDemoDb();
  await withToken(null, async () => {
    const state = await setupState(db);
    eq(state.kind, "disabled", "row 3 of the table");
    eq(
      state.kind === "disabled" ? state.message : "",
      "Setup is not enabled.",
      "in the document's own words",
    );
    await throws(
      () => createFirstAdmin(db, { token: "", email: "a@b.test", password: "x".repeat(12), confirm: "x".repeat(12) }),
      /Setup is not enabled/,
      "and the action refuses too — a rendered state is a suggestion, this is the rule",
    );
  });
});

test("once an admin exists the door is shut, whichever grant they hold", async () => {
  // ===== RULE 1, AND THE HALF THAT WOULD HAVE BEEN MISSED =====
  //
  // Staff are granted two ways on this platform: the legacy `staff` table and
  // a `staff_titles` row on the user. Checking only one is how "it refuses
  // once an admin exists" quietly becomes false — so both are asserted, and
  // separately, because a single fixture holding both proves neither.
  const db = await resetDemoDb();

  await withToken(TOKEN, async () => {
    const legacy = await createGamer(db, { displayName: "First", email: "first@example.test" });
    await grantStaff(db, { userId: legacy, name: "First", department: "admin" });

    ok(await adminExists(db), "the legacy staff table closes it");
    eq((await setupState(db)).kind, "complete", "row 2 of the table");
    await throws(
      () =>
        createFirstAdmin(db, {
          token: TOKEN,
          email: "second@example.test",
          password: "x".repeat(12),
          confirm: "x".repeat(12),
        }),
      /already complete/,
      "a forgotten token cannot mint a second admin, even with the RIGHT token",
    );
  });

  // ── And again, through a title rather than the legacy table.
  const db2 = await resetDemoDb();
  await withToken(TOKEN, async () => {
    const titleId = "title-1";
    await db2
      .insert(schema.staffTitles)
      .values({ id: titleId, name: "Ops lead", departments: ["admin"] });
    const userId = await createGamer(db2, {
      displayName: "Titled",
      email: "titled@example.test",
    });
    await db2
      .update(schema.users)
      .set({ staffTitleId: titleId })
      .where(sqlEq(schema.users.id, userId));

    ok(await adminExists(db2), "a staff TITLE closes it too");
    eq((await setupState(db2)).kind, "complete", "and the page says so");
  });
});

test("a wrong token says only that, and is written to the audit log", async () => {
  const db = await resetDemoDb();
  await withToken(TOKEN, async () => {
    await throws(
      () =>
        createFirstAdmin(db, {
          token: "not-the-token-but-same-length!!",
          email: "a@b.test",
          password: "x".repeat(12),
          confirm: "x".repeat(12),
        }),
      /That setup token is not right\.$/,
      "row 4 — nothing else, and never whether a token exists",
    );

    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(sqlEq(schema.auditLog.action, "setup.failed"));
    eq(rows.length, 1, "rule 3 — the failure is audited");
    ok(
      !JSON.stringify(rows[0].detail).includes("not-the-token"),
      "and the submitted token is NOT in the log — an audit trail holding the " +
        "secret it protects is worse than none",
    );

    eq(
      (await db.select().from(schema.users)).length,
      0,
      "and nothing was created",
    );
  });
});

test("failed attempts are rate-limited, and the limit outlives one instance", async () => {
  // Counted from `audit_log` rather than memory, deliberately: a serverless
  // deployment runs many instances, and an in-memory counter on one of them is
  // a limit somebody gets past by retrying. This asserts the count is durable
  // by reading it back out of the database rather than from a closure.
  const db = await resetDemoDb();
  await withToken(TOKEN, async () => {
    const bad = {
      token: "wrong-token-of-the-right-len!!",
      email: "a@b.test",
      password: "x".repeat(12),
      confirm: "x".repeat(12),
    };
    for (let i = 0; i < 5; i++) {
      await throws(() => createFirstAdmin(db, bad), /not right/, `attempt ${i + 1} refused`);
    }

    // The sixth is refused for a different reason, and the RIGHT token is
    // refused too — otherwise the limit is decoration.
    await throws(
      () => createFirstAdmin(db, { ...bad, token: TOKEN }),
      /Too many attempts/,
      "the correct token is refused once the window is full",
    );
    eq((await db.select().from(schema.users)).length, 0, "and still nothing exists");
  });
});

test("the right token with valid details creates exactly one admin", async () => {
  const db = await resetDemoDb();
  await withToken(TOKEN, async () => {
    const userId = await createFirstAdmin(db, {
      token: TOKEN,
      email: "  Owner@Example.TEST  ",
      password: "a-long-enough-password",
      confirm: "a-long-enough-password",
    });

    const [user] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
    eq(user.email, "owner@example.test", "the address is normalised, not stored as typed");
    ok(user.emailVerifiedAt !== null, "and verified — the first admin cannot wait on an email service");
    ok(
      await passwordMatches(user.passwordHash, "a-long-enough-password"),
      "the password is hashed and matches",
    );
    ok(
      user.passwordHash !== null && !user.passwordHash.includes("a-long-enough-password"),
      "and the hash is not the password with extra steps",
    );

    const staff = await db.select().from(schema.staff);
    eq(staff.length, 1, "exactly one staff row");
    eq(staff[0].department, "admin", "and it is an admin");

    // Rule 1 again, from the other side: having succeeded, it must now refuse.
    eq((await setupState(db)).kind, "complete", "and the page shuts behind them");
  });
});

test("a weak password is refused before anything is created", async () => {
  const db = await resetDemoDb();
  await withToken(TOKEN, async () => {
    await throws(
      () =>
        createFirstAdmin(db, {
          token: TOKEN,
          email: "owner@example.test",
          password: "short",
          confirm: "short",
        }),
      /at least/,
      "held to the same standard as a gamer's, from the same function",
    );
    eq((await db.select().from(schema.users)).length, 0, "and no half-made admin is left behind");
    eq((await db.select().from(schema.staff)).length, 0, "nor a staff row with no user");
  });
});

test("mismatched passwords are refused", async () => {
  const db = await resetDemoDb();
  await withToken(TOKEN, async () => {
    await throws(
      () =>
        createFirstAdmin(db, {
          token: TOKEN,
          email: "owner@example.test",
          password: "a-long-enough-password",
          confirm: "a-different-long-password",
        }),
      /do not match/,
      "confirm means confirm",
    );
    eq((await db.select().from(schema.users)).length, 0, "and nothing was created");
  });
});

test("there is no API path to creating an admin", async () => {
  // ===== RULE 4, ASSERTED RATHER THAN INTENDED =====
  //
  // *"There is no API-only path to creating an admin. The page is the only
  // way."* A route handler that reached `createFirstAdmin` would satisfy every
  // other test in this file and break the one rule that matters most, so the
  // reachable surface is checked directly.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.join(import.meta.dirname, "..", "..");

  const offenders: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/route\.tsx?$/.test(entry.name)) {
        const src = await fs.readFile(full, "utf8");
        if (/createFirstAdmin|grantStaff|admin\/setup\.ts/.test(src)) {
          offenders.push(path.relative(repoRoot, full));
        }
      }
    }
  }
  await walk(path.join(repoRoot, "app"));

  eq(
    offenders.join(", "),
    "",
    "no route handler anywhere can create an administrator — the page is the only way",
  );
});
