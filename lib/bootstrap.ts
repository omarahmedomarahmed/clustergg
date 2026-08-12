import { count, eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

// WHO GETS THE FIRST SUPERADMIN, AND WHO DECIDES.
//
// ===== WHAT THIS REPLACED =====
//
// `signUp` read:
//
//     const [{ c }] = await db.select({ c: count() }).from(schema.users);
//     const role = Number(c) === 0 ? "superadmin" : "user";
//
// so on a fresh production database the FIRST PERSON TO FIND THE DOMAIN became
// superadmin. `/signup` is public and a new deployment answers on its URL the
// moment it is live, so the window between "database created" and "the founder
// gets round to signing up" was a race anybody could enter — and `/api/setup`'s
// own response text advertised it: *"The FIRST user to sign up becomes
// superadmin."*
//
// It is worth being precise about why a count is the wrong test. It is not that
// zero users is a bad proxy for "fresh install"; it is that the test has no
// notion of AUTHORITY at all. It asks "is this early?" when the question is
// "are you the operator?".
//
// ===== HOW IT WORKS NOW =====
//
// Bootstrap is bound to `SETUP_TOKEN`, which is the one secret that already
// means "I own this deployment" (`app/api/setup/route.ts` refuses without it,
// and `docs/SETUP.md` treats it as the bootstrap credential).
//
//   1. The operator calls `POST /api/setup?token=…&admin=<their email>`.
//      Holding the token is what makes them the operator; naming the address is
//      what makes the promotion theirs and not a race.
//   2. That address, and only that address, is promoted on signup — and only
//      while no superadmin exists yet.
//
// Both halves are load-bearing. Without the nomination, anybody signs up first.
// Without the "no superadmin yet" check, a nomination left in the settings
// table is a permanent back door: delete the superadmin later and the address
// re-arms itself.
//
// ===== IT FAILS CLOSED =====
//
// A deployment where nobody ran setup, or ran it without `admin=`, mints NO
// superadmin. That is deliberate. The alternative — falling back to "first
// signup wins" when unset — is exactly the hole this closes, and a guard that
// disappears when it is not configured is not a guard (the same argument
// `/api/setup` already makes about `SETUP_TOKEN` itself).

export const BOOTSTRAP_ADMIN_KEY = "bootstrap.superadmin_email";

const normalise = (email: string) => email.trim().toLowerCase();

/**
 * Record which address `/api/setup` nominated.
 *
 * Overwrites any previous nomination: re-running setup with a different address
 * is how an operator corrects a typo, and a nomination that has not been
 * claimed yet has no value to protect.
 */
export async function nominateSuperadmin(db: DB, email: string): Promise<void> {
  await db.insert(schema.platformSettings)
    .values({ key: BOOTSTRAP_ADMIN_KEY, value: { email: normalise(email) } })
    .onConflictDoUpdate({
      target: schema.platformSettings.key,
      set: { value: { email: normalise(email) }, updatedAt: new Date() },
    });
}

/** The nominated address, or null when nobody ran setup with one. */
export async function nominatedSuperadmin(db: DB): Promise<string | null> {
  try {
    const [row] = await db.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.key, BOOTSTRAP_ADMIN_KEY)).limit(1);
    const email = (row?.value as { email?: unknown } | null)?.email;
    return typeof email === "string" && email ? email : null;
  } catch { return null; }
}

/**
 * Is this the address the operator nominated, on a deployment that has no
 * superadmin yet?
 *
 * Returns the role to create the account with, so the call site reads as one
 * decision rather than as a flag somebody has to remember to act on. Anything
 * that goes wrong answers `"user"`: the failure mode of guessing wrong here is
 * asymmetric, and an operator who has to be promoted by hand has lost a minute
 * where the other direction loses the platform.
 */
export async function bootstrapRoleFor(db: DB, email: string): Promise<"superadmin" | "user"> {
  try {
    const nominated = await nominatedSuperadmin(db);
    if (!nominated || nominated !== normalise(email)) return "user";

    const [{ c }] = await db.select({ c: count() }).from(schema.users)
      .where(sql`${schema.users.role} = 'superadmin'`);
    return Number(c) === 0 ? "superadmin" : "user";
  } catch { return "user"; }
}
