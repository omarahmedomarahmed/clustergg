// Creating the first admin. 10-SETUP §2.
//
// ===== THE DOCUMENT SPECIFIED THIS PAGE AND NOTHING BUILT IT =====
//
// 10-SETUP §2 names `/setup`, gives five behaviours in a table and four rules
// under it, and says *"build it exactly like this"*. There was no `/setup`,
// no `SETUP_TOKEN` anywhere in the code, and therefore **no way to create the
// first admin at all** — a deployed platform nobody could administer.
//
// `94-reachability` did not catch it because it reads 04-SURFACES §5's route
// list, and `/setup` is named in 10-SETUP. A guard only covers the document it
// was pointed at.
//
// ===== WHY THE LOGIC IS HERE AND NOT IN THE PAGE =====
//
// Rule 4: *"There is no API-only path to creating an admin. The page is the
// only way."* That is a statement about **routes**, not about modules — the
// action lives on the page and there is no handler under `app/api` that
// reaches this. Keeping the decisions here is what lets the band test all five
// rows of the table without a browser, which is the only reason they are
// tested at all.

import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";

/** What the page should render. One of exactly these, per 10-SETUP §2. */
export type SetupState =
  | { kind: "form" }
  | { kind: "complete"; message: string }
  | { kind: "disabled"; message: string };

export class SetupRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupRefused";
  }
}

/**
 * Is there an admin already?
 *
 * Both grants count. `staff` is the legacy table and `staff_titles` is the
 * current one, and an admin held through either must close this door — asking
 * only one of them is how "it refuses once an admin exists" becomes false
 * without anybody editing this function.
 */
export async function adminExists(db: DB): Promise<boolean> {
  const staff = await db
    .select({ userId: schema.staff.userId })
    .from(schema.staff)
    .where(eq(schema.staff.department, "admin"));
  if (staff.length > 0) return true;

  const titled = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.staffTitles, eq(schema.users.staffTitleId, schema.staffTitles.id));
  return titled.length > 0;
}

/**
 * The three states of the page, in 10-SETUP §2's own order.
 *
 * *"An admin already exists"* is checked **before** the token, deliberately.
 * The other order would let somebody with no token learn whether setup had
 * been completed, and rule 1 is that a forgotten token cannot mint a second
 * admin — the page should not be a probe either.
 */
export async function setupState(db: DB): Promise<SetupState> {
  if (await adminExists(db)) {
    return { kind: "complete", message: "Setup is already complete." };
  }
  if (!process.env.SETUP_TOKEN?.trim()) {
    return { kind: "disabled", message: "Setup is not enabled." };
  }
  return { kind: "form" };
}

/** Rule 2 — compared in constant time, like every other secret here. */
function tokenMatches(submitted: string): boolean {
  const expected = process.env.SETUP_TOKEN?.trim() ?? "";
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(submitted);
  // Length is compared first because `timingSafeEqual` throws on a mismatch.
  // That leaks the length of the token and nothing else, which is the same
  // trade every other constant-time comparison on this platform makes.
  return a.length === b.length && timingSafeEqual(a, b);
}

// ===== RULE 3 — FAILED ATTEMPTS ARE RATE-LIMITED AND AUDITED =====
//
// Counted in `audit_log` rather than in memory. A serverless deployment runs
// however many instances it feels like, and an in-memory counter on one of
// them is a rate limit somebody gets around by retrying — which, for the one
// door that mints an administrator, is not a limit at all.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const FAILED = "setup.failed";

async function recentFailures(db: DB, now: Date): Promise<number> {
  const rows = await db
    .select({ at: schema.auditLog.at })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, FAILED));
  return rows.filter((r) => now.getTime() - r.at.getTime() < WINDOW_MS).length;
}

async function writeAudit(
  db: DB,
  action: string,
  detail: Record<string, unknown>,
  now: Date,
): Promise<void> {
  await db.insert(schema.auditLog).values({
    id: uid(),
    actorId: null,
    action,
    refType: "setup",
    refId: null,
    // The token is never written here, right or wrong. An audit log holding
    // the secret it exists to protect is worse than no audit log.
    detail,
    at: now,
  });
}

/**
 * Create the first admin. Returns the new user id so the page can sign them in.
 *
 * Every refusal is a `SetupRefused` whose message is exactly the sentence
 * 10-SETUP §2 specifies, because the wording is part of the spec: *"never
 * confirm whether a token exists."*
 */
export async function createFirstAdmin(
  db: DB,
  input: { token: string; email: string; password: string; confirm: string },
  now = new Date(),
): Promise<string> {
  // Re-checked here and not merely on the page. A rendered state is a
  // suggestion; this is the rule.
  if (await adminExists(db)) throw new SetupRefused("Setup is already complete.");
  if (!process.env.SETUP_TOKEN?.trim()) throw new SetupRefused("Setup is not enabled.");

  if ((await recentFailures(db, now)) >= MAX_FAILURES) {
    throw new SetupRefused(
      "Too many attempts. Wait fifteen minutes and try again.",
    );
  }

  if (!tokenMatches(input.token)) {
    await writeAudit(db, FAILED, { reason: "bad_token" }, now);
    // Rule: *"Nothing else — never confirm whether a token exists."*
    throw new SetupRefused("That setup token is not right.");
  }

  const { looksLikeEmail } = await import("../identity/verify.ts");
  const email = input.email.trim().toLowerCase();
  if (!looksLikeEmail(email)) throw new SetupRefused("That does not look like an email address.");
  if (input.password !== input.confirm) throw new SetupRefused("The two passwords do not match.");

  const { checkPasswordStrength, hashPassword } = await import("../identity/credentials.ts");
  // Throws `CredentialRefused` with the platform's own wording. Not re-worded
  // here: an admin password and a gamer password are held to one standard, and
  // two copies of "what makes a password acceptable" is how they diverge.
  checkPasswordStrength(input.password);

  const { createGamer } = await import("../identity/gamers.ts");
  const { grantStaff } = await import("./auth.ts");

  const userId = await createGamer(db, {
    displayName: email.split("@")[0],
    email,
    // The person holding SETUP_TOKEN and the deployment are the same person.
    // Requiring them to receive a code from an email service that may not be
    // configured yet would make the first admin depend on RESEND_API_KEY.
    emailVerifiedAt: now,
    passwordHash: await hashPassword(input.password),
    at: now,
  });
  await grantStaff(db, { userId, name: email.split("@")[0], department: "admin" });

  await writeAudit(db, "setup.completed", { userId }, now);
  return userId;
}
