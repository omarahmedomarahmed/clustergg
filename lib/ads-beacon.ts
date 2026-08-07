// What the ad beacon is allowed to believe. B72.2.
//
// THE FINDING (`docs/DUE_DILIGENCE_REPORT.md`): `app/api/ads/beacon/route.ts`
// was unauthenticated and forgeable. The reviewer minted CP with a single
// `curl`. Reading it end to end there were three holes, not one:
//
//   1. The impression branch awarded CP for any `ccId` anybody posted.
//   2. The `duration` branch updated ANY impression id, with no ownership check.
//   3. Separately, `profile_views_25` was credited from an unauthenticated
//      public page render — a second mint the beacon fix does not touch.
//
// WHY THERE IS NO NONCE HERE, since that was the obvious design and I tried it
// first: `/api/ads/serve` is deliberately cached — public, 60s, shared by every
// visitor — because it is hit on nearly every page load. A per-session nonce
// cannot travel in a shared cached body without handing one visitor's token to
// everyone, and minting it out-of-band costs an extra uncached round trip per
// ad slot on every page.
//
// So the defence is structural instead, and it is stronger than a nonce would
// have been:
//
//   * **CP requires a session.** No session, no CP — ever. That alone ends
//     `curl`-minting, because an attacker with no account has nothing to mint
//     into and one with an account is subject to everything below.
//   * **CP is deduplicated per creative per day**, so a gamer earns the same
//     whether they load the page once or ten thousand times. The old code keyed
//     the award on the impression id, which is fresh every call and therefore
//     deduplicated nothing.
//   * **Impressions are deduplicated per viewer per creative per window**,
//     which also fixes a separate over-count nobody had connected to this: the
//     web slot rotates every 5 seconds and logged a fresh impression on every
//     tick, so one idle open tab produced twelve "views" a minute.
//   * **Ownership on duration**, so a caller can only extend an impression that
//     is theirs.
//   * **Origin and rate limit**, so the count itself cannot be flooded even
//     though it no longer pays anything.

import { createHash } from "crypto";

/**
 * How long one viewer's impression of one creative counts once.
 *
 * An hour, not a page view: the point is that leaving a tab open is not a
 * business. Someone genuinely returning later is a genuinely new impression.
 */
export const IMPRESSION_WINDOW_MS = 60 * 60 * 1000;

/** Beacon calls allowed per viewer per minute, before we stop listening. */
export const BEACON_RATE_LIMIT = 30;

/**
 * Who is calling, for deduplication and rate limiting.
 *
 * A session when there is one, the hashed IP when there is not. The IP is
 * already hashed with `AD_ANALYTICS_SALT` before it reaches us — raw IPs never
 * touch this module or the database.
 */
export const viewerKey = (sessionId: string | null, hashedIp: string): string =>
  sessionId ? `s:${sessionId}` : `i:${hashedIp}`;

/** The dedup key for a logged impression: one viewer, one creative, one window. */
export function impressionKey(viewer: string, ccId: string, at = Date.now()): string {
  const bucket = Math.floor(at / IMPRESSION_WINDOW_MS);
  return createHash("sha256").update(`${viewer}:${ccId}:${bucket}`).digest("hex").slice(0, 32);
}

/**
 * The dedup key for the CP award: one gamer, one creative, one UTC day.
 *
 * Deliberately coarser than the impression window. A gamer should earn the same
 * from a creative whether they saw it once or twenty times, and the daily
 * boundary is the same one the CP ceiling resets on — two different day
 * boundaries in one economy is a bug waiting for a timezone.
 */
export function awardRef(ccId: string, at = new Date()): string {
  return `${ccId}:${at.toISOString().slice(0, 10)}`;
}

// ===== Rate limiting =====
//
// In-memory and per-instance, which is the honest limit of it: a serverless
// deployment has several instances and an attacker spread across them gets that
// multiple. It is a flood guard, not a security boundary — the security
// boundary is that none of this pays CP without a session. Said plainly here so
// nobody later mistakes it for one.

const HITS = new Map<string, { n: number; resetAt: number }>();

export function rateLimited(viewer: string, now = Date.now(), limit = BEACON_RATE_LIMIT): boolean {
  const cur = HITS.get(viewer);
  if (!cur || now > cur.resetAt) {
    HITS.set(viewer, { n: 1, resetAt: now + 60_000 });
    // Opportunistic sweep so the map cannot grow without bound.
    if (HITS.size > 5000) for (const [k, v] of HITS) if (now > v.resetAt) HITS.delete(k);
    return false;
  }
  cur.n++;
  return cur.n > limit;
}

/**
 * Is this request coming from our own pages?
 *
 * Not a security control — an origin header is trivially set by anything that
 * is not a browser. It is here to stop a *browser* on somebody else's site
 * driving our counter, and to make a scripted caller declare itself.
 */
export function originAllowed(origin: string | null, host: string | null): boolean {
  if (!origin) return true; // same-origin fetches and non-browser callers send none
  try { return !!host && new URL(origin).host === host; } catch { return false; }
}
