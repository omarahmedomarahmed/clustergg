import { randomBytes } from "crypto";

// The two portal key generators, and NOTHING ELSE.
//
// ===== WHY THEY LIVE IN A LEAF MODULE =====
//
// `newPortalKey` was in `lib/portal-auth.ts` and `newAccessKey` in
// `lib/brands.ts`. Both of those import things a client bundle must never
// reach: portal-auth imports `next/headers`, brands imports the database.
//
// That was fine while only server code generated keys. BR1 made `lib/db/index.ts`
// generate them too — the boot-time rotation of any predictable `DEMO-` key —
// and `lib/db/index.ts` is reachable from a client component through an
// ordinary chain of type and value imports:
//
//   components/VerifyAccount.tsx → lib/account-ownership.ts → lib/db/index.ts
//     → lib/demo-keys.ts → lib/portal-auth.ts → next/headers
//
// `next build` failed on it. `tsc` did not, and could not: the client/server
// boundary is not a type. This is the exact failure `docs/SETUP.md` warns the
// build step exists to catch, and it caught it.
//
// A leaf module with one import from `node:crypto` cannot drag anything into a
// client bundle, so the chain is cut at the point where it started. Both
// original modules re-export from here, so every existing call site is
// unchanged and there is no second definition to drift.

/**
 * A server owner's portal key.
 *
 * Short enough to paste from a DM, long enough to be unguessable (32^12 ≈
 * 2^60), and free of the characters that get misread when somebody types it
 * off a phone: no O/0, no I/1.
 */
export function newPortalKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) out += "-";
  }
  return out;
}

/**
 * A brand's access key.
 *
 * Human-typable, and not a secret token in the cryptographic sense — it gates a
 * read-mostly dashboard. It must still be UNGUESSABLE, which is the whole of
 * BR1: the seeds used to derive it from the brand's own public slug.
 */
export function newAccessKey(): string {
  const raw = randomBytes(9).toString("base64url").replace(/[-_]/g, "").toUpperCase().slice(0, 12);
  return `CLSTR-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}
