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

// WIRED FROM ported/core/secret.ts. One change, and it is deliberate.
//
// The original decided "is this a demo?" from `DEMO_DB=1` or `NODE_ENV=test`.
// `lib/db/index.ts` decides the same question from the absence of
// `DATABASE_URL`. Two definitions of the same word drift, and this pair drifts
// in the worst possible direction: a deploy with a real database but no
// `DEMO_DB` set is protected, while a deploy with a real database and a
// leftover `DEMO_DB=1` would sign real sessions with a string printed in this
// file. So `isDemoRuntime` now defers to `isDemoMode` — one definition of
// demo, in the module that owns the connection — and keeps the original
// triggers as well, so nothing that used to be a demo stops being one.

import { isDemoMode } from "../db/index.ts";

const FALLBACK = "cluster-demo-secret-set-AUTH_SECRET-in-production";

/** The floor docs/10-SETUP.md states to the owner. Imported, never retyped. */
export const MIN_SECRET_LENGTH = 32;

/** True when there is no real data to protect: the demo DB, or a test run. */
export const isDemoRuntime = () =>
  isDemoMode || process.env.DEMO_DB === "1" || process.env.NODE_ENV === "test";

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
        "AUTH_SECRET is set to the old public placeholder. Replace it with a real\n" +
        "32+ character random string in the hosting dashboard (docs/10-SETUP.md).",
      );
    }
    // Raised from the ported 16. docs/10-SETUP.md tells the owner "any 32+
    // character random string", and a floor looser than the instruction is a
    // floor that quietly permits what the instruction forbade.
    if (set.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `AUTH_SECRET is ${set.length} characters. Use at least ` +
          `${MIN_SECRET_LENGTH} (docs/10-SETUP.md).`,
      );
    }
    return set;
  }
  if (isDemoRuntime()) return FALLBACK;
  throw new Error(
    "AUTH_SECRET is not set. The app will not start without it — it signs every\n" +
      "session cookie. Set it in the hosting dashboard (docs/10-SETUP.md).",
  );
}

