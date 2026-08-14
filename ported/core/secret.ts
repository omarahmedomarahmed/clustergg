// The signing key for every session cookie on the platform.
//
// It had a hardcoded fallback in two places (`lib/auth.ts` and `middleware.ts`),
// which meant a production deploy that simply forgot the variable signed real
// admin sessions with a string that is public in this repository. Anybody who
// could read the source could mint a superadmin cookie. The due-diligence
// report found it; this module is the fix.
//
// The rule: **the fallback exists only where there is no production to protect.**
// A demo database or a test run has no real accounts in it, so a throw there
// would only stop the suite from running. Everywhere else the app refuses to
// start, which is the whole point — a missing key must be loud at deploy time
// rather than silent until somebody notices they can forge a session.
//
// Same shape as `lib/blob.ts`: one module owns the environment variable, and
// nothing else in the codebase reads it.

const FALLBACK = "cluster-demo-secret-set-AUTH_SECRET-in-production";

/** True when there is no real data to protect: the demo DB, or a test run. */
export const isDemoRuntime = () =>
  process.env.DEMO_DB === "1" || process.env.NODE_ENV === "test";

/**
 * The raw secret, or a throw.
 *
 * Called at module scope in both `lib/auth.ts` and `middleware.ts`, so an
 * unset variable fails the very first request rather than the first *login* —
 * a boot failure is a deploy that visibly did not work, which is what we want.
 */
export function authSecret(): string {
  const set = process.env.AUTH_SECRET?.trim();
  if (set) {
    // A deploy that pasted the placeholder is the same hole with extra steps.
    if (set === FALLBACK) {
      throw new Error(
        "AUTH_SECRET is set to the old public placeholder. Generate a real one: openssl rand -base64 32",
      );
    }
    if (set.length < 16) {
      throw new Error(`AUTH_SECRET is ${set.length} characters. Use at least 16: openssl rand -base64 32`);
    }
    return set;
  }
  if (isDemoRuntime()) return FALLBACK;
  throw new Error(
    "AUTH_SECRET is not set. The app will not start without it — it signs every session cookie. " +
      "Generate one with: openssl rand -base64 32",
  );
}

/** The same key, encoded the way `jose` wants it. */
export const authSecretKey = () => new TextEncoder().encode(authSecret());
